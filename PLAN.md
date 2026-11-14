# PLAN — Lukáš Hrdý portfolio (build brief for Claude Fable 5.2)

> You (Fable) build this site **from scratch** following this plan. Everything you need
> (decisions, facts, content, data, assets) is already prepared. Do **not** research,
> re-derive facts, or open the private project folders. Your job: architecture, design,
> visualizations, code quality. Work **one phase per session**, then stop for review.

## ▶ Status (update at the end of every approved phase)

| Phase | State | Notes |
|---|---|---|
| 1 Foundation + design system + all pages (1a ⏸, 1b) | ✅ done 2026-11-14 | Subpages show static drawings (`VizGlyph.astro`) where phase 3 puts the visualizations; hero is a static SVG (`HeroScene.astro`, keep as WebGL fallback); CV links appear once `public/cv/*.pdf` exist; three/d3 not installed yet |
| 2 Hero: live 3D Solar System | ⬜ todo | |
| 3 Project visualizations (3a kMC ⏸, 3b rest) | ⬜ todo | |
| 4 CV generator (YAML → 2 PDFs) + CI | ⬜ todo | |
| 5 Polish, a11y, SEO, final review | ⬜ todo | |

Feedback log (Lukáš's review comments that change the plan go here):
- 2026-11-14: the deuteron internship was at the Institute of Physics (Fyzikální ústav AV ČR), not the Nuclear Physics Institute — fixed in `content/profile.yaml`.
- 2026-11-14: Lukáš asked whether a live interactive simulation is possible; a small in-browser kMC (clearly labelled as a simplified model) was offered as an optional addition to phase 3 — not decided, ask before building.

---

## 0. Working protocol (read every session)

1. **Start of session:** read `CLAUDE.md`, then this file's Status + the section of the current phase. Do not read other phases' sections in detail.
2. **Dev server:** start `npm run dev -- --host` in the **background** (after phase 1 exists) and tell Lukáš the URL (`http://localhost:4321/…`). He reviews visually in his own browser while you work — you do **not** take screenshots.
3. **End of phase:** `npm run build` must pass with zero errors. Then write ≤10 lines of what changed + exact URLs to look at, and end your message with:
   **`⏸ FÁZE N HOTOVÁ — zkontroluj prosím v prohlížeči a napiš OK nebo připomínky.`**
   Then STOP and wait.
4. **After Lukáš's OK:** commit (conventional message), `git push`, update the Status table above (+ feedback log if the plan changed), commit that too. Then tell him: „Napiš `/clear` a pak: *Pokračuj fází N+1 podle PLAN.md*“.
5. **Subagents:** allowed for mechanical work (installs, build-error hunting, CV LaTeX, repetitive edits). **Always pass `model: "opus"` explicitly on every Agent call. Never use `subagent_type: "fork"`** (forks run on Fable and burn its limit). Give subagents precise file paths and acceptance criteria.
6. **Token economy:** never Read whole `public/data/*.json` (they are large) — the schemas are below; peek with `head -c 400` or `node -e` if needed. Read `reference/kmc-viewer-reference.js` only in phase 3. Don't re-read files you just wrote.
7. If the usage limit is close, finish the current sub-step so `main` builds, commit, push, update Status. A half-finished phase must still leave a working site.

## 1. Decisions already made (do not re-litigate)

- **Audience:** primarily science (research groups, supervisors, internships abroad), also industry and the public. Tone: a scientist's calling card — concise, factual, no hype, no buzzwords.
- **Languages:** English default at `/`, Czech at `/cs/` (same page structure). Language switch in the header keeps the current page. All strings come from `content/profile.yaml` (`cs`/`en` keys) or a small UI dictionary `src/i18n/ui.ts`.
- **Style:** dark only, space theme, *elegant and uncluttered* (Lukáš: „nechci to mít přeplácané“). One real interactive centerpiece (hero) + one visualization per featured project. Restraint everywhere else.
- **Structure:** one main page with everything briefly; each featured project opens a **short subpage** `/projects/<slug>/` (2–3 paragraphs, key results, one visualization, links). Other projects are compact cards without subpages.
- **Privacy:** only e-mail (obfuscated against bots, e.g. assembled in JS / `mailto` built at runtime) + links. **No** phone, address, birth date anywhere. Nothing from the medical projects beyond the generic text in YAML.
- **No analytics, no cookies, no third-party trackers.** No “built with Claude/AI” credit.
- **Hosting:** GitHub Pages via GitHub Actions now (`https://lukashrdy11.github.io/Lukas_Hrdy_portfolio/`), custom domain `lukashrdy.cz` later. ⇒ **base path must be configurable** (see §3).
- **Cost:** 0 Kč besides the domain. Static site only.

## 2. Pinned stack (Node on this machine is v20.20.1)

| Package | Version | Note |
|---|---|---|
| `astro` | **5.18.2** | Astro 6/7 need Node ≥22 — do NOT upgrade |
| `three` | 0.187.0 | hero + kMC crystal |
| `d3` (or submodules `d3-scale d3-shape d3-axis d3-selection`) | 7.9.2 | charts |
| `js-yaml` | latest 4.x | read `content/profile.yaml` (or Astro's built-in YAML import) |
| fonts | `@fontsource/*` (self-hosted) | no Google Fonts requests at runtime |

No UI framework is required; use Astro components + vanilla TS islands (`<script>` modules, loaded on visibility). Keep JS small; three.js only on pages that use it.

## 3. Base path / deployment (blocking — get this right in phase 1)

- `astro.config.mjs`: `site: process.env.SITE_URL ?? 'https://lukashrdy11.github.io'`, `base: process.env.BASE_PATH ?? '/'`, `trailingSlash: 'always'`.
- **Every** internal URL (links, `/data/*.json` fetches, `/media/*`, YAML paths that start with `/`) must go through a helper `withBase(path)` using `import.meta.env.BASE_URL`. Test by building with `BASE_PATH=/Lukas_Hrdy_portfolio/ npm run build && npx astro preview` once.
- `.github/workflows/deploy.yml`: on push to `main` → setup Node 20 → `npm ci` → build CV PDFs (phase 4) → `astro build` with `SITE_URL: ${{ vars.SITE_URL || 'https://lukashrdy11.github.io' }}` and `BASE_PATH: ${{ vars.BASE_PATH || '/Lukas_Hrdy_portfolio/' }}` → `actions/upload-pages-artifact` → `actions/deploy-pages`. (When the domain goes live Lukáš sets repo variables `SITE_URL=https://lukashrdy.cz`, `BASE_PATH=/` — see `docs/NAVOD.md`. With Actions deploys no CNAME file is needed.)
- **The site lives in the repo root next to ~6 GB of private folders.** Therefore: `tsconfig.json` → `"include": ["src", ".astro/types.d.ts"]` (never `**/*` — `Premke_rakathon/` contains foreign TS); `astro.config.mjs` → `vite.server.watch.ignored` = every private folder (`Premke_rakathon`, `Osteo_agent`, `Starchip`, `SST1M`, `OV-2024-`, `Efemeridy`, `světelné křivky`, `reference`) + `hocs_lattice.html`, `CV.tex`. Search with the Grep/Glob tools (they respect `.gitignore`); never run bare `grep -r` / `find` from the repo root.
- Remote: `origin = https://github.com/LukasHrdy11/Lukas_Hrdy_portfolio.git` (checked 2026‑11‑14: public, **empty** — first push is a normal `git push -u origin main`), branch `main`. Pages source must be "GitHub Actions" (Lukáš does it, or `gh api` if `gh` is authenticated).

## 4. Inputs you can rely on

| Path | What |
|---|---|
| `content/profile.yaml` | ALL text content, CZ+EN (person, about, interests, featured_projects, other_projects, experience, education, awards, outreach, skills, languages). Lines with `TODO(Lukáš)` = unresolved: render gracefully (see §7). Lukáš edits this file by hand later → keep its shape; you may add fields, document them in the header comment. |
| `public/media/lukas-hrdy.jpg` | portrait 847×900, EXIF stripped. Generate responsive/AVIF variants via `astro:assets` (move a copy to `src/assets/` if needed). |
| `public/media/sst1m-angular-resolution.jpg` | SST-1M result plot (light matplotlib background — frame it as a "figure", don't invert colors). |
| `public/media/soc-vypocet-poloh-nebeskych-teles.pdf` | SOČ thesis (1.7 MB, checked: no private data). |
| `public/data/orbits.json` | JPL Table 1 Keplerian elements + rates (8 bodies) and comet C/2017 K2 elements; includes the method text. |
| `public/data/kmc-t10-crystal.json` (695 kB) | kMC 3D crystal frames (schema §6.2). Lazy-load only on the kMC page. |
| `public/data/deuteron.json` | u(r), w(r), V_c, V_T on r = 0.1…13.9 fm (schema §6.3). |
| `public/data/light-curves.json` | two light curves from the astro camp (schema §6.5). |
| `reference/kmc-viewer-reference.js` | (local only, gitignored — code from the private kMC repo; never commit it or copy it verbatim into `public/`) original 3D crystal viewer JS from Lukáš's simulation docs (decode(), projection, clusters, helpers). Port/adapt, don't copy blindly. |
| `reference/cv-style-reference.tex` | look of Lukáš's current CV (compiles with pdflatex; private data removed). |

## 5. Design brief

- **Mood:** deep-space dark, quiet and precise — like an observatory control room at night, not a sci-fi game. Near-black blue background (not pure #000), one cool accent (e.g. ice-blue / cyan) + one warm minor accent (e.g. amber, for the Sun/comet/highlights). Subtle, slow starfield or noise; no parallax circus.
- **Typography:** one distinctive display face for headings (something with scientific/editorial character), a highly legible text face, a mono for numbers/data. Self-hosted. Generous line-height, max ~70ch text width.
- **Tokens:** colors, spacing, radii, shadows, motion durations as CSS custom properties in one file. Contrast ≥ WCAG AA for all text.
- **Motion:** purposeful only (reveal on scroll ≤ 300 ms, hover states). `prefers-reduced-motion: reduce` → no autoplay animation anywhere; visualizations render a static frame with a manual play button.
- **Layout:** mobile-first; 16 px side gutter on phones; no horizontal scroll at 360 px; hero works on phones (lighter scene).
- **Avoid:** generic “developer portfolio template” look, glassmorphism overload, gradients on every card, emoji, skill-percentage bars, logo walls.

## 6. Page map & components

**Main page `/` (and `/cs/`)** — sections in this order:
1. **Hero** — name, headline, tagline (from YAML) over/next to the live 3D Solar System (§6.1). Small caption: what is computed and from what source. CTA links: Projects, CV (PDF), GitHub.
2. **About** — photo, `about`, `interests` (as quiet chips).
3. **Featured projects** — 4 cards in YAML order (kMC, deuteron, AFM/STM, ephemerides): title, org, period, 1-line summary, tags, small preview (static thumbnail/icon of its viz is fine) → link to subpage.
4. **Other projects** — compact cards: SST-1M (with its figure, click to enlarge), variable-stars atlas, AI assistant, clinical software (+ Rakathon 2026).
5. **Experience timeline** — `experience` + `education` (compact, readable, links to project subpages where `project:` is set).
6. **Awards** — compact list.
7. **Outreach** — YouTube (2 lite embeds §6.6), astro camp item + light-curve chart (§6.5), other outreach items.
8. **Skills & languages** — plain, compact.
9. **Contact / footer** — obfuscated e-mail, links, CV download (EN + CZ PDFs), language switch.

**Project subpage `/projects/<slug>/`** — title, org · supervisor · period, award badge if any, `body` paragraphs, `results` list, the visualization, `caveat` (if any) as a clearly styled note, `links` (primary as a button), back link. Same template for all four.

### 6.1 Hero — live 3D Solar System (phase 2)
- Three.js scene: Sun (emissive + glow), 8 planets (EM_Bary labelled Earth) with orbit lines, comet **C/2017 K2** on its hyperbolic orbit (short tail pointing away from the Sun), positions computed **live in JS** from `orbits.json` following its `method` field (Kepler solver; hyperbolic solver for the comet: `M = e·sinh H − H`).
- Distances: compressed radial scale (e.g. r^0.5 or log) so inner planets are visible; planet sizes stylised. State it in the caption.
- Controls: drag to orbit camera, wheel/pinch zoom (clamped), time play/pause, speed (e.g. 1 day/s … 1 year/s), date readout (UTC, ISO), "now" button, hover/tap label with name + heliocentric distance in au. Keyboard accessible controls (buttons, not only gestures).
- Caption (EN/CS): “Planet positions computed in your browser from JPL Keplerian elements (Standish & Williams 1992); comet C/2017 K2 uses the orbital elements from my SOČ project.” + link to the ephemerides subpage.
- Performance: init only when visible (`IntersectionObserver`), pause when off-screen/tab hidden, cap DPR at 2, < 200 draw calls, works on mid-range phones. Reduced motion → static frame at "now", no autoplay. WebGL unavailable → static SVG/PNG fallback with the same caption.
- Done when: (a) sanity: Earth ≈ 1 au, Jupiter ≈ 5 au, Earth's heliocentric longitude at 2026‑03‑20 ≈ 180°; (b) **comet reproduces Lukáš's own SOČ output** in `orbits.json → comet.validation` (Sun and Earth distances within ~0.01 au on 2022‑07‑12…14) and r(T_perihelion) = q = 1.798 au — read `comet.numerics_warning` (near-parabolic, e−1 = 4.6e‑4); (c) 60 fps on desktop, no console errors.

### 6.2 kMC 3D crystal (phase 3) — the essence of the kMC project
Lukáš wants: “the 3D crystal you can browse layer by layer, with dopants, and that it is a simulation result.”
- Data `kmc-t10-crystal.json`:
  `{definitions, source, caveats[], git_commit, runs:[{point, label, case, seed, x, f3_shape:[48,48,30], f3:[{layers, z_lo, occ, dop}×10]}×3], "cells_f0.03": {point:{excess, excess_sd, excess_verdict, cluster_ln_ratio}}}`
  `occ`/`dop` = base64 of numpy `packbits` (MSB first) over C-order (i, j, k) of a 48×48×30 crop of the top 30 levels; `z_lo` = absolute level of k=0. Lattice: sheared hexagonal, site (i,j,k) → x = i + j/2, y = j·√3/2, z = k (see `decode()` in the reference; only sites with `((i − j + k) mod 3) ≠ 0` are allowed in the corundum cation sublattice).
  Runs: `neutral` (dopant behaves like Al), `e_es_dop0.6` (strong dopant Ehrlich–Schwoebel barrier → dopants cluster, pair excess 0.43), `e_s_dop2.1` (higher dopant diffusion barrier → slightly fewer dopant pairs than random, excess −0.04). Full runs: 300×300 grid, 1000 layers, 1200 K, 100 Hz, 0.2 layer/pulse, dopant share of the deposited cation flux f = 0.03 (DOPANT_CATION_FRACTION — not the film composition).
- Build (Three.js `InstancedMesh` recommended, or port the reference Canvas2D projection): Al atoms neutral/cool tone colored by height, dopants in a vivid distinct color (colour-blind safe), optional "dopants only" mode. Controls: case selector (3 chips), growth slider (100 → 1000 deposited layers, play button), layer-range slicer (show levels z0…z1 to look inside), drag rotate, zoom.
- Caption: “Result of my kinetic Monte Carlo simulation: top 30 atomic levels of a 48 × 48 column cut from a 300 × 300, 1000-layer run.” + the YAML `caveat`.
- Done when: all 3 runs × 10 frames load and render < 1 s per switch, slicing works, mobile usable.

### 6.3 Deuteron wave function (phase 3)
- Data `deuteron.json`: `{source, binding_energy_MeV:-2.23, binding_energy_exp_MeV:-2.224575, derived_from_wavefunction_unverified:{…}, columns:["r_fm","u","w","V_c_MeV","V_T_MeV"], points:[[…]×139]}` (u, w normalized: ∫(u²+w²)dr = 1).
- D3 chart: u(r) (s-wave) and w(r) (d-wave) vs r [fm], hover crosshair readout; toggle/second small panel with V_c(r) and V_T(r) (clip the y-range, they diverge at r→0). Annotate E_B = −2.23 MeV vs experiment −2.2246 MeV.
- Lukáš approved the derived values (P_D, rms radius, Q) — they are in the YAML `results`; you may annotate them in the chart too (ignore the "unverified" key name).

### 6.4 STM tip animation (phase 3)
- Small canvas/SVG illustration (clearly labelled “simplified illustration — full simulation in the demo”): a tip scans over an atomic corrugated surface; a PI controller keeps the tunnelling current I ∝ exp(−2κ·gap) constant; draw surface, tip, and the recorded height trace. Two sliders (P, I gain) so the visitor can see overshoot / sluggish tracking. Big primary button → live demo (`https://lukashrdy11.github.io/afm-stm-demo/`).

### 6.5 Astro-camp light curve (phase 3, small)
- Data `light-curves.json`: `{drak:{star:"FU Dra", label, header[], columns:["JD_geocentric","mag_V-C","err"], points:[[jd,mag,err]…453]}, labut:{star:"V2556 Cyg", columns:[…"JD" heliocentric…], points:[…292]}, note}`.
- Small D3 scatter with error bars, **inverted magnitude axis**, x = time in CEST (UTC+2) for that night. Default FU Dra; tiny toggle for V2556 Cyg. Caption from YAML.

### 6.6 YouTube lite embeds
- Thumbnail (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`) + play button; iframe from `youtube-nocookie.com` only after click. Videos: „Černé díry“ (`TY1Vo4Q_p3Y`) and „Novinky v astronomii a fyzice za rok 2025“ (`0Ul1NaCgEdI`, a long lecture). If an id is ever missing → card linking to the channel (no broken embed).

## 7. Content rules

- Text comes from YAML; you may polish wording in YAML (both languages) but **never invent facts, numbers, dates, affiliations or results**. Keep the kMC caveat visible.
- `TODO(Lukáš)` items: don't render placeholders like "TODO". Skip/fallback gracefully and list them in your end-of-phase message.
- Czech typography: non-breaking spaces after one-letter prepositions (v, k, s, z, o, u, a, i) in rendered CS text (a small helper is fine).
- Dates/periods as written in YAML.

## 8. Phases (each ends with ⏸ review)

### Phase 1 — Foundation, design system, all pages with real content
**1a (⏸ mid-phase checkpoint):** project init, §3, tokens, fonts, header/footer, hero placeholder + the About section fully styled → stop with `⏸ FÁZE 1a HOTOVÁ …` so Lukáš approves the visual direction before you build the rest. **1b:** everything else below.
- Init Astro 5.18.2 project in the repo root (keep existing `.gitignore` allowlist; if you add root files, add `!/<file>` to it). Scripts: `dev`, `build`, `preview`, `cv` (phase 4).
- §3 base-path + `withBase` helper + deploy workflow (CV step stubbed).
- Design tokens + fonts + layout + header (nav, language switch) + footer.
- All main-page sections (§6) rendered from YAML in both languages; 4 project subpages from one template; 404 page.
- Hero area: static placeholder (gradient/stars) where the 3D scene will go.
- Push the first deploy; verify the Pages URL works with the base path (if Pages isn't enabled yet, tell Lukáš the exact step from `docs/NAVOD.md`).

### Phase 2 — Hero 3D Solar System (§6.1)

### Phase 3 — Project visualizations (§6.2 kMC first, then §6.3, §6.4, §6.5, §6.6)
**3a:** kMC crystal → `⏸ FÁZE 3a HOTOVÁ …` checkpoint. **3b:** the rest.
Feature thumbnails on the main-page cards may be static images rendered from these visualizations.

### Phase 4 — CV generator + CI (good candidate to delegate to one Opus subagent)
- `scripts/build-cv.mjs` (Node): reads `content/profile.yaml` → fills `cv/template.tex` (based on `reference/cv-style-reference.tex` look: tgpagella + eulervm, blue rule headings) for `cs` and `en` → `latexmk -pdf` → copies `public/cv/lukas-hrdy-cv-cs.pdf` and `…-en.pdf`. Respect `cv: false` / `web: false`. Escape LaTeX special chars. Include links (web, GitHub, YouTube) and e-mail; **no** phone/address/birth date/signature line. CS uses `babel` czech, EN uses english.
- Template: keep the reference look but **drop `eulervm`, `todonotes`, `epsfig`, `epstopdf`** (no math/figures in a CV; `eulervm` alone would pull the huge `texlive-fonts-extra`). Then CI needs exactly (verified with `kpsewhich`+`dpkg -S` on this machine): `sudo apt-get install -y --no-install-recommends texlive-latex-base texlive-latex-recommended texlive-latex-extra tex-gyre texlive-lang-czechslovak texlive-lang-english latexmk` (cache if easy). Run `npm run cv` before `astro build`. Local: `npm run cv` works (pdflatex/latexmk are installed here, TeX Live 2023).
- The built PDFs are build artifacts (not committed; `public/cv/` should be gitignored).
- Done when: both PDFs fit on max 2 pages, look like the reference style, and are linked from the site header/footer.

### Phase 5 — Polish & final review
- Copy-edit both languages (concise!), meta tags, Open Graph image (static, e.g. a render of the hero), favicon, `sitemap`, `robots.txt`, `<html lang>`, hreflang between `/` and `/cs/`.
- Accessibility: keyboard nav, focus states, alt texts, contrast, reduced motion. Responsive check at 360/768/1280 px (one automated Playwright pass in a subagent is OK if available; otherwise ask Lukáš).
- Performance: Lighthouse-style sanity (lazy three.js, image sizes, no layout shift).
- Final ≤15-line summary + list of remaining `TODO(Lukáš)` items.

## 9. Out of scope

Blog, CMS, contact form, analytics, comments, publishing the private projects' code, JPL-comparison chart for the ephemerides, visualizations for Starchip / variable-star atlas.
