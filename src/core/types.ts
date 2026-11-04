export const METERS = ['money', 'love', 'joy', 'rep'] as const;
export type MeterId = (typeof METERS)[number];
export type Meters = Record<MeterId, number>;
export type Effects = Partial<Record<MeterId, number>>;

export type ChoiceTag = 'honest' | 'lie' | 'kind' | 'selfish';

export interface ChoiceDef {
  fx: Effects;
  /** Flag set when this choice is picked (unlocks follow-up situations). */
  sets?: string | null;
  tags?: ChoiceTag[];
}

export type ArtKey =
  | 'office' | 'money' | 'home' | 'neighbor' | 'friends' | 'heart' | 'family' | 'travel'
  | 'weird' | 'food' | 'phone' | 'party' | 'shop' | 'park' | 'pet' | 'storm';

export interface SituationDef {
  id: string;
  topic: string;
  serious: boolean;
  art: ArtKey;
  /** If set, the situation only appears after a choice set this flag. */
  requires?: string | null;
  choices: ChoiceDef[];
}

export const METER_MIN = 0;
export const METER_MAX = 100;
export const METER_START = 50;

export function startMeters(): Meters {
  return { money: METER_START, love: METER_START, joy: METER_START, rep: METER_START };
}
