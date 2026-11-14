// Deuteron radial wave functions u(r), w(r) and the potential (PLAN.md §6.3).
import { bisector, range } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { axisBottom, axisLeft, numberFormat, svgEl, type Box } from './chart';

interface Strings {
  lang: string;
  r: string;
  wave: string;
  potential: string;
  hint: string;
}

interface Panel {
  cols: [number, number];
  names: [string, string];
  xMax: number;
  yDomain: [number, number];
  yStep: number;
  yDigits: number;
  valueDigits: number;
  unit: string;
  label: string;
}

export function mountDeuteronChart(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>('[data-plot]')!;
  const readout = root.querySelector<HTMLElement>('[data-readout]')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-panel]')];
  const legends = [...root.querySelectorAll<HTMLElement>('[data-legend]')];
  const strings: Strings = JSON.parse(root.dataset.strings!);
  const points: number[][] = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent!);

  const panels: Record<string, Panel> = {
    wave: {
      cols: [1, 2],
      names: ['u', 'w'],
      xMax: 14,
      yDomain: [0, 0.6],
      yStep: 0.1,
      yDigits: 1,
      valueDigits: 3,
      unit: '',
      label: strings.wave,
    },
    // The potential diverges at r → 0, so the y-range is clipped.
    potential: {
      cols: [3, 4],
      names: ['V_c', 'V_T'],
      xMax: 5,
      yDomain: [-160, 120],
      yStep: 40,
      yDigits: 0,
      valueDigits: 1,
      unit: ' MeV',
      label: strings.potential,
    },
  };
  let active = 'wave';
  let hoverIndex = -1;
  const bisect = bisector((p: number[]) => p[0]).center;
  const fmtR = numberFormat(strings.lang, 1);

  function render() {
    const p = panels[active];
    const width = host.clientWidth;
    if (width < 10) return;
    const height = Math.round(Math.min(420, Math.max(250, width * 0.52)));
    const box: Box = { left: 46, right: width - 8, top: 30, bottom: height - 44 };
    const x = scaleLinear([0, p.xMax], [box.left, box.right]);
    const y = scaleLinear(p.yDomain, [box.bottom, box.top]);
    const data = points.filter((d) => d[0] <= p.xMax);

    host.replaceChildren();
    const svg = svgEl('svg', { class: 'chart', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': root.dataset.alt! }, host);
    const clipId = 'deuteron-clip';
    const clip = svgEl('clipPath', { id: clipId }, svgEl('defs', {}, svg));
    svgEl('rect', { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top }, clip);

    const xStep = p.xMax > 8 ? 2 : 1;
    axisBottom(svg, x, box, { ticks: range(0, p.xMax + 0.01, xStep), format: numberFormat(strings.lang, 0), label: strings.r });
    axisLeft(svg, y, box, {
      ticks: range(p.yDomain[0], p.yDomain[1] + 1e-9, p.yStep),
      format: numberFormat(strings.lang, p.yDigits),
      label: p.label,
      grid: true,
    });
    if (p.yDomain[0] < 0) svgEl('line', { class: 'chart__zero', x1: box.left, x2: box.right, y1: y(0), y2: y(0) }, svg);

    const plot = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    p.cols.forEach((col, n) => {
      const path = line<number[]>((d) => x(d[0]), (d) => y(Math.max(-1e4, Math.min(1e4, d[col]))));
      svgEl('path', { class: `chart__line chart__line--${n ? 'warm' : 'cool'}`, d: path(data)! }, plot);
    });

    // Crosshair
    const cross = svgEl('g', { class: 'chart__cross', visibility: 'hidden' }, svg);
    const rule = svgEl('line', { y1: box.top, y2: box.bottom }, cross);
    const dots = p.cols.map((_, n) => svgEl('circle', { r: 4, class: `chart__dot chart__dot--${n ? 'warm' : 'cool'}` }, cross));
    const fmtV = numberFormat(strings.lang, p.valueDigits);
    const show = (i: number) => {
      hoverIndex = i;
      if (i < 0 || i >= data.length) {
        cross.setAttribute('visibility', 'hidden');
        readout.textContent = strings.hint;
        return;
      }
      const d = data[i];
      cross.setAttribute('visibility', 'visible');
      rule.setAttribute('x1', String(x(d[0])));
      rule.setAttribute('x2', String(x(d[0])));
      p.cols.forEach((col, n) => {
        dots[n].setAttribute('cx', String(x(d[0])));
        dots[n].setAttribute('cy', String(y(d[col])));
        const inside = d[col] >= p.yDomain[0] && d[col] <= p.yDomain[1];
        dots[n].setAttribute('visibility', inside ? 'inherit' : 'hidden');
      });
      readout.textContent =
        `r = ${fmtR(d[0])} fm · ` + p.cols.map((col, n) => `${p.names[n]} = ${fmtV(d[col])}${p.unit}`).join(' · ');
    };
    const move = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      if (px < box.left - 12 || px > box.right + 12) return show(-1);
      show(bisect(data, x.invert(px)));
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') show(-1);
    });
    show(Math.min(hoverIndex, data.length - 1));
  }

  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      active = tab.dataset.panel!;
      hoverIndex = -1;
      tabs.forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
      legends.forEach((l) => (l.hidden = l.dataset.legend !== active));
      render();
    }),
  );
  new ResizeObserver(render).observe(host);
  render();
  root.classList.add('is-live');
}
