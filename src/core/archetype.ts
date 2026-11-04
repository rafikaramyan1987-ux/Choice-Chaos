import { METERS, type MeterId, type Meters } from './types';

export const ARCHETYPES = [
  'strategist', 'big_heart', 'free_spirit', 'spotlight_star',
  'tightrope', 'chaos_agent', 'honest_soul', 'smooth_talker',
] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];

export const ARCHETYPE_EMOJI: Record<ArchetypeId, string> = {
  strategist: '🦊', big_heart: '🧸', free_spirit: '🦋', spotlight_star: '🌟',
  tightrope: '🎪', chaos_agent: '🌪️', honest_soul: '🕊️', smooth_talker: '🎭',
};

const PRIMARY: Record<MeterId, ArchetypeId> = {
  money: 'strategist', love: 'big_heart', joy: 'free_spirit', rep: 'spotlight_star',
};

export interface ArchetypeInput {
  /** Sum of all effects actually applied during the run, per meter. */
  tendency: Meters;
  tagCounts: Readonly<Record<string, number>>;
  /** Average absolute effect per choice (how wild the choices were). */
  avgSwing: number;
  choices: number;
}

export function computeArchetype(input: ArchetypeInput): ArchetypeId {
  const lies = input.tagCounts.lie ?? 0;
  const honest = input.tagCounts.honest ?? 0;
  if (lies >= 4 && lies > honest) return 'smooth_talker';
  if (honest >= 6 && honest >= lies * 3) return 'honest_soul';
  if (input.choices >= 4 && input.avgSwing >= 30) return 'chaos_agent';
  const values = METERS.map((m) => input.tendency[m]);
  const spread = Math.max(...values) - Math.min(...values);
  if (input.choices >= 8 && spread < 20) return 'tightrope';
  let best: MeterId = 'money';
  for (const m of METERS) if (input.tendency[m] > input.tendency[best]) best = m;
  return PRIMARY[best];
}
