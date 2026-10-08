/**
 * Path follower (animation-plan §3.1, §4.3). Pure maths, no Three: world polylines (x, z) in, a
 * `Follow` out that maps arc length `s` to a pose. Vehicles drive on the right of the travel
 * direction (`lane`), swing round corners on a `corner`-radius curve and look up poses by binary
 * search in an arc-length table (no allocation when `out` is passed).
 *
 * Yaw convention: Three's `rotation.y`, with the vehicle nose at +x. A heading (dx, dz) has
 * yaw = atan2(-dz, dx).
 */

export type P2 = readonly [number, number];

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

export interface Follow {
  /** Arc length in world units. */
  readonly length: number;
  /** Height of the actor's root along this path (road body base or air lane). */
  readonly y: number;
  /** Pose at arc length `s` (clamped to 0..length). Writes into `out` when given. */
  at(s: number, out?: Pose): Pose;
  /** Arc length of the point on the path nearest to (x, z) (cart pickups, stops). */
  nearest(x: number, z: number): number;
  /** Root height at arc length `s` on paths that climb (the freeway ramp); `y` when absent. */
  yAt?(s: number): number;
}

/** Lane offset to the right of travel (roads are 0.78 wide; WP-B ground vehicles are up to 0.46 wide, so head-on vans just clear each other). */
export const LANE = 0.2;
/** Corner radius for 90° turns. */
export const CORNER = 0.32;
/** Root height of a vehicle on the road (ROAD_TOP + 0.02). */
export const ROAD_Y = 0.05;
/** Air lanes: cruise heights above the tallest mini (New Districts apartment roof ~2.8), so aircraft never clip it. */
export const AIR_Y = { zeppelin: 3.0, airplane: 3.3 } as const;
/** Freeway deck (minis/ketchup.ts): ramp run and rise from the board edge, then a flat platform. */
export const FREEWAY = { run: 3.2, rise: 0.95, platform: 0.8 } as const;
/** Root height of a vehicle on the rural area tile. */
const RURAL_Y = 0.1;
const FW_TOP = ROAD_Y + FREEWAY.rise + 0.02;

/**
 * Root height of a vehicle `d` units past the board edge on a freeway: up the deck, flat on the
 * platform, then a short drop on to the rural tile.
 */
export function freewayY(d: number): number {
  const ramp = FREEWAY.run + 0.05;
  const top = ramp + FREEWAY.platform - 0.05;
  if (d <= 0) return ROAD_Y;
  if (d <= ramp) return ROAD_Y + (FW_TOP - ROAD_Y) * (d / ramp);
  if (d <= top) return FW_TOP;
  const k = Math.min(1, (d - top) / 0.7);
  return FW_TOP + (RURAL_Y - FW_TOP) * k * k * (3 - 2 * k);
}

/** Ground height for a freeway leaving the board at `edge` heading `dir` (unit). */
export function freewayGround(edge: P2, dir: P2): (x: number, z: number) => number {
  return (x, z) => freewayY((x - edge[0]) * dir[0] + (z - edge[1]) * dir[1]);
}

/** `f` with a height that follows the ground under it: `h(x, z)` gives the root height. */
export function withHeight(f: Follow, h: (x: number, z: number) => number): Follow {
  const p: Pose = { x: 0, z: 0, yaw: 0 };
  return {
    length: f.length,
    y: f.y,
    at: (s, out) => f.at(s, out),
    nearest: (x, z) => f.nearest(x, z),
    yAt: (s) => {
      f.at(s, p);
      return h(p.x, p.z);
    },
  };
}

/** Arc-length table resolution. */
const STEP = 0.05;

/** Trip time at 1× for a path of `length` world units: clamp(0.45, 0.25 + length / 4.5, 1.4). */
export function tripDuration(length: number): number {
  return Math.min(1.4, Math.max(0.45, 0.25 + length / 4.5));
}

