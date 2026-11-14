// Live 3D Solar System for the hero (PLAN.md §6.1).
// Loaded on demand by SolarSystem.astro; all positions come from src/lib/ephemeris.ts.
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NormalBlending,
  PerspectiveCamera,
  PointLight,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  cometPosition,
  jdFromMs,
  norm,
  planetPeriodDays,
  planetPosition,
  type OrbitData,
  type Vec3,
} from '../lib/ephemeris';

interface Strings {
  lang: string;
  play: string;
  pause: string;
  names: Record<string, string>;
}

// Colours mirror src/styles/tokens.css.
const C_STAR = 0xe7ecf5;
const C_ICE = 0x8fd3ff;
const C_AMBER = 0xf2b25c;
const C_SUN = 0xf7c987;

// Stylised bodies: radius in scene units (not to scale) and a muted colour.
const BODIES: Record<string, { radius: number; color: number }> = {
  Mercury: { radius: 0.034, color: 0xa39f9a },
  Venus: { radius: 0.05, color: 0xdcc9a3 },
  EM_Bary: { radius: 0.054, color: 0x74aee0 },
  Mars: { radius: 0.042, color: 0xcc8262 },
  Jupiter: { radius: 0.13, color: 0xd6bb95 },
  Saturn: { radius: 0.108, color: 0xdfcda6 },
  Uranus: { radius: 0.08, color: 0xa6d9dc },
  Neptune: { radius: 0.078, color: 0x7b97e0 },
};
const SUN_RADIUS = 0.15;

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;
// The JPL Table 1 elements are valid for 1800–2050 AD.
const T_MIN = Date.UTC(1800, 0, 1);
const T_MAX = Date.UTC(2050, 11, 31);
// The comet and its path are shown within ±6 years of perihelion (see orbits.json).
const COMET_SPAN_DAYS = 6 * YEAR_DAYS;

const FOV = 38;
const FIT_RADIUS = 5.75; // just outside Neptune's compressed orbit (√30.07 ≈ 5.48)
const MIN_DIST = 1.6;
const MAX_ZOOM = 1.5;
const MIN_BODY_PX = 2.4;

/** Ecliptic au → scene units: radial distance compressed as √r, ecliptic north = +Y. */
function toScene(p: Vec3, out: Vector3): Vector3 {
  const r = norm(p);
  const k = r > 0 ? Math.sqrt(r) / r : 0;
  return out.set(p[0] * k, p[2] * k, -p[1] * k);
}

