// Simplified illustration of the STM constant-current feedback loop (PLAN.md §6.4).
// Lengths are in atom spacings, time in seconds; this is a sketch, not the project's simulation.

const KAPPA = 6; // decay constant of the tunnelling current, per atom spacing (exaggerated corrugation)
const D_SET = 0.8; // tip–atom distance at which a single atom gives the set-point current
const TAU = 0.08; // response time of the z-piezo (s)
const SPEED = 1.6; // scan speed (atom spacings per second)
const SUBSTEP = 1 / 600;
const ROW_HEIGHT = Math.sqrt(3) / 2;
const VIEW_TOP = 5.1;
const VIEW_BOTTOM = -0.75;
const END_PAUSE = 0.7;

const C_ICE = '#8fd3ff';
const C_AMBER = '#f2b25c';
const C_DIM = '#9aa7bf';
const C_ATOM = 'rgba(95, 159, 201, 0.55)';
const C_DEEP = '#0c1322';

interface Atom { x: number; y: number }

export function mountStmTip(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pIn = root.querySelector<HTMLInputElement>('[data-gain="p"]')!;
  const iIn = root.querySelector<HTMLInputElement>('[data-gain="i"]')!;
  const pOut = root.querySelector<HTMLElement>('[data-out="p"]')!;
  const iOut = root.querySelector<HTMLElement>('[data-out="i"]')!;
  const playBtn = root.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const currentOut = root.querySelector<HTMLElement>('[data-current]')!;
  const lang = root.dataset.lang!;
  const nf1 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // — Scene (rebuilt on resize: fewer atoms on narrow screens) —
  let width = 1;
  let height = 1;
  let scale = 1;
  let span = 16;
  let atoms: Atom[] = [];
  let ideal: number[] = []; // constant-current contour sampled every 1/20 atom spacing
  let x0 = 1;
  let x1 = 15;

  /** ln(I / I_set) for the tip apex at (x, z): sum of exponential contributions of nearby atoms. */
  function logCurrent(x: number, z: number) {
    let sum = 0;
    for (const a of atoms) {
      const dx = a.x - x;
      if (dx > 3 || dx < -3) continue;
      sum += Math.exp(-2 * KAPPA * (Math.hypot(dx, z - a.y) - D_SET));
    }
    return Math.log(sum);
  }
  function idealHeight(x: number) {
    let lo = 0.6;
    let hi = 5;
    for (let n = 0; n < 30; n++) {
      const mid = (lo + hi) / 2;
      if (logCurrent(x, mid) > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // — Simulation state —
  let x = 0;
  let z = 0;
  let integral = 0;
  let pause = 0;
  let trace: number[] = []; // x, z pairs
  let playing = !reducedMotion;

  function restartScan() {
    x = x0;
    z = idealHeight(x);
    integral = z;
    pause = 0;
    trace = [x, z];
  }
  function step(dt: number) {
    const kp = Number(pIn.value);
    const ki = Number(iIn.value);
    let t = dt;
    while (t > 0) {
      const h = Math.min(SUBSTEP, t);
      t -= h;
      if (x >= x1) {
        pause += h;
        if (pause > END_PAUSE) restartScan();
        continue;
      }
      // The controller acts on the logarithm of the current, as a real STM log amplifier does.
      const error = Math.max(-3, Math.min(3, logCurrent(x, z)));
      integral += ki * error * h;
      z += ((kp * error + integral - z) * h) / TAU;
      z = Math.min(VIEW_TOP - 0.6, Math.max(0.6, z));
      x += SPEED * h;
      if (x - trace[trace.length - 2] > 0.02) trace.push(x, z);
    }
  }

  function build() {
    span = width < 480 ? 11 : 16;
    scale = width / span;
    height = Math.round((VIEW_TOP - VIEW_BOTTOM) * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    atoms = [];
    for (let n = -1; n <= span + 1; n++) atoms.push({ x: n, y: 0 });
    const from = Math.round(span * 0.4);
    const to = Math.round(span * 0.66);
    for (let n = from; n < to; n++) atoms.push({ x: n + 0.5, y: ROW_HEIGHT });
    x0 = 1;
    x1 = span - 1;
    ideal = [];
    for (let q = 0; q <= (x1 - x0) * 20; q++) ideal.push(idealHeight(x0 + q / 20));
    restartScan();
    if (!playing) step((x1 - x0) / SPEED); // static frame: one finished scan line
  }

  const px = (u: number) => u * scale;
  const py = (v: number) => (VIEW_TOP - v) * scale;

  function draw() {
    const c = ctx!;
    c.clearRect(0, 0, width, height);

    c.fillStyle = C_ATOM;
    for (const a of atoms) {
      c.beginPath();
      c.arc(px(a.x), py(a.y), 0.46 * scale, 0, 2 * Math.PI);
      c.fill();
    }

    c.lineWidth = 1;
    c.strokeStyle = C_DIM;
    c.setLineDash([4, 4]);
    c.beginPath();
    ideal.forEach((v, q) => (q ? c.lineTo(px(x0 + q / 20), py(v)) : c.moveTo(px(x0), py(v))));
    c.stroke();
    c.setLineDash([]);

    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.strokeStyle = C_AMBER;
    c.beginPath();
    for (let q = 0; q < trace.length; q += 2) {
      if (q) c.lineTo(px(trace[q]), py(trace[q + 1]));
      else c.moveTo(px(trace[q]), py(trace[q + 1]));
    }
    c.stroke();

    // Tip: a cone ending in a single apex atom
    const tx = px(Math.min(x, x1));
    const ty = py(z);
    const r = 0.2 * scale;
    c.fillStyle = C_DEEP;
    c.strokeStyle = C_ICE;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(tx - 1.15 * scale, -2);
    c.lineTo(tx - r * 0.8, ty - r * 1.2);
    c.lineTo(tx + r * 0.8, ty - r * 1.2);
    c.lineTo(tx + 1.15 * scale, -2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(tx, ty - r, r, 0, 2 * Math.PI);
    c.fill();
    c.stroke();

    currentOut.textContent = nf2.format(Math.exp(logCurrent(Math.min(x, x1), z)));
  }

  // — Loop: runs only while playing, on screen and in a visible tab —
  let raf = 0;
  let last = 0;
  let inView = true;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    step(Math.min((now - last) / 1000, 0.05));
    last = now;
    draw();
  }
  function setRunning() {
    const run = playing && inView && !document.hidden;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function showGains() {
    pOut.textContent = nf2.format(Number(pIn.value));
    iOut.textContent = nf1.format(Number(iIn.value));
  }
  for (const input of [pIn, iIn]) {
    input.addEventListener('input', () => {
      showGains();
      if (!playing) {
        restartScan();
        step((x1 - x0) / SPEED);
        draw();
      }
    });
  }
  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.setAttribute('aria-label', playing ? playBtn.dataset.pause! : playBtn.dataset.play!);
    if (playing && x >= x1) restartScan();
    setRunning();
  });
  playBtn.setAttribute('aria-pressed', String(playing));
  playBtn.setAttribute('aria-label', playing ? playBtn.dataset.pause! : playBtn.dataset.play!);

  new ResizeObserver(() => {
    const w = canvas.parentElement!.clientWidth;
    if (w < 10 || w === width) return;
    width = w;
    build();
    draw();
  }).observe(canvas.parentElement!);
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    setRunning();
  }).observe(canvas);
  document.addEventListener('visibilitychange', setRunning);

  showGains();
  root.classList.add('is-live');
  setRunning();
}
