import en from './en.json';
import fr from './fr.json';

export interface SituationText {
  text: string;
  choices: string[];
}

export interface Locale {
  meta: { name: string; code: string };
  ui: Record<string, string>;
  endings: Record<string, { title: string; text: string }>;
  endings_hint: Record<string, string>;
  archetypes: Record<string, { name: string; desc: string }>;
  situations: Record<string, SituationText>;
}

/**
 * Registered languages. To add German: create de.json (copy en.json and translate),
 * import it here and add `de` to this object. Nothing else needs to change.
 */
export const LOCALES: Record<string, Locale> = { en, fr };
export const DEFAULT_LANG = 'en';

export function detectLanguage(preferred: readonly string[] | undefined): string {
  for (const tag of preferred ?? []) {
    const code = tag.toLowerCase().split('-')[0] ?? '';
    if (code in LOCALES) return code;
  }
  return DEFAULT_LANG;
}

let current: Locale = LOCALES[DEFAULT_LANG] as Locale;

export function setLanguage(code: string): void {
  current = LOCALES[code] ?? (LOCALES[DEFAULT_LANG] as Locale);
  if (typeof document !== 'undefined') document.documentElement.lang = current.meta.code;
}

export function lang(): string {
  return current.meta.code;
}

function fallback(): Locale {
  return LOCALES[DEFAULT_LANG] as Locale;
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const template = current.ui[key] ?? fallback().ui[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function situationText(id: string): SituationText {
  return current.situations[id] ?? fallback().situations[id] ?? { text: id, choices: [] };
}

export function endingText(id: string): { title: string; text: string } {
  return current.endings[id] ?? fallback().endings[id] ?? { title: id, text: '' };
}

export function endingHint(id: string): string {
  return current.endings_hint[id] ?? fallback().endings_hint[id] ?? '';
}

export function archetypeText(id: string): { name: string; desc: string } {
  return current.archetypes[id] ?? fallback().archetypes[id] ?? { name: id, desc: '' };
}
