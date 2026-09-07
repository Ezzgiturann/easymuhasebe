import { hashesMatch } from './hashing';

describe('hashesMatch', () => {
  it('matches identical hashes', () => {
    expect(hashesMatch('abc123', 'abc123')).toBe(true);
  });

  it('rejects a difference in the last character', () => {
    expect(hashesMatch('abc123', 'abc124')).toBe(false);
  });

  it('rejects a difference in the first character', () => {
    expect(hashesMatch('abc123', 'zbc123')).toBe(false);
  });

  it('rejects a prefix, which a truncated read could produce', () => {
    expect(hashesMatch('abc123', 'abc')).toBe(false);
  });

  it('rejects an empty candidate against a real hash', () => {
    expect(hashesMatch('abc123', '')).toBe(false);
  });
});
