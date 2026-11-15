import type { APIRoute } from 'astro';
import { LANGS } from '../i18n/ui';
import { localPath } from '../lib/paths';
import { onWeb, profile } from '../lib/profile';

// Every page exists in both languages; each URL lists its language twins (hreflang).
export const GET: APIRoute = ({ site }) => {
  const pages = ['/', ...onWeb(profile.featured_projects).map((p) => `/projects/${p.slug}/`)];
  const abs = (lang: (typeof LANGS)[number], page: string) => new URL(localPath(lang, page), site).href;
  const urls = pages.flatMap((page) =>
    LANGS.map((lang) => {
      const twins = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${abs(l, page)}"/>`);
      return `  <url><loc>${abs(lang, page)}</loc>${twins.join('')}</url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
