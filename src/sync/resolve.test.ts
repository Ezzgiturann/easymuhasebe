import { incomingWins, isDeleted } from './resolve';

const at = (updatedAt: number, deviceId: string | null = 'dev-a') => ({ updatedAt, deviceId });

describe('incomingWins', () => {
  it('takes the newer copy', () => {
    expect(incomingWins(at(100), at(200))).toBe(true);
  });

  it('keeps ours when it is newer', () => {
    expect(incomingWins(at(200), at(100))).toBe(false);
  });

  /**
   * The tiebreak is arbitrary but must be *stable*: both phones run this with the
   * arguments swapped and have to reach opposite answers, or they each keep their
   * own copy and never converge.
   */
  it('breaks an exact tie the same way from both sides', () => {
    const a = at(500, 'dev-a');
    const b = at(500, 'dev-b');
    expect(incomingWins(a, b)).toBe(true);
    expect(incomingWins(b, a)).toBe(false);
  });

  it('never lets a row beat itself', () => {
    const same = at(500, 'dev-a');
    expect(incomingWins(same, same)).toBe(false);
  });

  it('prefers a stamped row over one from before sync existed', () => {
    expect(incomingWins(at(500, null), at(500, 'dev-a'))).toBe(true);
    expect(incomingWins(at(500, 'dev-a'), at(500, null))).toBe(false);
  });

  /** A delete is an ordinary edit: newer wins, older does not resurrect. */
  it('lets a newer delete win but not an older one', () => {
    expect(incomingWins(at(100), at(200))).toBe(true);
    expect(incomingWins(at(300), at(200))).toBe(false);
  });
});

describe('isDeleted', () => {
  it('reads the tombstone', () => {
    expect(isDeleted({ deletedAt: 1 })).toBe(true);
    expect(isDeleted({ deletedAt: null })).toBe(false);
  });

  /** Epoch 0 is a real timestamp, and `!0` would call the row alive. */
  it('treats zero as deleted, not as missing', () => {
    expect(isDeleted({ deletedAt: 0 })).toBe(true);
  });
});
