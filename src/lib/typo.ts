import type { Lang } from '../i18n/ui';

const NBSP = ' ';

/** Czech typography: no line break after one-letter prepositions/conjunctions. */
export function czechTypo(text: string): string {
  return text.replace(/(?<=^|[\s(„“"])([KkSsVvZzOoUuAaIi]) /g, `$1${NBSP}`);
}

export type Localized = string | { cs: string; en: string };

/** Pick the language variant of a YAML value and apply language-specific typography. */
export function loc(value: Localized | undefined, lang: Lang): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : value[lang];
  return lang === 'cs' ? czechTypo(text) : text;
}
