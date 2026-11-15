// Builds the two CV PDFs from the single source of truth:
//   content/profile.yaml + cv/template.tex → public/cv/lukas-hrdy-cv-{cs,en}.pdf
// Needs latexmk + pdflatex (TeX Live). Run with `npm run cv`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'cv', 'build');
const outDir = join(root, 'public', 'cv');
const MAX_PAGES = 2;

const profile = yaml.load(readFileSync(join(root, 'content', 'profile.yaml'), 'utf8'));
const template = readFileSync(join(root, 'cv', 'template.tex'), 'utf8');

const labels = {
  cs: {
    babel: 'czech',
    experience: 'Vědecké zkušenosti',
    education: 'Vzdělání',
    awards: 'Ocenění',
    projects: 'Další projekty',
    outreach: 'Popularizační aktivity',
    skills: 'Dovednosti',
    languages: 'Jazyky',
    supervisor: 'Vedoucí',
  },
  en: {
    babel: 'english',
    experience: 'Research experience',
    education: 'Education',
    awards: 'Awards',
    projects: 'Other projects',
    outreach: 'Outreach',
    skills: 'Skills',
    languages: 'Languages',
    supervisor: 'Supervisor',
  },
};

// ---------- text → LaTeX ----------

const ASCII = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', $: '\\$', '#': '\\#', _: '\\_',
  '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};
const UNICODE = {
  ' ': '~', '–': '--', '—': '---', '…': '\\dots{}', '·': '\\textperiodcentered{}',
  '„': '\\quotedblbase{}', '“': '\\textquotedblleft{}', '”': '\\textquotedblright{}',
  '‚': '\\quotesinglbase{}', '‘': '\\textquoteleft{}', '’': '\\textquoteright{}',
  '×': '$\\times$', '→': '$\\rightarrow$', '−': '$-$', '≈': '$\\approx$', '∝': '$\\propto$',
  'α': '$\\alpha$', 'κ': '$\\kappa$', 'Δ': '$\\Delta$',
  '²': '\\textsuperscript{2}', '₂': '\\textsubscript{2}', '₃': '\\textsubscript{3}',
};

/** Escape plain text for LaTeX. Throws on characters the T1 font setup cannot print. */
function tex(text) {
  let out = '';
  for (const ch of String(text)) {
    if (ASCII[ch]) out += ASCII[ch];
    else if (UNICODE[ch]) out += UNICODE[ch];
    else if (ch.codePointAt(0) < 0x180) out += ch;
    else {
      throw new Error(
        `[cv] character "${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase()}) in "${text}" ` +
          'has no LaTeX mapping — add it to UNICODE in scripts/build-cv.mjs.',
      );
    }
  }
  return out;
}

