import type { Lang } from '../i18n/ui';

const NBSP = ' ';

/** No line break between a number and its unit, or around a multiplication sign. */
export function bindUnits(text: string): string {
  return text
    .replace(/(\d) (?=(?:%|MeV|eV|fm|Hz|K|px)(?![\p{L}\d]))/gu, `$1${NBSP}`)
    .replace(/(\d) × (?=\d)/g, `$1${NBSP}×${NBSP}`);
}

/** Czech typography: no line break after one-letter prepositions/conjunctions or inside a date. */
export function czechTypo(text: string): string {
  return text
    .replace(/(?<=^|[\s(„“"])([KkSsVvZzOoUuAaIi]) /g, `$1${NBSP}`)
    .replace(/(\d\.) (?=\d)/g, `$1${NBSP}`);
}

/** Language-specific typography for a plain string (UI dictionary texts). */
export const typoFor = (lang: Lang) => (text: string): string =>
  bindUnits(lang === 'cs' ? czechTypo(text) : text);

export type Localized = string | { cs: string; en: string };

/** Pick the language variant of a YAML value and apply language-specific typography. */
export function loc(value: Localized | undefined, lang: Lang): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : value[lang];
  return typoFor(lang)(text);
}
