# CLAUDE.md — Lukáš Hrdý portfolio

Static personal portfolio (Astro 5.18.2 + three.js + d3), deployed to GitHub Pages via Actions.
**The full brief, decisions, data schemas and phases are in `PLAN.md` — follow it.**

## Hard rules
- **Never open** the private project folders or files in the repo root that are not part of the site:
  `Premke_rakathon/`, `Osteo_agent/`, `Starchip/`, `SST1M/`, `OV-2024-/`, `Efemeridy/`, `světelné křivky/`,
  `hocs_lattice.html` (5.8 MB), `CV.tex`, `lukáš hrdý.jpg`. Everything needed from them is already extracted
  into `content/`, `public/`, `reference/`. (They are also denied in `.claude/settings.json` and gitignored.)
- `.gitignore` is an **allowlist** (`/*` then `!/path`). Adding a new root file/folder → add `!/name` to it.
- Facts come only from `content/profile.yaml` and `PLAN.md`. Never invent dates, numbers, affiliations or results.
- Privacy: no phone, address or birth date anywhere; e-mail obfuscated.
- Subagents: always `model: "opus"`, never `subagent_type: "fork"`.
- Node is v20 → stay on Astro 5.x.
- One phase per session; stop with `⏸ FÁZE N HOTOVÁ …` and wait for Lukáš's OK before commit + push.
- Talk to Lukáš in Czech; code, comments and commit messages in English.

## Commands
- `npm run dev -- --host` (run in background) → http://localhost:4321/
- `npm run build` must pass before ending a phase
- `BASE_PATH=/Lukas_Hrdy_portfolio/ npm run build` → test the GitHub Pages base path
- `npm run cv` → builds `public/cv/*.pdf` from `content/profile.yaml` (phase 4)
