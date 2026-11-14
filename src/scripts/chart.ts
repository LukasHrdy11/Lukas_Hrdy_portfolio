// Small shared helpers for the D3-scaled SVG charts (deuteron, light curve).
// Charts are drawn at real pixel size and redrawn on resize, so text never shrinks on phones.
import type { ScaleLinear } from 'd3-scale';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text != null) node.textContent = text;
  parent?.append(node);
  return node;
}

export interface Box { left: number; right: number; top: number; bottom: number }

type Scale = ScaleLinear<number, number>;

interface AxisOptions {
  ticks: number[];
  format: (v: number) => string;
  label?: string;
  grid?: boolean;
}

export function axisBottom(svg: SVGElement, x: Scale, box: Box, { ticks, format, label, grid }: AxisOptions) {
  const g = svgEl('g', { class: 'chart__axis' }, svg);
  svgEl('line', { x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom }, g);
  for (const v of ticks) {
    const px = x(v);
    if (grid) svgEl('line', { class: 'chart__grid', x1: px, x2: px, y1: box.top, y2: box.bottom }, g);
    svgEl('line', { x1: px, x2: px, y1: box.bottom, y2: box.bottom + 5 }, g);
    svgEl('text', { x: px, y: box.bottom + 18, 'text-anchor': 'middle' }, g, format(v));
  }
  if (label) {
    svgEl('text', { class: 'chart__label', x: box.right, y: box.bottom + 36, 'text-anchor': 'end' }, g, label);
  }
}

export function axisLeft(svg: SVGElement, y: Scale, box: Box, { ticks, format, label, grid }: AxisOptions) {
  const g = svgEl('g', { class: 'chart__axis' }, svg);
  svgEl('line', { x1: box.left, x2: box.left, y1: box.top, y2: box.bottom }, g);
  for (const v of ticks) {
    const py = y(v);
    if (grid) svgEl('line', { class: 'chart__grid', x1: box.left, x2: box.right, y1: py, y2: py }, g);
    svgEl('line', { x1: box.left - 5, x2: box.left, y1: py, y2: py }, g);
    svgEl('text', { x: box.left - 9, y: py, dy: '0.32em', 'text-anchor': 'end' }, g, format(v));
  }
  if (label) svgEl('text', { class: 'chart__label', x: 0, y: box.top - 12 }, g, label);
}

/** Typographic minus for negative numbers. */
export function numberFormat(lang: string, digits: number) {
  const nf = new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (v: number) => nf.format(v).replace('-', '−');
}

/** Run `mount` once the element scrolls near the viewport. */
export function whenVisible(el: Element, mount: () => void, rootMargin = '300px') {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      mount();
    },
    { rootMargin },
  );
  io.observe(el);
}
