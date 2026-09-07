/**
 * The ONLY place that knows how the app reaches the assistant.
 *
 * Screens call `ask()` and never see a URL or a key.
 *
 * No provider key lives here. One used to arrive through an EXPO_PUBLIC_
 * variable, which Expo inlines into the bundle as plain text — readable by
 * anyone who unpacked the app, with every install sharing one quota. Requests
 * now go to our own Edge Function (`supabase/functions/ai-proxy`), which holds
 * the key server-side and is the only thing that knows which provider answers.
 *
 * What still ships in the bundle is the Supabase **anon key**. That is by
 * design — it is a public identifier, not a secret. It is not what authorises
 * the request either: the proxy requires the signed-in user's own token, so the
 * quota is spent by people with accounts rather than by anyone who found the URL.
 */

import { supabase } from '@/server/supabase';

/** One turn of the conversation, provider-independent. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /**
   * A photo to look at, base64 without the `data:` prefix.
   *
   * Still provider-independent: the proxy decides how its provider wants an
   * image expressed, exactly as it already does for the reply shape.
   */
  image?: { data: string; mimeType: 'image/jpeg' | 'image/png' };
}

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until the Supabase values are in `.env.local`; the chat screen says so. */
export function isAssistantConfigured(): boolean {
  return supabaseUrl.length > 0 && anonKey.length > 0;
}

/** Thrown for anything the user could act on (not set up, quota, offline). */
export class AskError extends Error {}

/**
 * Send the conversation and return the assistant's reply text.
 *
 * The proxy answers `{ text }` — pulling the answer out of the provider's
 * response shape is its job, not ours, so a provider change never reaches here.
 */
export async function ask(turns: ChatTurn[], systemInstruction: string): Promise<string> {
  if (!isAssistantConfigured()) {
    throw new AskError('Yardımcı henüz kurulmadı.');
  }

  // The signed-in user's own token, not the anon key. The anon key ships in
  // every copy of the app, so it identifies the app, not a person — and the
  // proxy now insists on knowing who is spending the quota.
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new AskError('Bu işlem için giriş yapmalısın.');

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        // Supabase's gateway wants this too, independent of who the user is.
        apikey: anonKey,
      },
      body: JSON.stringify({ turns, systemInstruction }),
    });
  } catch {
    throw new AskError('Bağlantı kurulamadı. İnternetini kontrol et.');
  }

  if (!response.ok) {
    throw new AskError(await describeFailure(response));
  }

  const text = readText(await response.json());
  if (!text) throw new AskError('Model boş yanıt döndü. Tekrar dene.');
  return text;
}

/**
 * Turn an HTTP failure into something worth showing the user.
 *
 * The proxy forwards the provider's status code unchanged, so this mapping keeps
 * working: 429 still means the free tier's rate limit, whoever produced it.
 */
async function describeFailure(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message ?? '';
  } catch {
    // Body wasn't JSON; the status alone will have to do.
  }

  if (response.status === 401) {
    // The token expired or was revoked while the app sat open.
    return 'Oturumun sona ermiş. Çıkış yapıp tekrar gir.';
  }
  if (response.status === 403) {
    return 'Yardımcıya erişim reddedildi.';
  }
  if (response.status === 429) {
    // Two different 429s reach here and they need different words. Ours carries a
    // message ("bugünlük hakkın doldu") and says something the user can act on;
    // the provider's own rate limit carries none. Overwriting the detail meant
    // the quota message never reached anyone.
    return detail || 'Yardımcı şu an çok yoğun. Biraz bekleyip tekrar dene.';
  }
  if (response.status === 503) {
    return detail || 'Yardımcı şu an kullanılamıyor.';
  }
  return `Yardımcı hatası (${response.status}). ${detail}`.trim();
}

/** The proxy's contract is one field; anything else is a failed response. */
function readText(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const value = (data as { text?: unknown }).text;
  return typeof value === 'string' ? value.trim() : '';
}
