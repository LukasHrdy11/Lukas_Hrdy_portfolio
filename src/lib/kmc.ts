// Decoding of the kMC crystal crops in public/data/kmc-t10-crystal.json (PLAN.md §6.2).
// Pure functions, no DOM: used by src/scripts/kmc-crystal.ts.

export interface KmcFrame {
  /** deposited layers at the time of the snapshot */
  layers: number;
  /** absolute atomic level of k = 0 */
  z_lo: number;
  /** base64 of numpy packbits (MSB first) over C-order (i, j, k) */
  occ: string;
  dop: string;
}

export interface KmcRun {
  point: string;
  f3_shape: [number, number, number];
  f3: KmcFrame[];
}

export interface KmcData {
  runs: KmcRun[];
  'cells_f0.03': Record<string, { excess: number; excess_sd: number }>;
}

export interface DecodedFrame {
  count: number;
  dopants: number;
  /** scene coordinates (x, up, depth), centred on the crop, 3 floats per atom */
  position: Float32Array;
  /** per atom: level index k within the crop */
  level: Float32Array;
  /** per atom: 0 = Al, 1 = dopant */
  kind: Float32Array;
  /** per atom: 0…1 height shade; the rough growth front gets the upper part of the ramp */
  shade: Float32Array;
}

const SQ3 = Math.sqrt(3);
/** Level spacing c/6 in units of the in-plane site spacing a/√3 (α-Al₂O₃: a = 4.785 Å, c = 12.991 Å). */
export const LEVEL_STEP = 12.991 / 6 / (4.785 / SQ3);
/** Share of the height ramp used by the fully filled levels below the growth front. */
const BULK_SHADE = 0.5;

export function unpackBits(b64: string, n: number): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(n);
  for (let q = 0; q < n; q++) out[q] = (s.charCodeAt(q >> 3) >> (7 - (q & 7))) & 1;
  return out;
}

/** Size of the crop in scene units: [x, up, depth]. The footprint is a parallelogram (sheared hexagonal lattice). */
export function cropExtent([nx, ny, nz]: [number, number, number]): [number, number, number] {
  return [nx - 1 + (ny - 1) / 2, (nz - 1) * LEVEL_STEP, ((ny - 1) * SQ3) / 2];
}

/** Site (i, j, k) → x = i + j/2, y = j·√3/2, z = k; scene axes are (x, z·LEVEL_STEP, −y). */
export function decodeFrame(frame: KmcFrame, shape: [number, number, number]): DecodedFrame {
  const [nx, ny, nz] = shape;
  const n = nx * ny * nz;
  const occ = unpackBits(frame.occ, n);
  const dop = unpackBits(frame.dop, n);

  const perLevel = new Float64Array(nz);
  let count = 0;
  for (let q = 0; q < n; q++) {
    if (occ[q]) {
      count++;
      perLevel[q % nz]++;
    }
  }
  // The growth front starts at the first level that is no longer (almost) full.
  const full = Math.max(...perLevel) * 0.97;
  let front = nz - 1;
  for (let k = 0; k < nz; k++) {
    if (perLevel[k] < full) {
      front = k;
      break;
    }
  }
  let top = nz - 1;
  while (top > front && perLevel[top] === 0) top--;
  const shadeOf = (k: number) =>
    k <= front || top === front
      ? (BULK_SHADE * k) / Math.max(front, 1)
      : BULK_SHADE + ((1 - BULK_SHADE) * (k - front)) / (top - front);

  const [ex, ey, ez] = cropExtent(shape);
  const position = new Float32Array(count * 3);
  const level = new Float32Array(count);
  const kind = new Float32Array(count);
  const shade = new Float32Array(count);
  let a = 0;
  let dopants = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const q = (i * ny + j) * nz + k;
        if (!occ[q]) continue;
        position[3 * a] = i + j / 2 - ex / 2;
        position[3 * a + 1] = k * LEVEL_STEP - ey / 2;
        position[3 * a + 2] = ez / 2 - (j * SQ3) / 2;
        level[a] = k;
        kind[a] = dop[q];
        shade[a] = shadeOf(k);
        dopants += dop[q];
        a++;
      }
    }
  }
  return { count, dopants, position, level, kind, shade };
}
