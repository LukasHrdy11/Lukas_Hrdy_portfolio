// Interactive 3D crystal from the kMC simulation (PLAN.md §6.2).
// Loaded on demand by KmcCrystal.astro. Atoms are drawn as shaded point sprites with a
// per-fragment sphere depth, so ~43 000 atoms cost a single draw call.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { cropExtent, decodeFrame, type DecodedFrame, type KmcData } from '../lib/kmc';

interface Strings {
  lang: string;
  layers: string;
  levels: string;
  atoms: string;
  dopants: string;
  cases: Record<string, string>;
}

const ATOM_RADIUS = 0.54;
const DOPANT_SCALE = 1.12;
const MAX_ZOOM = 5;
const EL_MIN = -0.15;
const EL_MAX = Math.PI / 2 - 0.001;
const PRESETS: Record<string, { az: number; el: number }> = {
  oblique: { az: 0.42, el: 0.5 },
  top: { az: 0, el: EL_MAX },
  side: { az: 0, el: 0 },
};
const PLAY_STEP_MS = 800;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function atomMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uSize: { value: 8 },
      uDepth: { value: 0 },
      uZ0: { value: 0 },
      uZ1: { value: 99 },
      uDopOnly: { value: 0 },
      // Al: deep blue-grey → pale ice by height; dopant: amber (blue/orange stays distinct for colour-blind viewers)
      uLow: { value: new Color(0x25405f) },
      uMid: { value: new Color(0x5f9fc9) },
      uHigh: { value: new Color(0xe3f1fb) },
      uDop: { value: new Color(0xffa62e) },
    },
    vertexShader: /* glsl */ `
      attribute float aLevel;
      attribute float aKind;
      attribute float aShade;
      uniform float uSize, uZ0, uZ1, uDopOnly;
      uniform vec3 uLow, uMid, uHigh, uDop;
      varying vec3 vColor;
      void main() {
        bool hidden = aLevel < uZ0 - 0.5 || aLevel > uZ1 + 0.5 || (uDopOnly > 0.5 && aKind < 0.5);
        gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 al = aShade < 0.5 ? mix(uLow, uMid, aShade * 2.0) : mix(uMid, uHigh, aShade * 2.0 - 1.0);
        vColor = aKind > 0.5 ? uDop * (0.62 + 0.38 * aShade) : al;
        gl_PointSize = uSize * (aKind > 0.5 ? ${DOPANT_SCALE.toFixed(2)} : 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDepth;
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        float nz = sqrt(1.0 - r2);
        vec3 n = vec3(p.x, -p.y, nz);
        float diffuse = max(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0);
        vec3 c = vColor * (0.34 + 0.78 * diffuse);
        c *= mix(0.5, 1.0, smoothstep(0.0, 0.5, nz));
        gl_FragColor = vec4(c, 1.0 - smoothstep(0.9, 1.0, r2));
        gl_FragDepth = gl_FragCoord.z - nz * uDepth;
      }`,
    alphaToCoverage: true,
  });
}

/** The 12 edges of the sheared box that bounds the crop. */
function boxGeometry(ex: number, ey: number, ez: number, shear: number) {
  const corner = (u: number, v: number, w: number) => [
    u * (ex - shear) + w * shear - ex / 2,
    v * ey - ey / 2,
    ez / 2 - w * ez,
  ];
  const edges: number[] = [];
  for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
    for (const v of [0, 1]) edges.push(...corner(a & 1, v, a >> 1), ...corner(b & 1, v, b >> 1));
    edges.push(...corner(a & 1, 0, a >> 1), ...corner(a & 1, 1, a >> 1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(edges), 3));
  return g;
}