/** Ease for a trip of `dur` seconds: ~0.15 s accelerate, ~0.2 s brake, linear cruise between. */
export function tripEase(dur: number): (t: number) => number {
  const a = Math.min(0.45, 0.15 / Math.max(dur, 1e-3));
  const b = Math.min(0.45, 0.2 / Math.max(dur, 1e-3));
  // Trapezoidal velocity profile: v rises over [0, a], flat, falls over [1 - b, 1]; area 1.
  const v = 1 / (1 - a / 2 - b / 2);
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < a) return (v * t * t) / (2 * a);
    const sa = (v * a) / 2;
    if (t <= 1 - b) return sa + v * (t - a);
    const u = 1 - t;
    return 1 - (v * u * u) / (2 * b);
  };
}

/**
 * Road follower: offsets every segment `lane` to the right of travel, joins the offset segments,
 * rounds each turn with a curve of radius `corner` and samples the result every 0.05.
 */
export function roadPath(pts: readonly P2[], opts: { lane?: number; corner?: number; y?: number } = {}): Follow {
  const lane = opts.lane ?? LANE;
  const corner = opts.corner ?? CORNER;
  const clean = dedupe(pts);
  if (clean.length < 2) return table(clean.length ? [clean[0]!, clean[0]!] : [[0, 0], [0, 0]], opts.y ?? ROAD_Y);
  const off = lane ? offsetPolyline(clean, lane) : clean.map((p) => [p[0], p[1]] as P2);
  return table(roundCorners(off, corner), opts.y ?? ROAD_Y);
}

/** Air follower: centripetal-ish Catmull-Rom through `pts` at height `y`. */
export function airPath(pts: readonly P2[], y: number): Follow {
  const clean = dedupe(pts);
  if (clean.length < 3) return table(clean.length >= 2 ? clean : clean.length ? [clean[0]!, clean[0]!] : [[0, 0], [0, 0]], y);
  const out: P2[] = [];
  const n = clean.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = clean[Math.max(0, i - 1)]!;
    const p1 = clean[i]!;
    const p2 = clean[i + 1]!;
    const p3 = clean[Math.min(n - 1, i + 2)]!;
    const seg = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.2));
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      out.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  out.push(clean[n - 1]!);
  return table(out, y);
}

// ---------------------------------------------------------------------------

function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function dedupe(pts: readonly P2[]): P2[] {
  const out: P2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  // Drop collinear middle points so corners are only real turns.
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cross) < 1e-9 && dot > 0) out.splice(i, 1);
  }
  return out;
}

const dirOf = (a: P2, b: P2): [number, number] => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};

/** Right-hand normal of heading (dx, dz) in board space (north = -z): (-dz, dx). */
const right = (d: [number, number]): [number, number] => [-d[1], d[0]];

/** Offset each segment by `w` to its right; consecutive offset lines meet at their intersection. */
function offsetPolyline(pts: readonly P2[], w: number): P2[] {
  const n = pts.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const dIn = i > 0 ? dirOf(pts[i - 1]!, p) : null;
    const dOut = i < n - 1 ? dirOf(p, pts[i + 1]!) : null;
    if (!dIn || !dOut) {
      const r = right((dIn ?? dOut)!);
      out.push([p[0] + r[0] * w, p[1] + r[1] * w]);
      continue;
    }
    const r0 = right(dIn);
    const r1 = right(dOut);
    const cross = dIn[0] * dOut[1] - dIn[1] * dOut[0];
    if (Math.abs(cross) < 1e-6) {
      // Straight on, or a reversal: keep both offsets (a U-turn crosses the road).
      out.push([p[0] + r0[0] * w, p[1] + r0[1] * w]);
      if (dIn[0] * dOut[0] + dIn[1] * dOut[1] < 0) out.push([p[0] + r1[0] * w, p[1] + r1[1] * w]);
      continue;
    }
    // Intersection of (p + r0 w) + t dIn and (p + r1 w) + u dOut.
    const ax = p[0] + r0[0] * w;
    const az = p[1] + r0[1] * w;
    const bx = p[0] + r1[0] * w;
    const bz = p[1] + r1[1] * w;
    const t = ((bx - ax) * dOut[1] - (bz - az) * dOut[0]) / cross;
    out.push([ax + dIn[0] * t, az + dIn[1] * t]);
  }
  return out;
}

