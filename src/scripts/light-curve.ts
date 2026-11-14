// Astro-camp light curve (PLAN.md §6.5): differential magnitude vs. local time, magnitude axis inverted.
import { extent, range } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft, numberFormat, svgEl, type Box } from './chart';

interface Series { star: string; points: [number, number, number][] }
interface Strings {
  lang: string;
  time: string;
  timeHelio: string;
  mag: string;
  other: string;
  /** key of the series that the YAML caption describes */
  show: string;
  /** keys whose time stamps are heliocentric */
  helio: string[];
}

const HOUR = 3_600_000;
const CEST_OFFSET = 2 * HOUR;
/** Julian date → Unix ms, shifted so that the UTC getters return CEST wall-clock time. */
const jdToCest = (jd: number) => (jd - 2440587.5) * 86_400_000 + CEST_OFFSET;

export async function mountLightCurve(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>('[data-plot]')!;
  const caption = root.querySelector<HTMLElement>('[data-caption]')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-series]')];
  const strings: Strings = JSON.parse(root.dataset.strings!);
  const data: Record<string, Series> = await fetch(root.dataset.src!).then((r) => {
    if (!r.ok) throw new Error(`light curves: HTTP ${r.status}`);
    return r.json();
  });
  const yamlCaption = caption.textContent ?? '';
  const fmtMag = numberFormat(strings.lang, 1);
  const fmtDate = new Intl.DateTimeFormat(strings.lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  let active = strings.show;

  function render() {
    const series = data[active];
    const width = host.clientWidth;
    if (width < 10) return;
    const height = Math.round(Math.min(340, Math.max(230, width * 0.42)));
    const box: Box = { left: 40, right: width - 8, top: 30, bottom: height - 44 };
    const pts = series.points.map(([jd, mag, err]) => ({ t: jdToCest(jd), mag, err }));

    const [t0, t1] = extent(pts, (p) => p.t) as [number, number];
    const x = scaleLinear([t0 - 0.05 * HOUR, t1 + 0.05 * HOUR], [box.left, box.right]);
    const [m0, m1] = extent(pts, (p) => p.mag) as [number, number];
    // Inverted axis: brighter (smaller magnitude) is up.
    const y = scaleLinear([Math.ceil(m1 * 10 + 0.3) / 10, Math.floor(m0 * 10 - 0.3) / 10], [box.bottom, box.top]);

    host.replaceChildren();
    const svg = svgEl('svg', { class: 'chart', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${series.star}: ${root.dataset.alt}` }, host);
    const stepH = (t1 - t0) / HOUR > 3.2 || width < 420 ? 1 : 0.5;
    const firstTick = Math.ceil(x.domain()[0] / (stepH * HOUR)) * stepH * HOUR;
    axisBottom(svg, x, box, {
      ticks: range(firstTick, x.domain()[1], stepH * HOUR),
      format: (ms) => {
        const d = new Date(ms);
        return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      },
      label: strings.helio.includes(active) ? strings.timeHelio : strings.time,
    });
    const [yLo, yHi] = [y.domain()[1], y.domain()[0]];
    axisLeft(svg, y, box, { ticks: range(Math.ceil(yLo * 10) / 10, yHi + 1e-9, 0.1), format: fmtMag, label: strings.mag, grid: true });

    const bars = pts.map((p) => `M${x(p.t).toFixed(1)} ${y(p.mag - p.err).toFixed(1)}V${y(p.mag + p.err).toFixed(1)}`).join('');
    svgEl('path', { class: 'lc__err', d: bars }, svg);
    const dots = svgEl('g', { class: 'lc__dots' }, svg);
    for (const p of pts) svgEl('circle', { cx: x(p.t).toFixed(1), cy: y(p.mag).toFixed(1), r: width < 420 ? 1.2 : 1.6 }, dots);

    caption.textContent =
      active === strings.show
        ? yamlCaption
        : strings.other.replace('{star}', series.star).replace('{date}', fmtDate.format(new Date(t0)));
  }

  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      active = tab.dataset.series!;
      tabs.forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
      render();
    }),
  );
  new ResizeObserver(render).observe(host);
  render();
  root.classList.add('is-live');
}
