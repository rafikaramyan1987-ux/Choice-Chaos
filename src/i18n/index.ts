import en from './en.json';
import fr from './fr.json';

export interface Locale {
  meta: { name: string; code: string };
  ui: Record<string, string>;
  recipes: Record<string, string>;
  ingredients: Record<string, string>;
  machines: Record<string, string>;
  decor: Record<string, string>;
  achievements: Record<string, string>;
  expansions: Record<string, string>;
  expansionInfo: Record<string, string>;
  guests: Record<string, string>;
}

/**
 * Registered languages. To add one: copy en.json, translate the values,
 * import it here and add it to this object.
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

const fallback = (): Locale => LOCALES[DEFAULT_LANG] as Locale;

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const template = current.ui[key] ?? fallback().ui[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

type Section = 'recipes' | 'ingredients' | 'machines' | 'decor' | 'achievements' | 'expansions' | 'expansionInfo' | 'guests';
export function name(section: Section, id: string): string {
  return current[section][id] ?? fallback()[section][id] ?? id;
}
