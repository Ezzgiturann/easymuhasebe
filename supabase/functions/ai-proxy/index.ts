/**
 * The assistant's server side.
 *
 * WHY THIS EXISTS: the Gemini key used to travel inside the app bundle via
 * EXPO_PUBLIC_GEMINI_API_KEY. Expo inlines those at build time, so the key was
 * readable by anyone who unpacked the app and every install shared one quota.
 * Here it lives in the function's environment and never leaves the server.
 *
 * WHY IT SPEAKS OUR SHAPE, NOT GEMINI'S: the phone sends `{ turns,
 * systemInstruction }` and gets back `{ text }`. Everything Gemini-specific —
 * the model name, the odd `input` envelope, which response steps hold the answer
 * — lives only here. Changing model, or swapping provider entirely, is a
 * function deploy; the app does not need a new release.
 *
 * Runs on Deno, not Node. `Deno.serve` and `Deno.env` are the runtime's own
 * APIs; there is no package.json for this file.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/** One turn of the conversation, as the app sends it. */
interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** A receipt photo, base64 without the data: prefix. */
  image?: { data: string; mimeType: string };
}

/** What the model will look at. Anything else is refused rather than forwarded. */
const IMAGE_TYPES = ['image/jpeg', 'image/png'];

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.6-flash';

/**
 * How long the model may deliberate before it starts answering.
 *
 * Left unset, "kasada 1500 var, Ahmet 250 borçlu, toplam alacağım?" cost 248
 * thinking tokens against 8 tokens of answer — measured 14s, and 32s at 'high'.
 * Nearly all of the wait the user complained about was this, not the network and
 * not the answer itself.
 *
 * 'low' rather than 'minimal': the questions here are small sums over a snapshot
 * that is already in the prompt, but they are sums about money, and 'minimal'
 * leaves no room to notice that a cash balance is not a receivable. Accuracy is
 * bought back in the system prompt, which is the cheaper place to buy it.
 */
const THINKING_LEVEL = 'low';

/**
 * A ceiling on what we will forward. The conversation is trimmed to ~30 turns on
 * the phone, but the phone is not the only thing that can call this URL — and
 * every forwarded byte is billed to our quota.
 */
const MAX_TURNS = 60;
const MAX_CHARS = 200_000;

/**
 * Images are measured separately, not folded into MAX_CHARS.
 *
 * One base64 receipt photo is several hundred thousand characters on its own, so
 * a single shared ceiling would have to be raised past the point where it still
 * protects the text side — and the text side is where a runaway conversation
 * would otherwise send us. Two limits, two purposes.
 *
 * ~2M base64 chars is roughly a 1.5 MB file: far above what the phone sends after
 * resizing, and far below what would be worth forwarding.
 */
const MAX_IMAGE_CHARS = 2_000_000;

/**
 * How much of the shared Gemini budget one person may spend in a day.
 *
 * The limit is per project, not per key, so every install draws on one bucket.
 * Without a share-out, the first heavy user of the morning decides whether
 * anyone else gets an answer — and the others see a rate-limit error with no way
 * to know why. These numbers are set well above ordinary use: a shopkeeper asks
 * a handful of questions and enters a few dozen receipts.
 *
 * Images are capped lower because they cost more to process, not because they
 * matter less.
 */
const DAILY_TEXT = 50;
const DAILY_IMAGE = 30;

/** Native apps send no preflight, but a browser (or `supabase functions serve`) does. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Everything arriving over the wire is untrusted; nothing here is assumed well-formed. */
function readTurns(value: unknown): ChatTurn[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TURNS) return null;

  const turns: ChatTurn[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { role, text, image } = raw as { role?: unknown; text?: unknown; image?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof text !== 'string') return null;

    if (image === undefined || image === null) {
      turns.push({ role, text });
      continue;
    }

    if (typeof image !== 'object') return null;
    const { data, mimeType } = image as { data?: unknown; mimeType?: unknown };
    if (typeof data !== 'string' || data.length === 0) return null;
    // An unexpected media type is rejected here rather than passed on: we would
    // be spending our quota to have the provider tell us the same thing.
    if (typeof mimeType !== 'string' || !IMAGE_TYPES.includes(mimeType)) return null;
    turns.push({ role, text, image: { data, mimeType } });
  }
  return turns;
}

/**
 * Pull the reply out of Gemini's response.
 *
 * Reads `model_output` steps ONLY. The response also carries `thought` steps,
 * and collecting every step indiscriminately would splice the model's reasoning
 * into the answer the user reads — a real bug, found by watching live responses.
 * `output_text` is documented as a convenience field but was absent from every
 * observed response; it stays as a fallback, not the primary path.
 */