export async function mountKmcCrystal(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const controls = root.querySelector<HTMLElement>('[data-controls]')!;
  const strings: Strings = JSON.parse(root.dataset.strings!);
  const nf = new Intl.NumberFormat(strings.lang);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return; // no WebGL: the static drawing stays
  }
  const data: KmcData = await fetch(root.dataset.src!).then((r) => {
    if (!r.ok) throw new Error(`kMC data: HTTP ${r.status}`);
    return r.json();
  });

  const shape = data.runs[0].f3_shape;
  const nz = shape[2];
  const [ex, ey, ez] = cropExtent(shape);
  const radius = 0.5 * Math.hypot(ex, ey, ez) + ATOM_RADIUS;
  const maxPoint = (renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];

  // — Scene —
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 4);
  const capacity = shape[0] * shape[1] * nz;
  const geometry = new BufferGeometry();
  const attrs = {
    position: new BufferAttribute(new Float32Array(capacity * 3), 3),
    aLevel: new BufferAttribute(new Float32Array(capacity), 1),
    aKind: new BufferAttribute(new Float32Array(capacity), 1),
    aShade: new BufferAttribute(new Float32Array(capacity), 1),
  };
  for (const [name, attr] of Object.entries(attrs)) {
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  }
  const material = atomMaterial();
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  scene.add(
    new LineSegments(
      boxGeometry(ex, ey, ez, (shape[1] - 1) / 2),
      new LineBasicMaterial({ color: 0x33415c, transparent: true, opacity: 0.9 }),
    ),
  );

  // — State —
  let run = 0;
  let frame = data.runs[0].f3.length - 1;
  let z0 = 0;
  let z1 = nz - 1;
  let dopOnly = false;
  let { az, el } = PRESETS.oblique;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let width = 1;
  let height = 1;
  let pxPerUnit = 1;
  const cache = new Map<string, DecodedFrame>();
  let current: DecodedFrame;

  const $ = <T extends HTMLElement>(sel: string) => controls.querySelector<T>(sel)!;
  const caseBtns = [...controls.querySelectorAll<HTMLButtonElement>('[data-case]')];
  const playBtn = $<HTMLButtonElement>('[data-act="play"]');
  const growth = $<HTMLInputElement>('[data-growth]');
  const growthOut = $('[data-growth-out]');
  const lo = $<HTMLInputElement>('[data-z0]');
  const hi = $<HTMLInputElement>('[data-z1]');
  const sliceOut = $('[data-slice-out]');
  const sliceFill = $('[data-slice-fill]');
  const dopBtn = $<HTMLButtonElement>('[data-act="dopants"]');
  const viewBtns = [...controls.querySelectorAll<HTMLButtonElement>('[data-view]')];
  const note = root.querySelector<HTMLElement>('[data-note]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;

  growth.max = String(data.runs[0].f3.length - 1);
  growth.value = String(frame);
  for (const input of [lo, hi]) input.max = String(nz - 1);
  hi.value = String(z1);

  let queued = false;
  function draw() {
    queued = false;
    const d = radius * 2;
    camera.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0, 0);
    const halfH = Math.max(0.7 * radius, (0.98 * radius * height) / width) / zoom;
    const halfW = (halfH * width) / height;
    // Keep the crystal within reach when panning.
    const reach = Math.max(0, radius - Math.min(halfW, halfH) * 0.5);
    panX = clamp(panX, -reach, reach);
    panY = clamp(panY, -reach, reach);
    camera.left = panX - halfW;
    camera.right = panX + halfW;
    camera.top = panY + halfH;
    camera.bottom = panY - halfH;
    camera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    pxPerUnit = height / (2 * halfH);
    material.uniforms.uSize.value = Math.min(2 * ATOM_RADIUS * pxPerUnit * dpr, maxPoint / DOPANT_SCALE);
    material.uniforms.uDepth.value = ATOM_RADIUS / (camera.far - camera.near);
    renderer.render(scene, camera);
  }
  function invalidate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  function updateReadout() {
    const f = data.runs[run].f3[frame];
    growthOut.textContent = `${nf.format(f.layers)} ${strings.layers}`;
    growth.setAttribute('aria-valuetext', growthOut.textContent);
    sliceOut.textContent = `${strings.levels} ${f.z_lo + z0}–${f.z_lo + z1}`;
    sliceFill.style.setProperty('--from', `${(z0 / (nz - 1)) * 100}%`);
    sliceFill.style.setProperty('--to', `${(z1 / (nz - 1)) * 100}%`);
    let atoms = 0;
    let dopants = 0;
    for (let a = 0; a < current.count; a++) {
      const k = current.level[a];
      if (k < z0 || k > z1) continue;
      atoms++;
      dopants += current.kind[a];
    }
    count.textContent = `${nf.format(atoms)} ${strings.atoms} · ${nf.format(dopants)} ${strings.dopants}`;
  }

  function showFrame() {
    const key = `${run}:${frame}`;
    let dec = cache.get(key);
    if (!dec) {
      dec = decodeFrame(data.runs[run].f3[frame], shape);
      cache.set(key, dec);
    }
    current = dec;
    attrs.position.array.set(dec.position);
    attrs.aLevel.array.set(dec.level);
    attrs.aKind.array.set(dec.kind);
    attrs.aShade.array.set(dec.shade);
    for (const attr of Object.values(attrs)) attr.needsUpdate = true;
    geometry.setDrawRange(0, dec.count);
    updateReadout();
    invalidate();
  }

  function setCase(n: number) {
    run = n;
    caseBtns.forEach((b, q) => b.setAttribute('aria-pressed', String(q === n)));
    const point = data.runs[n].point;
    const excess = data['cells_f0.03'][point].excess;
    const fixed = new Intl.NumberFormat(strings.lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const signed = Math.abs(excess) < 0.005 ? '≈ 0' : `${excess < 0 ? '−' : '+'}${fixed.format(Math.abs(excess))}`;
    note.textContent = strings.cases[point].replace('{excess}', signed);
    showFrame();
  }

  function setSlice(changed: HTMLInputElement) {
    let a = Number(lo.value);
    let b = Number(hi.value);
    if (a > b) {
      if (changed === lo) b = a;
      else a = b;
    }
    lo.value = String((z0 = a));
    hi.value = String((z1 = b));
    material.uniforms.uZ0.value = z0;
    material.uniforms.uZ1.value = z1;
    updateReadout();
    invalidate();
  }

  // — Playback of the growth frames —
  let timer = 0;
  function setPlaying(on: boolean) {
    clearInterval(timer);
    timer = 0;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? playBtn.dataset.pause! : playBtn.dataset.play!);
    if (!on) return;
    const last = Number(growth.max);
    if (frame >= last) {
      frame = 0;
      growth.value = '0';
      showFrame();
    }
    timer = window.setInterval(() => {
      frame = Math.min(frame + 1, last);
      growth.value = String(frame);
      showFrame();
      if (frame >= last) setPlaying(false);
    }, PLAY_STEP_MS);
  }

  function zoomBy(factor: number) {
    zoom = clamp(zoom * factor, 1, MAX_ZOOM);
    if (zoom === 1) panX = panY = 0;
    invalidate();
  }
  function markView(name: string | null) {
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  }

  // — Controls —
  caseBtns.forEach((b, n) => b.addEventListener('click', () => setCase(n)));
  playBtn.addEventListener('click', () => setPlaying(!timer));
  growth.addEventListener('input', () => {
    setPlaying(false);
    frame = Number(growth.value);
    showFrame();
  });
  lo.addEventListener('input', () => setSlice(lo));
  hi.addEventListener('input', () => setSlice(hi));
  dopBtn.addEventListener('click', () => {
    dopOnly = !dopOnly;
    dopBtn.setAttribute('aria-pressed', String(dopOnly));
    material.uniforms.uDopOnly.value = dopOnly ? 1 : 0;
    invalidate();
  });
  viewBtns.forEach((b) =>
    b.addEventListener('click', () => {
      ({ az, el } = PRESETS[b.dataset.view!]);
      zoom = 1;
      panX = panY = 0;
      markView(b.dataset.view!);
      invalidate();
    }),
  );
  $('[data-act="zoom-in"]').addEventListener('click', () => zoomBy(1.3));
  $('[data-act="zoom-out"]').addEventListener('click', () => zoomBy(1 / 1.3));

  // Pointer: mouse drags both axes (Shift pans); touch rotates horizontally (vertical swipes
  // scroll the page, see touch-action in the component); two fingers pinch-zoom and pan.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (e.pointerType === 'mouse') canvas.focus({ preventScroll: true });
    root.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) zoom = clamp((zoom * d) / pinchDist, 1, MAX_ZOOM);
      pinchDist = d;
      panX -= dx / 2 / pxPerUnit;
      panY += dy / 2 / pxPerUnit;
    } else if (e.shiftKey) {
      panX -= dx / pxPerUnit;
      panY += dy / pxPerUnit;
    } else {
      az -= dx * 0.006;
      if (e.pointerType === 'mouse') el = clamp(el + dy * 0.005, EL_MIN, EL_MAX);
      markView(null);
    }
    invalidate();
  });
  const release = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    pinchDist = 0;
    if (pointers.size === 0) root.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => {
    // Give the wheel back to the page once the mouse leaves the scene.
    if (e.pointerType === 'mouse' && pointers.size === 0 && document.activeElement === canvas) canvas.blur();
  });
  // The wheel zooms only after a click on the scene (or with Ctrl / trackpad pinch),
  // so scrolling the page past the figure is never hijacked.
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && document.activeElement !== canvas) return;
      e.preventDefault();
      zoomBy(Math.exp(-clamp(e.deltaY, -120, 120) * 0.0022));
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') az -= 0.14;
    else if (k === 'ArrowRight') az += 0.14;
    else if (k === 'ArrowUp') el = clamp(el + 0.1, EL_MIN, EL_MAX);
    else if (k === 'ArrowDown') el = clamp(el - 0.1, EL_MIN, EL_MAX);
    else if (k === '+' || k === '=') return void (zoomBy(1.25), e.preventDefault());
    else if (k === '-' || k === '_') return void (zoomBy(0.8), e.preventDefault());
    else return;
    e.preventDefault();
    markView(null);
    invalidate();
  });

  function resize() {
    const r = stage.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    width = r.width;
    height = r.height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    draw();
  }
  new ResizeObserver(resize).observe(stage);
  canvas.addEventListener('webglcontextrestored', invalidate);

  markView('oblique');
  setCase(0);
  resize();
  controls.hidden = false;
  root.classList.add('is-live');
}
