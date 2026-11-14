import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from '../i18n/ui';
import { withBase } from './paths';

/** URL of the generated CV PDF, or null while the file has not been built (phase 4). */
export function cvUrl(lang: Lang): string | null {
  const file = `cv/lukas-hrdy-cv-${lang}.pdf`;
  return existsSync(join(process.cwd(), 'public', file)) ? withBase(`/${file}`) : null;
}
