import { describe, expect, it } from 'vitest';
import { dailySeed, dailySituationId, dateKeyUTC } from '../../src/core/daily';
import { SITUATIONS } from '../../src/data';

describe('daily situation', () => {
  it('uses the UTC date', () => {
    expect(dateKeyUTC(new Date('2026-03-05T23:30:00-05:00'))).toBe('2026-03-06');
    expect(dateKeyUTC(new Date('2026-12-31T10:00:00Z'))).toBe('2026-12-31');
  });

  it('is the same for everyone on the same day, independent of file order', () => {
    const a = dailySituationId(SITUATIONS, '2026-11-04');
    const b = dailySituationId([...SITUATIONS].reverse(), '2026-11-04');
    expect(a).toBe(b);
    expect(dailySeed('2026-11-04')).toBe(dailySeed('2026-11-04'));
  });

  it('never picks a follow-up and varies across days', () => {
    const ids = new Set<string>();
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 60; d++) {
      const id = dailySituationId(SITUATIONS, dateKeyUTC(new Date(start + d * 86400000)));
      expect(SITUATIONS.find((s) => s.id === id)?.requires).toBeFalsy();
      ids.add(id);
    }
    expect(ids.size).toBeGreaterThan(30);
  });
});
