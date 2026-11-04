import raw from './situations.json';
import type { SituationDef } from '../core/types';

/** All situations (structure + effects). Texts live in src/i18n/<lang>.json. */
export const SITUATIONS: readonly SituationDef[] = raw as SituationDef[];
