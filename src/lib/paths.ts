import type { Lang } from '../i18n/ui';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix a site-internal path with the configured base. External URLs and anchors pass through. */
export function withBase(path: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path)) return path;
  return `${BASE}/${path.replace(/^\//, '')}`;
}

/** Path of a page in the given language, e.g. localPath('cs', '/projects/deuteron/') → '<base>/cs/projects/deuteron/'. */
export function localPath(lang: Lang, path = '/'): string {
  const clean = path.replace(/^\//, '');
  return withBase(lang === 'cs' ? `/cs/${clean}` : `/${clean}`);
}

/** Strip base and language prefix from a pathname → language-neutral page path ('/' or '/projects/x/'). */
export function neutralPath(pathname: string): string {
  let p = pathname;
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  p = p.replace(/^\/cs(\/|$)/, '/');
  return p.startsWith('/') ? p : `/${p}`;
}