/** Deterministic PRNG (mulberry32) so the sky looks the same on every visit. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round soft points with per-vertex size (CSS px) and alpha. */
function pointsMaterial(color: number, additive: boolean) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uPx: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uPx;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.12, d) * vAlpha * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(247, 201, 135, 0.9)');
  g.addColorStop(0.2, 'rgba(242, 178, 92, 0.35)');
  g.addColorStop(0.5, 'rgba(242, 178, 92, 0.08)');
  g.addColorStop(1, 'rgba(242, 178, 92, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

interface Body {
  key: string;
  radius: number;
  pos: Vector3;
  au: number | null; // heliocentric distance; null for the Sun
  visible: boolean;
  label: HTMLElement;
  dist: HTMLElement | null;
  shown: string;
  orbit?: LineLoop;
}

export async function mountSolarSystem(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const labelLayer = root.querySelector<HTMLElement>('[data-labels]')!;
  const controls = root.querySelector<HTMLElement>('[data-controls]')!;
  const playBtn = controls.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const labelsBtn = controls.querySelector<HTMLButtonElement>('[data-act="labels"]')!;
  const speedSel = controls.querySelector<HTMLSelectElement>('[data-speed]')!;
  const dateOut = controls.querySelector<HTMLElement>('[data-date]')!;
  const strings = JSON.parse(root.dataset.strings!) as Strings;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return; // no WebGL → the static SVG stays
  }
  const res = await fetch(root.dataset.orbits!);
  if (!res.ok) return;
  const data = (await res.json()) as OrbitData;

  const small = matchMedia('(max-width: 40rem)').matches;
  const wide = matchMedia('(min-width: 56rem)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = new Intl.NumberFormat(strings.lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 400);
  scene.add(new AmbientLight(0x9fb2d6, 0.55));
  scene.add(new PointLight(0xfff0dc, 3.2, 0, 0));

  // — Stars —
  const rand = prng(1798);
  const starCount = small ? 500 : 1000;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const starAlpha = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos.set([120 * s * Math.cos(phi), 120 * u, 120 * s * Math.sin(phi)], i * 3);
    const m = rand();
    starSize[i] = 1.2 + m * m * 2.2;
    starAlpha[i] = 0.2 + rand() * 0.6;
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new BufferAttribute(starSize, 1));
  starGeo.setAttribute('aAlpha', new BufferAttribute(starAlpha, 1));
  const starMat = pointsMaterial(C_STAR, false);
  scene.add(new Points(starGeo, starMat));

  // — Sun —
  const sphere = new SphereGeometry(1, small ? 16 : 28, small ? 12 : 20);
  const sun = new Mesh(sphere, new MeshBasicMaterial({ color: C_SUN }));
  sun.scale.setScalar(SUN_RADIUS);
  scene.add(sun);
  const glow = new Sprite(
    new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, depthWrite: false, transparent: true }),
  );
  glow.scale.setScalar(2.2);
  scene.add(glow);

  // — Labels —
  function makeLabel(name: string, withDistance: boolean) {
    const el = document.createElement('div');
    el.className = 'solar__label';
    el.hidden = true;
    const n = document.createElement('span');
    n.textContent = name;
    el.append(n);
    let dist: HTMLElement | null = null;
    if (withDistance) {
      dist = document.createElement('span');
      dist.className = 'solar__label-dist';
      el.append(dist);
    }
    labelLayer.append(el);
    return { label: el, dist };
  }

  const bodies: Body[] = [];
  bodies.push({
    key: 'Sun', radius: SUN_RADIUS, pos: new Vector3(), au: null, visible: true, shown: '',
    ...makeLabel(strings.names.Sun, false),
  });

  // — Planets and their orbits —
  const jdNow = jdFromMs(Date.now());
  const tmp = new Vector3();
  const planetMeshes: Mesh[] = [];
  for (const planet of data.planets) {
    const style = BODIES[planet.name];
    const mesh = new Mesh(sphere, new MeshLambertMaterial({ color: style.color }));
    mesh.scale.setScalar(style.radius);
    scene.add(mesh);
    planetMeshes.push(mesh);

    if (planet.name === 'Saturn') {
      const ring = new Mesh(
        new RingGeometry(1.35, 2.15, 56),
        new MeshBasicMaterial({ color: 0xcbb98f, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2 + (26.7 * Math.PI) / 180;
      mesh.add(ring);
    }

    // One full revolution sampled in time (uniform in mean anomaly).
    const N = 240;
    const period = planetPeriodDays(planet);
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      toScene(planetPosition(planet, jdNow + (period * i) / N), tmp).toArray(pts, i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pts, 3));
    const orbit = new LineLoop(geo, new LineBasicMaterial({ color: C_ICE, transparent: true, opacity: 0.26 }));
    scene.add(orbit);

    bodies.push({
      key: planet.name, radius: style.radius, pos: mesh.position, au: 0, visible: true, shown: '', orbit,
      ...makeLabel(strings.names[planet.name], true),
    });
  }

  // — Comet C/2017 K2: path, head and a short tail pointing away from the Sun —
  const { comet } = data;
  {
    const N = 260;
    const pts = new Float32Array(N * 3);
    const cols = new Float32Array(N * 3);
    const amber = new Color(C_AMBER);
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * 2 - 1;
      // denser sampling near perihelion, where the path curves
      const dt = COMET_SPAN_DAYS * Math.sign(s) * Math.abs(s) ** 1.7;
      toScene(cometPosition(comet, comet.perihelion_JD + dt), tmp).toArray(pts, i * 3);
      const fade = 0.5 * (1 - Math.abs(s) ** 3);
      cols.set([amber.r * fade, amber.g * fade, amber.b * fade], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pts, 3));
    geo.setAttribute('color', new BufferAttribute(cols, 3));
    scene.add(new Line(geo, new LineBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false })));
  }
  const TAIL = 22;
  const cometPts = new Float32Array(TAIL * 3);
  const cometSize = new Float32Array(TAIL);
  const cometAlpha = new Float32Array(TAIL);
  for (let i = 0; i < TAIL; i++) {
    const f = i / (TAIL - 1);
    cometSize[i] = i === 0 ? 7 : 6 - 4.5 * f;
    cometAlpha[i] = i === 0 ? 1 : 0.42 * (1 - f) ** 1.5;
  }
  const cometGeo = new BufferGeometry();
  const cometPosAttr = new BufferAttribute(cometPts, 3);
  cometGeo.setAttribute('position', cometPosAttr);
  cometGeo.setAttribute('aSize', new BufferAttribute(cometSize, 1));
  cometGeo.setAttribute('aAlpha', new BufferAttribute(cometAlpha, 1));
  const cometMat = pointsMaterial(C_AMBER, true);
  const cometPoints = new Points(cometGeo, cometMat);
  cometPoints.frustumCulled = false;
  scene.add(cometPoints);
  const cometBody: Body = {
    key: 'comet', radius: 0.03, pos: new Vector3(), au: 0, visible: true, shown: '',
    ...makeLabel(strings.names.comet, true),
  };
  bodies.push(cometBody);

  // — State —
  let simMs = Date.now();
  let playing = !reducedMotion;
  let daysPerSecond = Number(speedSel.value);
  let labelsOn = false;
  let hovered: Body | null = null;
  let pinned: Body | null = null;
  let dirty = true;

  let width = 1;
  let height = 1;
  let baseDist = 15;
  let zoom = 1;
  let zoomT = 1;
  let az = -0.5;
  let azT = az;
  let el = 0.5;
  let elT = el;
  const EL_MAX = 1.5;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const zoomBy = (factor: number) => {
    zoomT = clamp(zoomT * factor, MIN_DIST / baseDist, MAX_ZOOM);
  };

  function updateBodies() {
    const jd = jdFromMs(simMs);
    data.planets.forEach((planet, i) => {
      const p = planetPosition(planet, jd);
      toScene(p, planetMeshes[i].position);
      bodies[i + 1].au = norm(p);
    });

    const dtPeri = Math.abs(jd - comet.perihelion_JD);
    cometBody.visible = dtPeri < COMET_SPAN_DAYS;
    cometPoints.visible = cometBody.visible;
    if (cometBody.visible) {
      const p = cometPosition(comet, jd);
      const r = norm(p);
      cometBody.au = r;
      toScene(p, cometBody.pos);
      // Tail: straight away from the Sun, longer when closer to it (stylised).
      const len = clamp(1.5 / r, 0.12, 0.7);
      tmp.copy(cometBody.pos).normalize();
      for (let i = 0; i < TAIL; i++) {
        const f = (i / (TAIL - 1)) * len;
        cometPts[i * 3] = cometBody.pos.x + tmp.x * f;
        cometPts[i * 3 + 1] = cometBody.pos.y + tmp.y * f;
        cometPts[i * 3 + 2] = cometBody.pos.z + tmp.z * f;
      }
      cometPosAttr.needsUpdate = true;
      cometMat.uniforms.uOpacity.value = clamp((COMET_SPAN_DAYS - dtPeri) / (0.5 * YEAR_DAYS), 0, 1);
    }
    dateOut.textContent = `${new Date(simMs).toISOString().slice(0, 10)} UTC`;
  }

  function updateCamera() {
    const d = baseDist * zoom;
    camera.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  /** Project to CSS pixels; z > 1 means behind the camera / outside the frustum depth. */
  const ndc = new Vector3();
  function project(pos: Vector3) {
    ndc.copy(pos).project(camera);
    return { x: (ndc.x * 0.5 + 0.5) * width, y: (-ndc.y * 0.5 + 0.5) * height, z: ndc.z };
  }

  function updateOverlay() {
    const pxPerUnitAt1 = height / (2 * Math.tan((FOV * Math.PI) / 360));
    bodies.forEach((b, i) => {
      // Keep small planets from vanishing when zoomed out.
      if (i > 0 && b !== cometBody) {
        const px = (b.radius * pxPerUnitAt1) / camera.position.distanceTo(b.pos);
        planetMeshes[i - 1].scale.setScalar(b.radius * Math.max(1, MIN_BODY_PX / px));
      }
      if (b.orbit) (b.orbit.material as LineBasicMaterial).opacity = b === hovered || b === pinned ? 0.7 : 0.26;

      const show = b.visible && (b === hovered || b === pinned || (labelsOn && b.au !== null));
      if (!show) {
        b.label.hidden = true;
        return;
      }
      const s = project(b.pos);
      if (s.z > 1 || s.x < 0 || s.x > width || s.y < 0 || s.y > height) {
        b.label.hidden = true;
        return;
      }
      b.label.hidden = false;
      b.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      if (b.dist && b.au !== null) {
        const text = `${fmt.format(b.au)} au`;
        if (text !== b.shown) b.dist.textContent = b.shown = text;
      }
    });
  }

  function pick(x: number, y: number, reach: number): Body | null {
    let best: Body | null = null;
    let bestD = reach;
    for (const b of bodies) {
      if (!b.visible) continue;
      const s = project(b.pos);
      if (s.z > 1) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    starMat.uniforms.uPx.value = dpr;
    cometMat.uniforms.uPx.value = dpr;

    camera.aspect = width / height;
    // Wide layout: the text sits on the left, so the Sun moves to ~2/3 of the width.
    const shift = wide.matches ? 0.16 : 0;
    if (shift) camera.setViewOffset(width, height, -shift * width, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    const t = Math.tan((FOV * Math.PI) / 360);
    const halfWidthShare = 1 - 2 * shift;
    const fitH = FIT_RADIUS / (t * camera.aspect * halfWidthShare);
    const fitV = (FIT_RADIUS * Math.sin(elT) + 0.5) / t;
    baseDist = Math.max(fitH, fitV) * 1.06;
    zoomBy(1);
    dirty = true;
  }

  // — Controls —
  function setPlaying(on: boolean) {
    playing = on;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? strings.pause : strings.play);
    playBtn.title = on ? strings.pause : strings.play;
  }
  playBtn.addEventListener('click', () => {
    // Restart from the valid range's edge if the clock stopped there.
    if (!playing && simMs >= T_MAX) simMs = Date.now();
    setPlaying(!playing);
  });
  speedSel.addEventListener('change', () => {
    daysPerSecond = Number(speedSel.value);
  });
  controls.querySelector('[data-act="now"]')!.addEventListener('click', () => {
    simMs = Date.now();
    updateBodies();
    dirty = true;
  });
  labelsBtn.addEventListener('click', () => {
    labelsOn = !labelsOn;
    labelsBtn.setAttribute('aria-pressed', String(labelsOn));
    dirty = true;
  });
  controls.querySelector('[data-act="zoom-in"]')!.addEventListener('click', () => zoomBy(0.75));
  controls.querySelector('[data-act="zoom-out"]')!.addEventListener('click', () => zoomBy(1 / 0.75));

  // Pointer: mouse drags both axes; touch rotates horizontally (vertical swipes scroll
  // the page, see touch-action in the component) and pinches to zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let travel = 0;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    travel = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (e.pointerType === 'mouse') canvas.focus({ preventScroll: true });
    root.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') {
        const p = local(e);
        const hit = pick(p.x, p.y, 18);
        if (hit !== hovered) {
          hovered = hit;
          dirty = true;
        }
      }
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    travel += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      pinchDist = d;
    } else {
      azT -= dx * 0.006;
      if (e.pointerType === 'mouse') elT = clamp(elT + dy * 0.005, -EL_MAX, EL_MAX);
    }
  });
  const release = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    pinchDist = 0;
    if (pointers.size === 0) root.classList.remove('is-dragging');
    if (e.type === 'pointerup' && travel < 6) {
      const p = local(e);
      const hit = pick(p.x, p.y, e.pointerType === 'mouse' ? 18 : 28);
      pinned = hit === pinned ? null : hit;
      dirty = true;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (hovered) {
      hovered = null;
      dirty = true;
    }
    // Give the wheel back to the page once the mouse leaves the scene.
    if (pointers.size === 0 && document.activeElement === canvas) canvas.blur();
  });
  // The wheel zooms only after a click on the scene (or with Ctrl / trackpad pinch),
  // so scrolling the page past the hero is never hijacked.
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && document.activeElement !== canvas) return;
      e.preventDefault();
      zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * 0.0022));
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') azT -= 0.14;
    else if (k === 'ArrowRight') azT += 0.14;
    else if (k === 'ArrowUp') elT = clamp(elT + 0.1, -EL_MAX, EL_MAX);
    else if (k === 'ArrowDown') elT = clamp(elT - 0.1, -EL_MAX, EL_MAX);
    else if (k === '+' || k === '=') zoomBy(0.8);
    else if (k === '-' || k === '_') zoomBy(1.25);
    else if (k === ' ') playBtn.click();
    else return;
    e.preventDefault();
  });

  // — Loop: runs only while the scene is on screen and the tab is visible —
  let raf = 0;
  let last = 0;
  let inView = true;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (playing) {
      simMs += dt * daysPerSecond * DAY_MS;
      if (simMs >= T_MAX || simMs <= T_MIN) {
        simMs = clamp(simMs, T_MIN, T_MAX);
        setPlaying(false);
      }
      updateBodies();
      dirty = true;
    }

    const ease = 1 - Math.exp(-dt * 9);
    if (Math.abs(azT - az) + Math.abs(elT - el) + Math.abs(zoomT - zoom) > 1e-4) {
      az += (azT - az) * ease;
      el += (elT - el) * ease;
      zoom += (zoomT - zoom) * ease;
      dirty = true;
    }

    if (!dirty) return;
    dirty = false;
    updateCamera();
    updateOverlay();
    renderer.render(scene, camera);
  }
  function setRunning() {
    const run = inView && !document.hidden;
    if (run && !raf) {
      last = performance.now();
      dirty = true;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    setRunning();
  }).observe(root);
  document.addEventListener('visibilitychange', setRunning);
  new ResizeObserver(resize).observe(root);
  wide.addEventListener('change', resize);

  setPlaying(playing);
  resize();
  zoom = zoomT;
  updateBodies();
  updateCamera();
  updateOverlay();
  renderer.render(scene, camera);
  controls.hidden = false;
  root.classList.add('is-live');
  setRunning();
}