/** Replace each interior vertex with a quadratic curve tangent to both legs (radius-sized cut). */
function roundCorners(pts: readonly P2[], r: number): P2[] {
  if (r <= 0 || pts.length < 3) return [...pts];
  const out: P2[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const d0 = dirOf(a, b);
    const d1 = dirOf(b, c);
    const cos = Math.max(-1, Math.min(1, -(d0[0] * d1[0] + d0[1] * d1[1])));
    const phi = Math.PI - Math.acos(cos); // turn angle
    if (phi < 1e-3) {
      out.push(b);
      continue;
    }
    // Tangent distance for a circular arc of radius r, capped by half of each leg.
    const lenIn = Math.hypot(b[0] - a[0], b[1] - a[1]) / (i === 1 ? 1 : 2);
    const lenOut = Math.hypot(c[0] - b[0], c[1] - b[1]) / (i === pts.length - 2 ? 1 : 2);
    const d = Math.min(r * Math.tan(Math.min(phi, 3) / 2), lenIn, lenOut);
    const p0: P2 = [b[0] - d0[0] * d, b[1] - d0[1] * d];
    const p2: P2 = [b[0] + d1[0] * d, b[1] + d1[1] * d];
    const seg = 6;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p2[1]]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Arc-length table over a dense polyline. */
function table(pts: readonly P2[], y: number): Follow {
  const xs: number[] = [];
  const zs: number[] = [];
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i > 0) {
      const q = pts[i - 1]!;
      const l = Math.hypot(p[0] - q[0], p[1] - q[1]);
      const n = Math.max(1, Math.ceil(l / STEP));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        xs.push(q[0] + (p[0] - q[0]) * t);
        zs.push(q[1] + (p[1] - q[1]) * t);
        cum.push(acc + l * t);
      }
      acc += l;
    } else {
      xs.push(p[0]);
      zs.push(p[1]);
      cum.push(0);
    }
  }
  const last = xs.length - 1;
  const yawAt = (i: number): number => {
    // Heading of the sample segment containing index i (the first one for i = 0).
    let j = Math.min(Math.max(i, 0), last - 1);
    while (j > 0 && cum[j + 1]! - cum[j]! < 1e-9) j--;
    if (last < 1) return 0;
    const dx = xs[j + 1]! - xs[j]!;
    const dz = zs[j + 1]! - zs[j]!;
    return dx === 0 && dz === 0 ? 0 : Math.atan2(-dz, dx);
  };
  return {
    length: acc,
    y,
    at(s, out = { x: 0, z: 0, yaw: 0 }) {
      if (last < 1 || acc <= 0) {
        out.x = xs[0] ?? 0;
        out.z = zs[0] ?? 0;
        out.yaw = yawAt(0);
        return out;
      }
      const v = Math.min(acc, Math.max(0, s));
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! <= v) lo = mid;
        else hi = mid;
      }
      const span = cum[hi]! - cum[lo]!;
      const t = span > 0 ? (v - cum[lo]!) / span : 0;
      out.x = xs[lo]! + (xs[hi]! - xs[lo]!) * t;
      out.z = zs[lo]! + (zs[hi]! - zs[lo]!) * t;
      out.yaw = yawAt(lo);
      return out;
    },
    nearest(x, z) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i <= last; i++) {
        const d = (xs[i]! - x) ** 2 + (zs[i]! - z) ** 2;
        if (d < bd) {
          bd = d;
          best = cum[i]!;
        }
      }
      return best;
    },
  };
}
