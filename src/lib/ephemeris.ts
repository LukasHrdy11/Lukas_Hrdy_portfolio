// Heliocentric positions from Keplerian elements (ecliptic and equinox J2000, au).
// Follows the `method` field of public/data/orbits.json (JPL "Approximate Positions
// of the Planets", Standish & Williams 1992) plus a hyperbolic branch for the comet.
// Pure functions, no DOM — checked by scripts/check-ephemeris.ts.

export interface PlanetElements {
  a_au: number;
  e: number;
  I_deg: number;
  L_deg: number;
  varpi_deg: number;
  Omega_deg: number;
}

export interface Planet {
  name: string;
  elements: PlanetElements;
  rates_per_century: PlanetElements;
}

export interface Comet {
  name: string;
  perihelion_JD: number;
  q_au: number;
  e: number;
  i_deg: number;
  omega_deg: number;
  Omega_deg: number;
}

export interface OrbitData {
  planets: Planet[];
  comet: Comet;
}

export type Vec3 = [number, number, number];

const RAD = Math.PI / 180;
const J2000 = 2451545.0;
/** Gaussian gravitational constant, rad/day. */
const GAUSS_K = 0.01720209895;
const UNIX_EPOCH_JD = 2440587.5;
const DAY_MS = 86_400_000;

export const jdFromMs = (ms: number): number => ms / DAY_MS + UNIX_EPOCH_JD;
export const msFromJd = (jd: number): number => (jd - UNIX_EPOCH_JD) * DAY_MS;

/** Solve Kepler's equation M = E − e·sin E (radians, elliptic orbit). */
export function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Solve the hyperbolic Kepler equation M = e·sinh H − H.
 * Safe for near-parabolic orbits (e − 1 ≪ 1): the start is the real root of the
 * series truncated after the cubic term, e·H³/6 + (e − 1)·H = |M|. Because
 * sinh H ≥ H + H³/6, that root lies above the true one, and Newton's method on a
 * convex increasing function then converges monotonically from above.
 */
export function solveHyperbolicKepler(M: number, e: number): number {
  const m = Math.abs(M);
  if (m === 0) return 0;
  // Depressed cubic H³ + pH − q = 0 with p > 0 has exactly one real root (Cardano).
  const p = (6 * (e - 1)) / e;
  const q = (6 * m) / e;
  const s = Math.sqrt((q * q) / 4 + (p * p * p) / 27);
  let H = Math.cbrt(q / 2 + s) - Math.cbrt(s - q / 2);
  for (let i = 0; i < 50; i++) {
    const dH = (e * Math.sinh(H) - H - m) / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < 1e-14 * Math.max(1, H)) break;
  }
  return Math.sign(M) * H;
}

/** Rotate orbital-plane coordinates (x′ towards perihelion) to the J2000 ecliptic. */
function toEcliptic(xp: number, yp: number, omega: number, I: number, Omega: number): Vec3 {
  const co = Math.cos(omega), so = Math.sin(omega);
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  const cI = Math.cos(I), sI = Math.sin(I);
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    so * sI * xp + co * sI * yp,
  ];
}

/** Heliocentric position of a planet at Julian date `jd`. */
export function planetPosition(planet: Planet, jd: number): Vec3 {
  const T = (jd - J2000) / 36525;
  const el = planet.elements;
  const rt = planet.rates_per_century;
  const a = el.a_au + rt.a_au * T;
  const e = el.e + rt.e * T;
  const I = (el.I_deg + rt.I_deg * T) * RAD;
  const L = el.L_deg + rt.L_deg * T;
  const varpi = el.varpi_deg + rt.varpi_deg * T;
  const Omega = el.Omega_deg + rt.Omega_deg * T;

  const omega = (varpi - Omega) * RAD;
  let M = (L - varpi) % 360;
  if (M > 180) M -= 360;
  if (M < -180) M += 360;
  const E = solveKepler(M * RAD, e);

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return toEcliptic(xp, yp, omega, I, Omega * RAD);
}

/** Orbital period of a planet in days (Kepler's third law, solar mass only). */
export const planetPeriodDays = (planet: Planet): number =>
  (2 * Math.PI * planet.elements.a_au ** 1.5) / GAUSS_K;

/** Heliocentric position of a comet on a hyperbolic orbit (e > 1) at Julian date `jd`. */
export function cometPosition(comet: Comet, jd: number): Vec3 {
  const { e, q_au: q } = comet;
  const absA = q / (e - 1);
  const n = GAUSS_K / absA ** 1.5;
  const H = solveHyperbolicKepler(n * (jd - comet.perihelion_JD), e);
  // cosh H − 1 = 2·sinh²(H/2): no cancellation near perihelion, where |a| ≈ 3900 au.
  const sh = Math.sinh(H / 2);
  const xp = q - absA * 2 * sh * sh;
  const yp = absA * Math.sqrt(e * e - 1) * Math.sinh(H);
  return toEcliptic(xp, yp, comet.omega_deg * RAD, comet.i_deg * RAD, comet.Omega_deg * RAD);
}

export const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
