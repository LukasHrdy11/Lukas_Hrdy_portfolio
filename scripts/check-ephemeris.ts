// Acceptance checks for src/lib/ephemeris.ts (PLAN.md §6.1 "Done when").
// Run: npm run check:ephemeris
import { readFileSync } from 'node:fs';
import {
  cometPosition,
  jdFromMs,
  norm,
  planetPosition,
  solveHyperbolicKepler,
  type OrbitData,
  type Vec3,
} from '../src/lib/ephemeris';

const data = JSON.parse(readFileSync('public/data/orbits.json', 'utf8')) as OrbitData & {
  comet: { validation: { rows: (string | number)[][] } };
};
const planet = (name: string) => data.planets.find((p) => p.name === name)!;

let failed = 0;
function check(label: string, value: number, expected: number, tol: number) {
  const ok = Math.abs(value - expected) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${value.toFixed(5)} (expected ${expected} ± ${tol})`);
}

// (a) Sanity: distances and the Earth's longitude at the March equinox.
const equinox = jdFromMs(Date.UTC(2026, 2, 20, 14, 46));
const earth = planetPosition(planet('EM_Bary'), equinox);
check('Earth distance [au]', norm(earth), 1.0, 0.02);
check('Jupiter distance [au]', norm(planetPosition(planet('Jupiter'), equinox)), 5.2, 0.3);
const lon = ((Math.atan2(earth[1], earth[0]) * 180) / Math.PI + 360) % 360;
// At the equinox the longitude is 180° in the equinox of date; the elements are
// referred to J2000, so general precession (50.29″/yr × 26.2 yr) is subtracted.
const precession = (50.29 / 3600) * ((equinox - 2451545) / 365.25);
check('Earth heliocentric longitude at 2026-03-20 [deg, J2000]', lon, 180 - precession, 0.05);

// (b) Comet C/2017 K2 against the output of the SOČ program.
const { comet } = data;
check('comet r(T_perihelion) [au]', norm(cometPosition(comet, comet.perihelion_JD)), comet.q_au, 1e-9);
for (const row of comet.validation.rows) {
  const [date, jd, , , , , rSun, delta, earthSun] = row as [string, ...number[]];
  const c = cometPosition(comet, jd);
  const e = planetPosition(planet('EM_Bary'), jd);
  const d: Vec3 = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
  check(`${date} comet–Sun [au]`, norm(c), rSun, 0.01);
  check(`${date} comet–Earth [au]`, norm(d), delta, 0.01);
  check(`${date} Earth–Sun [au]`, norm(e), earthSun, 0.01);
}

// Solver: the residual of M = e·sinh H − H stays tiny across the whole range used.
let worst = 0;
for (let M = -3e-4; M <= 3e-4; M += 1e-6) {
  const H = solveHyperbolicKepler(M, comet.e);
  worst = Math.max(worst, Math.abs(comet.e * Math.sinh(H) - H - M));
}
check('hyperbolic solver worst residual', worst, 0, 1e-15);

// Continuity through perihelion (no jump between consecutive hours).
let maxStep = 0;
let prev = cometPosition(comet, comet.perihelion_JD - 2);
for (let h = 1; h <= 96; h++) {
  const cur = cometPosition(comet, comet.perihelion_JD - 2 + h / 24);
  maxStep = Math.max(maxStep, Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]));
  prev = cur;
}
check('comet max hourly step near perihelion [au]', maxStep, 0.00075, 0.0001);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall ephemeris checks passed');