/** Czech typography: no line break after one-letter prepositions or after "2." in "2. místo". */
function czech(text) {
  return text
    .replace(/(^|[\s(„])([vkszouaiVKSZOUAI])\s+/g, '$1$2 ')
    .replace(/(\d\.)\s+(?=\p{Ll})/gu, '$1 ');
}

const hrefUrl = (url) => url.replace(/[%#&_]/g, (c) => `\\${c}`);
const link = (url, text) => `\\href{${hrefUrl(url)}}{${tex(text)}}`;
const bareUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

// ---------- content ----------

const inCv = (items) => (items ?? []).filter((item) => item.cv !== false);

function render(lang) {
  const L = labels[lang];
  /** Localized ({cs,en}) or plain string → escaped LaTeX. */
  const t = (value) => {
    const raw = typeof value === 'string' ? value : value[lang];
    if (raw == null) throw new Error(`[cv] missing "${lang}" text in ${JSON.stringify(value)}`);
    return tex(lang === 'cs' ? czech(raw) : raw);
  };
  const entry = (date, lines) => `\\cventry{${tex(date.trim())}}{${lines.filter(Boolean).join('\\\\\n  ')}}`;
  const small = (latex) => latex && `{\\small ${latex}}`;
  const section = (title, entries) => (entries.length ? [`\\cvsection{${tex(title)}}`, ...entries, ''] : []);

  const projects = [...inCv(profile.featured_projects), ...inCv(profile.other_projects)];
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const projectLinks = (p) =>
    (p.links ?? [])
      .filter((l) => /^https?:/.test(l.url))
      .map((l) => small(`${t(l.label)}: ${link(l.url, bareUrl(l.url))}`));

  const linked = new Set();
  const experience = inCv(profile.experience).map((item) => {
    const p = item.project && bySlug.get(item.project);
    if (p) linked.add(p.slug);
    return entry(item.period, [
      `\\textbf{${t(item.title)}}`,
      item.org && t(item.org),
      item.supervisor && `\\emph{${L.supervisor}: ${tex(item.supervisor)}}`,
      p && small(t(p.summary)),
      ...(p ? projectLinks(p) : []),
    ]);
  });

  const education = inCv(profile.education).map((item) => entry(item.period, [`\\textbf{${t(item.title)}}`]));

  const awards = inCv(profile.awards).map((item) =>
    entry(item.date, [`\\textbf{${t(item.title)}}`, item.detail && `\\emph{${t(item.detail)}}`]),
  );

  const otherProjects = projects
    .filter((p) => !linked.has(p.slug))
    .map((p) => entry(p.period, [`\\textbf{${t(p.title)}}`, p.org && t(p.org), small(t(p.summary)), ...projectLinks(p)]));

  const outreach = inCv(profile.outreach?.items).map((item) =>
    entry(item.period, [`\\textbf{${t(item.title)}}`, item.detail && t(item.detail)]),
  );

  const skills = inCv(profile.skills).map((s) => entry(s.area[lang], [t(s.items)]));

  const languages = [
    ...inCv(profile.languages).map((l) => entry(l.name[lang], [t(l.level)])),
    ...inCv(profile.language_stays).map((s) => `\\cvline{${t(s)}}`),
  ];

  const { person } = profile;
  const contacts = [
    link(`mailto:${person.email}`, person.email),
    ...inCv(profile.links).map((l) => link(l.url, bareUrl(l.url))),
  ];
  const header = [
    '\\begin{minipage}[b]{0.5\\linewidth}',
    `{\\Huge ${tex(person.name)}}\\\\[6pt]`,
    '{\\large\\itshape Curriculum Vitae}',
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[b]{0.48\\linewidth}\\raggedleft\\color{darkgray}',
    contacts.join('\\\\\n'),
    '\\end{minipage}',
    '',
    '\\vspace{0.9em}',
    `{\\itshape ${t(person.headline)}}\\par`,
  ].join('\n');

  const body = [
    ...section(L.experience, experience),
    ...section(L.education, education),
    ...section(L.awards, awards),
    ...section(L.projects, otherProjects),
    ...section(L.outreach, outreach),
    ...section(L.skills, skills),
    ...section(L.languages, languages),
  ].join('\n');

  const fill = {
    BABEL: L.babel,
    PDFTITLE: `${person.name} – Curriculum Vitae`,
    PDFAUTHOR: person.name,
    PDFLANG: lang,
    HEADER: header,
    BODY: body,
  };
  return template.replace(/<<([A-Z]+)>>/g, (_, key) => {
    if (!(key in fill)) throw new Error(`[cv] unknown placeholder <<${key}>> in cv/template.tex`);
    return fill[key];
  });
}

// ---------- build ----------

function compile(lang) {
  const name = `lukas-hrdy-cv-${lang}`;
  writeFileSync(join(buildDir, `${name}.tex`), render(lang));
  try {
    execFileSync(
      'latexmk',
      ['-pdf', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', `${name}.tex`],
      { cwd: buildDir, stdio: 'pipe' },
    );
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('[cv] latexmk not found — install TeX Live (see PLAN.md, phase 4).');
    const log = `${err.stdout ?? ''}`.split('\n').slice(-40).join('\n');
    throw new Error(`[cv] LaTeX failed for ${name}.tex:\n${log}`);
  }
  const log = readFileSync(join(buildDir, `${name}.log`), 'latin1');
  const pages = Number(/Output written on .*?\((\d+) pages?/s.exec(log)?.[1]);
  if (!(pages >= 1 && pages <= MAX_PAGES)) {
    throw new Error(`[cv] ${name}.pdf has ${pages} pages (max ${MAX_PAGES}) — shorten the YAML or mark items \`cv: false\`.`);
  }
  copyFileSync(join(buildDir, `${name}.pdf`), join(outDir, `${name}.pdf`));
  console.log(`[cv] public/cv/${name}.pdf (${pages} page${pages > 1 ? 's' : ''})`);
}

mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
try {
  for (const lang of ['cs', 'en']) compile(lang);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
