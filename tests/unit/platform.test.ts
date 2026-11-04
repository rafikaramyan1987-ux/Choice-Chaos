import { describe, expect, it } from 'vitest';
import { GameplayTracker, MidgameThrottle, NoopPlatform, MIDGAME_INTERVAL_MS, midgameAllowed } from '../../src/platform/ads';

describe('midgame ads', () => {
  it('at most one midgame ad every 3 minutes', () => {
    let now = 1_000_000;
    const th = new MidgameThrottle(() => now);
    expect(th.canShow()).toBe(false); // not right after loading
    now += MIDGAME_INTERVAL_MS - 1;
    expect(th.canShow()).toBe(false);
    now += 1;
    expect(th.canShow()).toBe(true);
    th.markShown();
    now += 60_000;
    expect(th.canShow()).toBe(false);
  });
  it('never before day 3 is completed', () => {
    let now = 0;
    const th = new MidgameThrottle(() => now);
    now = MIDGAME_INTERVAL_MS * 10;
    expect(midgameAllowed(1, th)).toBe(false);
    expect(midgameAllowed(2, th)).toBe(false);
    expect(midgameAllowed(3, th)).toBe(true);
  });
});

describe('platform', () => {
  it('gameplay tracker never sends duplicate start/stop events', () => {
    const calls: string[] = [];
    const p = new NoopPlatform();
    p.gameplayStart = () => { calls.push('start'); };
    p.gameplayStop = () => { calls.push('stop'); };
    const g = new GameplayTracker(p);
    g.start(); g.start(); g.stop(); g.stop(); g.start();
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
  it('works without the SDK: rewarded features are granted directly', async () => {
    const p = new NoopPlatform();
    await p.init();
    expect(await p.rewarded()).toBe(true);
    await expect(p.midgame()).resolves.toBeUndefined();
    expect(() => p.happytime()).not.toThrow();
  });
});
