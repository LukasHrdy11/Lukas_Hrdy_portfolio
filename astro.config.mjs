// @ts-check
import { defineConfig } from 'astro/config';

// Private project folders live next to the site in the repo root (see PLAN.md §3).
// They must never be watched or scanned by the dev server.
const PRIVATE = [
  'Premke_rakathon',
  'Osteo_agent',
  'Starchip',
  'SST1M',
  'OV-2024-',
  'Efemeridy',
  'světelné křivky',
  'reference',
];

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://lukashrdy11.github.io',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
  vite: {
    server: {
      watch: {
        ignored: [
          ...PRIVATE.map((dir) => `**/${dir}/**`),
          '**/hocs_lattice.html',
          '**/CV.tex',
        ],
      },
    },
  },
});
