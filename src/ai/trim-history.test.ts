import { isMessage, MAX_MESSAGES, trimHistory, type Message } from './trim-history';

const user = (text: string): Message => ({ role: 'user', text });
const bot = (text: string): Message => ({ role: 'assistant', text });

/** n alternating turns starting with the user, so index 0 is always a question. */
const thread = (n: number): Message[] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? user(`s${i}`) : bot(`c${i}`)));

describe('trimHistory', () => {
  it('leaves a short conversation alone', () => {
    const messages = thread(4);
    expect(trimHistory(messages)).toEqual(messages);
  });

  it('returns nothing for nothing', () => {
    expect(trimHistory([])).toEqual([]);
  });

  it('never keeps more than the cap', () => {
    expect(trimHistory(thread(100)).length).toBeLessThanOrEqual(MAX_MESSAGES);
  });

  it('keeps the most recent turns, not the oldest', () => {
    const trimmed = trimHistory(thread(100));
    expect(trimmed[trimmed.length - 1]).toEqual(bot('c99'));
  });

  /**
   * The rule that makes the trim safe: replaying a history that opens on an
   * answer reads to the model as if the question went missing, and it starts
   * explaining things nobody asked about.
   */
  it('never opens on an assistant turn', () => {
    for (const n of [31, 32, 33, 60, 101]) {
      expect(trimHistory(thread(n))[0].role).toBe('user');
    }
  });

  it('drops a leading answer rather than keeping it', () => {
    const trimmed = trimHistory([bot('yanıt'), user('soru'), bot('cevap')]);
    expect(trimmed).toEqual([user('soru'), bot('cevap')]);
  });

  /** All answers and no questions has no safe starting point; keep it as-is
   *  rather than returning an empty history and losing the thread entirely. */
  it('keeps a history with no user turn at all', () => {
    const onlyBot = [bot('a'), bot('b')];
    expect(trimHistory(onlyBot)).toEqual(onlyBot);
  });

  it('does not mutate what it was given', () => {
    const messages = thread(60);
    const before = messages.length;
    trimHistory(messages);
    expect(messages).toHaveLength(before);
  });
});

describe('isMessage', () => {
  it('accepts a real turn, with or without a display string', () => {
    expect(isMessage({ role: 'user', text: 'merhaba' })).toBe(true);
    expect(isMessage({ role: 'assistant', text: 'raw', display: 'temiz' })).toBe(true);
  });

  /**
   * Storage can hand back anything — a half-written entry, a value from an older
   * version. A bad row must be dropped rather than replayed to the model as a
   * turn with `undefined` in it.
   */
  it.each([
    null,
    undefined,
    'merhaba',
    42,
    {},
    { role: 'user' },
    { text: 'merhaba' },
    { role: 'system', text: 'merhaba' },
    { role: 'user', text: 42 },
  ])('rejects %p', (value) => {
    expect(isMessage(value)).toBe(false);
  });
});
