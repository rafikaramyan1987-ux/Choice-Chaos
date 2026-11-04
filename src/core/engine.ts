import { buildDeck, followUpInsertIndex } from './deck';
import { canSecondChance, detectHit, MAX_TURNS, resolveEnding, type EndingId, type MeterHit } from './endings';
import { computeArchetype, type ArchetypeId } from './archetype';
import { mulberry32, type Rng } from './rng';
import {
  METERS, METER_MAX, METER_MIN, METER_START, startMeters,
  type Effects, type Meters, type SituationDef,
} from './types';

export interface RunEnd {
  ending: EndingId;
  hit?: MeterHit;
  archetype: ArchetypeId;
}

export interface RunState {
  seed: number;
  /** Number of RNG draws consumed so far (lets us rebuild the RNG for undo). */
  rngCalls: number;
  meters: Meters;
  deck: string[];
  pos: number;
  turn: number;
  flags: string[];
  tagCounts: Record<string, number>;
  tendency: Meters;
  swingTotal: number;
  /** Effects applied by the last choice (for UI feedback). */
  lastFx: Effects;
  end: RunEnd | null;
  usedUndo: boolean;
  usedSecondChance: boolean;
}

/** Effects grow a little over the run so every run reaches an ending in ~3–5 minutes. */
export const BASE_EFFECT_SCALE = 0.8;
export function escalation(turn: number): number {
  return BASE_EFFECT_SCALE * (1 + Math.min(turn, MAX_TURNS) * 0.04);
}

export class Library {
  readonly byId = new Map<string, SituationDef>();
  readonly byFlag = new Map<string, SituationDef[]>();
  constructor(readonly situations: readonly SituationDef[]) {
    for (const s of situations) {
      this.byId.set(s.id, s);
      if (s.requires) {
        const list = this.byFlag.get(s.requires) ?? [];
        list.push(s);
        this.byFlag.set(s.requires, list);
      }
    }
  }
  get(id: string): SituationDef {
    const s = this.byId.get(id);
    if (!s) throw new Error(`Unknown situation ${id}`);
    return s;
  }
}

function countingRng(seed: number, skip: number): { rng: Rng; calls: () => number } {
  const base = mulberry32(seed);
  let n = 0;
  for (; n < skip; n++) base();
  return { rng: () => { n++; return base(); }, calls: () => n };
}

export function newRun(lib: Library, seed: number): RunState {
  const { rng, calls } = countingRng(seed, 0);
  const deck = buildDeck(lib.situations, rng);
  return {
    seed,
    rngCalls: calls(),
    meters: startMeters(),
    deck,
    pos: 0,
    turn: 0,
    flags: [],
    tagCounts: {},
    tendency: { money: 0, love: 0, joy: 0, rep: 0 },
    swingTotal: 0,
    lastFx: {},
    end: null,
    usedUndo: false,
    usedSecondChance: false,
  };
}

export function currentSituation(lib: Library, state: RunState): SituationDef | null {
  if (state.end) return null;
  const id = state.deck[state.pos];
  return id ? lib.get(id) : null;
}

function clamp(v: number): number {
  return Math.max(METER_MIN, Math.min(METER_MAX, v));
}

export function scaledEffects(fx: Effects, turn: number): Effects {
  const k = escalation(turn);
  const out: Effects = {};
  for (const m of METERS) {
    const v = fx[m];
    if (v) out[m] = Math.round(v * k);
  }
  return out;
}

function finish(state: RunState, hit: MeterHit | undefined): RunEnd {
  const ending = resolveEnding({
    meters: state.meters, hit, turn: state.turn, flags: state.flags, tagCounts: state.tagCounts,
  });
  const archetype = computeArchetype({
    tendency: state.tendency,
    tagCounts: state.tagCounts,
    avgSwing: state.turn ? state.swingTotal / state.turn : 0,
    choices: state.turn,
  });
  return { ending, hit, archetype };
}

/** Pure: returns a new state after picking `choiceIndex` on the current situation. */
export function applyChoice(lib: Library, prev: RunState, choiceIndex: number): RunState {
  if (prev.end) throw new Error('Run already ended');
  const sit = currentSituation(lib, prev);
  if (!sit) throw new Error('No current situation');
  const choice = sit.choices[choiceIndex];
  if (!choice) throw new Error(`Invalid choice ${choiceIndex} for ${sit.id}`);

  const state: RunState = structuredClone(prev);
  const { rng, calls } = countingRng(state.seed, state.rngCalls);
  const fx = scaledEffects(choice.fx, state.turn);
  const raw: Meters = { ...state.meters };
  let swing = 0;
  for (const m of METERS) {
    const v = fx[m] ?? 0;
    raw[m] += v;
    state.tendency[m] += v;
    swing += Math.abs(v);
  }
  state.swingTotal += swing;
  state.lastFx = fx;
  for (const m of METERS) state.meters[m] = clamp(raw[m]);
  for (const tag of choice.tags ?? []) state.tagCounts[tag] = (state.tagCounts[tag] ?? 0) + 1;

  if (choice.sets && !state.flags.includes(choice.sets)) {
    state.flags.push(choice.sets);
    for (const follow of lib.byFlag.get(choice.sets) ?? []) {
      if (state.deck.includes(follow.id)) continue;
      state.deck.splice(followUpInsertIndex(state.deck.length, state.pos, rng), 0, follow.id);
    }
  }
  state.turn += 1;
  state.pos += 1;
  state.rngCalls = calls();

  const hit = detectHit(raw);
  if (hit) state.end = finish(state, hit);
  else if (state.turn >= MAX_TURNS || state.pos >= state.deck.length) state.end = finish(state, undefined);
  return state;
}

/**
 * "Second chance": continue once after a meter ending. The meter that broke is
 * put back to the starting value and the run goes on.
 */
export function secondChance(state: RunState): RunState {
  if (!state.end || state.usedSecondChance || !canSecondChance(state.end.hit)) {
    throw new Error('Second chance not available');
  }
  const next: RunState = structuredClone(state);
  const hit = next.end?.hit;
  if (hit) next.meters[hit.meter] = METER_START;
  next.end = null;
  next.usedSecondChance = true;
  if (next.pos >= next.deck.length || next.turn >= MAX_TURNS) {
    // Out of material: survive instead.
    next.end = finish(next, undefined);
  }
  return next;
}

/** "Undo my last choice": returns the snapshot taken before that choice, flagged as used. */
export function undo(snapshot: RunState, current: RunState): RunState {
  if (current.usedUndo) throw new Error('Undo already used');
  const restored: RunState = structuredClone(snapshot);
  restored.usedUndo = true;
  restored.usedSecondChance = current.usedSecondChance;
  return restored;
}
