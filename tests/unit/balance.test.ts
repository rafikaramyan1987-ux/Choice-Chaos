/**
 * Balance simulation: a typical player for the first 30 minutes.
 * Prints the reward timeline and checks that something new (reward or unlock)
 * happens at least every 2 minutes during the first 20 minutes.
 */
import { describe, expect, it } from 'vitest';
import { DayRun, buyDecor, buyEquipment, equipmentCost, machineNeeded, newProgress, type Quality } from '../../src/core/game';
import {
  EXPANSIONS,
  cafeEffects,
  claimGift,
  claimLogin,
  expansionStatus,
  fillMissions,
  finishChallenge,
  guestOptions,
  newMeta,
  onServed,
  settleBuilds,
  startBuild,
  startDayMeta,
  CHALLENGE_GUESTS,
  challengeSeed,
  claimDayChest,
  type RewardEvent,
} from '../../src/core/meta';
import { DECOR, MACHINES, actionOf, machineDuration } from '../../src/core/recipes';
import { mulberry32 } from '../../src/core/rng';

interface Line {
  t: number;
  what: string;
}

export function simulate(minutes: number, seed = 1): Line[] {
  const rng = mulberry32(seed);
  const p = newProgress();
  const meta = newMeta();
  const lines: Line[] = [];
  let t = 0;
  const today = '2026-11-05';
  const log = (what: string) => lines.push({ t, what });
  const logEvents = (evs: RewardEvent[]) => {
    for (const e of evs) {
      const r = e.reward;
      const parts = [r.coins ? `${r.coins}c` : '', r.gems ? `${r.gems}g` : '', r.xp ? `${r.xp}xp` : ''].filter(Boolean).join(' ');
      const unl = e.unlocks?.length ? ` + ${e.unlocks.map((u) => `${u.type}:${u.id}`).join(', ')}` : '';
      log(`${e.source} ${e.id} (${parts})${unl}`);
    }
  };
  const quality = (): Quality => {
    const r = rng();
    return r < 0.75 ? 3 : r < 0.93 ? 2 : 1;
  };
  const playOrders = (run: DayRun) => {
    while (!run.finished && t < minutes * 60) {
      const order = run.order!;
      t += 3; // guest walks in
      for (const item of order.items) {
        for (const s of item.steps) {
          const a = actionOf(s);
          t += a === 'tap' ? 1 : a === 'timing' ? 1.5 + machineDuration(0) / 1000 : 2.2;
          run.add(s, a === 'tap' ? 3 : quality(), 0.5);
        }
      }
      const fx = cafeEffects(meta, t * 1000);
      const pay = run.serve(20_000, { tipBonus: fx.tipBonus, bonusStations: fx.bonusStations })!;
      p.coins += pay.total;
      p.gems += pay.gems;
      t += 2.6; // serve animation
      logEvents(settleBuilds(meta, p, t * 1000));
      logEvents(
        onServed(meta, p, { recipes: order.items.map((i) => i.recipe), sizes: order.items.map((i) => i.size), stars: pay.stars, coins: pay.total, special: order.special, kind: order.kind }, rng),
      );
    }
  };
  const shop = () => {
    // buy what's affordable: expansions first, then machines, then decor
    for (const e of EXPANSIONS) {
      if (expansionStatus(meta, p, e.id, t * 1000) === 'buyable' && startBuild(meta, p, e.id, t * 1000)) log(`build ${e.id}`);
    }
    for (const m of MACHINES) {
      const c = equipmentCost(p, m);
      if (c !== null && machineNeeded(p, m) && p.coins >= c + 40 && buyEquipment(p, m)) log(`upgrade ${m}`);
    }
    for (const d of DECOR) if (!p.decor.includes(d.id) && p.coins >= d.cost + 30 && buyDecor(p, d.id)) log(`decor ${d.id}`);
    logEvents(settleBuilds(meta, p, t * 1000));
  };

  fillMissions(meta, p, rng);
  logEvents([claimLogin(meta, p, today)!]);
  let challengeDone = false;
  while (t < minutes * 60) {
    const gift = claimGift(meta, p, t * 1000, rng);
    if (gift) logEvents([gift]);
    shop();
    if (!challengeDone && p.day === 4) {
      challengeDone = true;
      const run = new DayRun(1, p.recipes, mulberry32(challengeSeed(today)), undefined, guestOptions(meta), 0, CHALLENGE_GUESTS);
      startDayMeta(meta);
      playOrders(run);
      logEvents(finishChallenge(meta, p, today, run.summary.stars));
      t += 6;
      continue;
    }
    startDayMeta(meta);
    if (process.env.SIM_DEBUG) log(`missions: ${meta.missions.map((m) => `${m.kind} ${m.progress}/${m.target}`).join(' | ')}`);
    const fx = cafeEffects(meta, t * 1000);
    const run = new DayRun(p.day, p.recipes, rng, undefined, guestOptions(meta), fx.extraGuests);
    t += 2; // day banner
    playOrders(run);
    if (run.finished) {
      log(`day ${p.day} done (+${run.summary.earned}c)`);
      logEvents(claimDayChest(meta, p, p.day, run.summary.served, run.summary.perfect));
      p.day += 1;
      t += 6; // summary
    }
  }
  return lines;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

describe('balance: first 30 minutes', () => {
  it('a new reward or unlock at least every 2 minutes during the first 20 minutes', () => {
    const gaps: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const lines = simulate(30, seed);
      if (seed === Number(process.env.SIM_SEED ?? 1)) console.info(`\n--- first 30 minutes (seed 1) ---\n${lines.map((l) => `${fmt(l.t)}  ${l.what}`).join('\n')}`);
      const rewards = lines.filter((l) => !l.what.startsWith('day ')).map((l) => l.t);
      let last = 0;
      let maxGap = 0;
      for (const t of rewards.filter((x) => x <= 20 * 60)) {
        maxGap = Math.max(maxGap, t - last);
        last = t;
      }
      maxGap = Math.max(maxGap, 20 * 60 - last);
      gaps.push(maxGap);
      expect(maxGap, `seed ${seed}`).toBeLessThanOrEqual(120);
      expect(rewards.filter((x) => x <= 20 * 60).length).toBeGreaterThanOrEqual(15);
    }
    console.info(`max gap per seed (s): ${gaps.map((g) => Math.round(g)).join(', ')}`);
  });
});