function extractText(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const body = data as { output_text?: unknown; steps?: unknown };

  if (Array.isArray(body.steps)) {
    const parts: string[] = [];
    for (const step of body.steps) {
      const { type, content } = (step ?? {}) as { type?: unknown; content?: unknown };
      if (type !== 'model_output' || !Array.isArray(content)) continue;
      for (const block of content) {
        const value = (block as { text?: unknown })?.text;
        if (typeof value === 'string') parts.push(value);
      }
    }
    if (parts.length > 0) return parts.join('').trim();
  }

  if (typeof body.output_text === 'string') return body.output_text.trim();
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: { message: 'POST bekleniyor.' } }, 405);

  /**
   * Who is asking?
   *
   * The anon key alone is not an answer — it ships inside every copy of the app,
   * so "has the anon key" means "has the app", not "is a customer". Only a token
   * the auth server signed for a specific person counts, and this is what turns
   * the quota from "anyone who found the URL" into "people with accounts".
   *
   * `getUser` is asked rather than trusted-by-decoding: it verifies against the
   * auth service, so the check holds even if the platform's own JWT gate is ever
   * turned off in config.
   */
  const authHeader = req.headers.get('Authorization') ?? '';
  const auth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: { message: 'Bu işlem için giriş yapmalısın.' } }, 401);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!apiKey) {
    // A deployment problem, not the user's problem — say so plainly in the log
    // and give the app something honest to show.
    console.error('GEMINI_API_KEY is not set on this function.');
    return json({ error: { message: 'Yardımcı şu an yapılandırılmamış.' } }, 503);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: 'Geçersiz istek gövdesi.' } }, 400);
  }

  const { turns: rawTurns, systemInstruction } = (payload ?? {}) as {
    turns?: unknown;
    systemInstruction?: unknown;
  };

  const turns = readTurns(rawTurns);
  if (!turns) return json({ error: { message: 'Konuşma okunamadı.' } }, 400);
  if (typeof systemInstruction !== 'string') {
    return json({ error: { message: 'Yönerge okunamadı.' } }, 400);
  }

  const textSize = systemInstruction.length + turns.reduce((n, t) => n + t.text.length, 0);
  if (textSize > MAX_CHARS) return json({ error: { message: 'İstek çok büyük.' } }, 413);

  const imageSize = turns.reduce((n, t) => n + (t.image?.data.length ?? 0), 0);
  if (imageSize > MAX_IMAGE_CHARS) {
    return json({ error: { message: 'Fotoğraf çok büyük.' } }, 413);
  }

  // Read from the body, not from anything the caller declares: a client that got
  // to label its own request would label every scan as cheap text.
  const kind = turns.some((t) => t.image) ? 'image' : 'text';
  const limit = kind === 'image' ? DAILY_IMAGE : DAILY_TEXT;

  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (projectUrl && serviceKey) {
    const admin = createClient(projectUrl, serviceKey);
    const { data: allowed, error: quotaError } = await admin.rpc('claim_ai_quota', {
      p_user: userData.user.id,
      p_kind: kind,
      p_limit: limit,
    });

    if (quotaError) {
      // Let it through. The quota shares a budget out fairly; being unable to
      // read the counter is not a reason to stop a working app, and failing
      // closed here would turn a database hiccup into an outage.
      console.error('quota check failed:', quotaError.message);
    } else if (!allowed) {
      return json(
        {
          error: {
            message:
              kind === 'image'
                ? 'Bugünlük fiş tarama hakkın doldu, yarın yenilenir.'
                : 'Bugünlük yardımcı hakkın doldu, yarın yenilenir.',
          },
        },
        429,
      );
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: MODEL,
        generation_config: { thinking_level: THINKING_LEVEL },
        // Stateless: the whole history is resent each time and Google keeps no
        // thread of its own.
        store: false,
        system_instruction: systemInstruction,
        // 'model_output' is what the API accepts for an assistant turn — the
        // docs say 'model_response', which is rejected with a 400.
        input: turns.map((turn) => ({
          type: turn.role === 'user' ? 'user_input' : 'model_output',
          // Image first, then the text. The instruction that follows a picture
          // reads as being about that picture; the other order leaves the model
          // deciding what the words referred to before it had seen anything.
          content: [
            ...(turn.image
              ? [{ type: 'image', data: turn.image.data, mime_type: turn.image.mimeType }]
              : []),
            { type: 'text', text: turn.text },
          ],
        })),
      }),
    });
  } catch (e) {
    console.error('upstream fetch failed', e);
    return json({ error: { message: 'Yardımcıya ulaşılamadı.' } }, 502);
  }

  if (!upstream.ok) {
    // Pass the status through unchanged: the app turns 400/403/429 into different
    // Turkish messages, and rewriting the status here would break that mapping.
    // The upstream detail is logged but NOT returned — it can name the key.
    let detail = '';
    try {
      detail = JSON.stringify(await upstream.json());
    } catch {
      /* not JSON; status alone will do */
    }
    console.error(`gemini ${upstream.status}: ${detail}`);
    return json({ error: { message: 'Model isteği reddetti.' } }, upstream.status);
  }

  const text = extractText(await upstream.json());
  if (!text) return json({ error: { message: 'Model boş yanıt döndü.' } }, 502);

  return json({ text }, 200);
});
