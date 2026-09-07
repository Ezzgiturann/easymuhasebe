import { addDays, daysBetween, fromLocalDay, monthRange, prevMonthRange, toLocalDay } from './dates';

describe('toLocalDay / fromLocalDay', () => {
  it('formats a local date without drifting to UTC', () => {
    // Late evening is where a UTC-based conversion would roll over to tomorrow.
    expect(toLocalDay(new Date(2026, 7, 6, 23, 30))).toBe('2026-08-06');
  });

  it('pads single digits', () => {
    expect(toLocalDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trips', () => {
    expect(toLocalDay(fromLocalDay('2026-02-29' /* not a real date */))).toBe('2026-03-01');
    expect(toLocalDay(fromLocalDay('2026-08-06'))).toBe('2026-08-06');
  });
});

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('goes backwards too', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('leaves the day alone for zero', () => {
    expect(addDays('2026-08-06', 0)).toBe('2026-08-06');
  });
});

describe('daysBetween', () => {
  it('counts whole days forward and back', () => {
    expect(daysBetween('2026-07-07', '2026-08-06')).toBe(30);
    expect(daysBetween('2026-08-06', '2026-08-01')).toBe(-5);
    expect(daysBetween('2026-08-06', '2026-08-06')).toBe(0);
  });

  /** Turkey has no DST any more, but the arithmetic should not depend on that. */
  it('spans a year without losing or gaining a day', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });
});

describe('monthRange', () => {
  it('covers the whole month', () => {
    expect(monthRange('2026-08-06')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('handles short months and leap Februaries', () => {
    expect(monthRange('2026-02-15').end).toBe('2026-02-28');
    expect(monthRange('2028-02-15').end).toBe('2028-02-29');
    expect(monthRange('2026-04-30').end).toBe('2026-04-30');
  });
});

describe('prevMonthRange', () => {
  it('covers the whole previous month', () => {
    expect(prevMonthRange('2026-08-06')).toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });

  /** The case a "month - 1" implementation gets wrong. */
  it('steps back across the new year', () => {
    expect(prevMonthRange('2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });

  it('lands on the right end for a short previous month', () => {
    expect(prevMonthRange('2026-03-31')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(prevMonthRange('2028-03-01').end).toBe('2028-02-29');
  });

  it('is the same answer from any day of the month', () => {
    expect(prevMonthRange('2026-08-01')).toEqual(prevMonthRange('2026-08-31'));
  });
});
