import { describe, expect, it } from 'vitest';
import { GameplayTracker, MidgameThrottle, NoopPlatform, MIDGAME_INTERVAL_MS } from '../../src/platform/ads';
import { NullChoiceStats } from '../../src/platform/stats';

describe('midgame throttle', () => {
  it('allows at most one midgame ad every 3 minutes', () => {
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
});

describe('gameplay tracker', () => {
  it('never sends duplicate start/stop events', () => {
    const calls: string[] = [];
    const p = new NoopPlatform();
    p.gameplayStart = () => { calls.push('start'); };
    p.gameplayStop = () => { calls.push('stop'); };
    const g = new GameplayTracker(p);
    g.start(); g.start(); g.stop(); g.stop(); g.start();
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});

describe('stats provider', () => {
  it('returns no numbers without a backend', async () => {
    expect(await new NullChoiceStats().shares()).toBeNull();
  });
});
