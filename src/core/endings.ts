import type { MeterId, Meters } from './types';

export type Direction = 'low' | 'high';
export interface MeterHit {
  meter: MeterId;
  dir: Direction;
}

/** 8 meter endings (one per meter and direction). */
export const METER_ENDINGS = [
  'money_low', 'money_high', 'love_low', 'love_high',
  'joy_low', 'joy_high', 'rep_low', 'rep_high',
] as const;

/** 12 special endings for rare combinations. */
export const SPECIAL_ENDINGS = [
  'zen_master', 'marathon', 'speedrun', 'pinocchio', 'cat_royalty',
  'lonely_tycoon', 'happy_pauper', 'broke_beloved', 'famous_miserable',
  'shameless_legend', 'carefree_chaos', 'respected_loner',
] as const;

export type EndingId = (typeof METER_ENDINGS)[number] | (typeof SPECIAL_ENDINGS)[number];
export const ALL_ENDINGS: readonly EndingId[] = [...METER_ENDINGS, ...SPECIAL_ENDINGS];

export const ENDING_EMOJI: Record<EndingId, string> = {
  money_low: '🪙', money_high: '🐉', love_low: '🏝️', love_high: '🤗',
  joy_low: '🌧️', joy_high: '🎈', rep_low: '🤡', rep_high: '🗿',
  zen_master: '🧘', marathon: '🏃', speedrun: '⏱️', pinocchio: '🤥', cat_royalty: '🐈',
  lonely_tycoon: '🏰', happy_pauper: '🌻', broke_beloved: '💞', famous_miserable: '📸',
  shameless_legend: '😎', carefree_chaos: '🌀', respected_loner: '🦉',
};

/** Number of choices after which a run ends with a "survivor" ending. */
export const MAX_TURNS = 30;
export const SPEEDRUN_TURNS = 6;
export const LIE_COUNT_FOR_PINOCCHIO = 6;
export const COMBO_LOW = 25;
export const COMBO_HIGH = 70;
export const ZEN_RANGE: readonly [number, number] = [35, 65];

export interface EndingContext {
  meters: Meters;
  /** Meter that hit a limit; undefined when the player survived MAX_TURNS. */
  hit?: MeterHit;
  turn: number;
  flags: readonly string[];
  tagCounts: Readonly<Record<string, number>>;
}

/** Finds which meter (if any) reached 0 or 100. Raw (unclamped) values pick the biggest overflow. */
export function detectHit(raw: Meters): MeterHit | undefined {
  let best: { hit: MeterHit; over: number } | undefined;
  for (const meter of Object.keys(raw) as MeterId[]) {
    const v = raw[meter];
    let over = 0;
    let dir: Direction | undefined;
    if (v <= 0) { over = -v; dir = 'low'; }
    else if (v >= 100) { over = v - 100; dir = 'high'; }
    if (dir && (!best || over > best.over)) best = { hit: { meter, dir }, over };
  }
  return best?.hit;
}

export function resolveEnding(ctx: EndingContext): EndingId {
  const { meters, hit, turn, flags, tagCounts } = ctx;
  if (!hit) {
    const zen = Object.values(meters).every((v) => v >= ZEN_RANGE[0] && v <= ZEN_RANGE[1]);
    return zen ? 'zen_master' : 'marathon';
  }
  if (turn <= SPEEDRUN_TURNS) return 'speedrun';
  if ((tagCounts.lie ?? 0) >= LIE_COUNT_FOR_PINOCCHIO) return 'pinocchio';
  if (flags.includes('has_cat') && hit.dir === 'high' && (hit.meter === 'joy' || hit.meter === 'love')) {
    return 'cat_royalty';
  }
  const m = meters;
  const key = `${hit.meter}_${hit.dir}` as const;
  switch (key) {
    case 'money_high': if (m.love <= COMBO_LOW) return 'lonely_tycoon'; break;
    case 'money_low': if (m.joy >= COMBO_HIGH) return 'happy_pauper'; break;
    case 'love_high': if (m.money <= COMBO_LOW) return 'broke_beloved'; break;
    case 'rep_high': if (m.joy <= COMBO_LOW) return 'famous_miserable'; break;
    case 'rep_low': if (m.joy >= COMBO_HIGH) return 'shameless_legend'; break;
    case 'joy_high': if (m.rep <= COMBO_LOW) return 'carefree_chaos'; break;
    case 'love_low': if (m.rep >= COMBO_HIGH) return 'respected_loner'; break;
    default: break;
  }
  return key;
}

/** Second chance is only offered for meter endings (not for surviving the whole run). */
export function canSecondChance(hit: MeterHit | undefined): boolean {
  return hit !== undefined;
}
