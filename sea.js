// Sea and air routing on a 0.5° grid built from the Natural Earth land mask.
// Ships path-find through real water (canals and straits carved in by hand),
// planes fly great circles. Every path is a list of [lon, lat] with unwrapped
// longitudes so it can be drawn straight across the antimeridian.
import { LAND_MASK, LAND_W, LAND_H } from './land-mask.js';

const W = LAND_W, H = LAND_H, CELL = 360 / W;
const R = 6371, D2R = Math.PI / 180;

// Straits and canals too narrow for a 0.5° grid. Each is a polyline of [lat, lon].
export const CHANNELS = {
  suez: [[31.6, 32.3], [30.8, 32.32], [30.3, 32.4], [29.9, 32.56], [29.3, 32.75], [28.5, 33.1], [27.7, 33.7]],
  panama: [[9.6, -79.95], [9.25, -79.85], [9.0, -79.65], [8.7, -79.5]],
  gibraltar: [[36.0, -6.4], [35.95, -5.6], [36.0, -5.0], [36.2, -4.5]],
  dover: [[50.4, 0.4], [50.9, 1.3], [51.2, 1.7], [51.6, 2.3]],
  bosphorus: [[39.9, 25.9], [40.2, 26.3], [40.5, 26.9], [40.8, 28.2], [41.0, 29.0], [41.3, 29.2], [41.6, 29.4]],
  singapore: [[1.15, 103.4], [1.2, 103.85], [1.3, 104.4]],
  mandeb: [[12.9, 43.1], [12.6, 43.4], [12.3, 43.7]],
  hormuz: [[26.9, 56.0], [26.5, 56.4], [26.2, 56.8], [25.8, 57.0]],
  oresund: [[55.3, 12.8], [55.7, 12.7], [56.1, 12.5], [56.8, 11.8]],
  messina: [[38.0, 15.4], [38.3, 15.65]],
  // Short dredged approaches so inland-ish ports (Houston ship channel, the Plate, the Rhine/Scheldt) connect.
  houston: [[29.7, -95.0], [29.35, -94.75], [29.0, -94.5]],
  plate: [[-34.6, -58.3], [-34.9, -57.5], [-35.2, -56.6]],
  thames: [[51.5, 0.4], [51.5, 1.2]]
};

let water = null;          // 1 = navigable ocean cell
let coast = null;          // 1 = water cell touching land
const blocked = new Set(); // channel names currently closed by events
let channelCells = {};     // name -> [cell idx]
const cache = new Map();

const idx = (i, j) => j * W + i;
const cellI = lon => ((Math.floor((lon + 180) / CELL) % W) + W) % W;
const cellJ = lat => Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
const lonOf = i => -180 + (i + 0.5) * CELL;
const latOf = j => 90 - (j + 0.5) * CELL;

export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * D2R, dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function rasterLine(a, b, fn) {
  const n = Math.max(2, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / (CELL / 3)));
  for (let k = 0; k <= n; k++) {
    const lat = a[0] + (b[0] - a[0]) * k / n, lon = a[1] + (b[1] - a[1]) * k / n;
    fn(idx(cellI(lon), cellJ(lat)));
  }
}

export function init() {
  if (water) return;
  const bin = atob(LAND_MASK);
  const land = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) land[k] = (bin.charCodeAt(k >> 3) >> (k & 7)) & 1;
  const sea = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const lat = latOf(j);
    for (let i = 0; i < W; i++) sea[idx(i, j)] = !land[idx(i, j)] && lat < 70.5 && lat > -66 ? 1 : 0;
  }
  for (const [name, line] of Object.entries(CHANNELS)) {
    const cells = new Set();
    for (let k = 0; k < line.length - 1; k++) rasterLine(line[k], line[k + 1], c => cells.add(c));
    channelCells[name] = [...cells];
    for (const c of cells) sea[c] = 1;
  }
  // Keep only the world ocean: flood from the mid-Pacific so lakes and inland seas drop out.
  water = new Uint8Array(W * H);
  const stack = [idx(cellI(-150), cellJ(0))];
  water[stack[0]] = 1;
  while (stack.length) {
    const c = stack.pop(), i = c % W, j = (c - i) / W;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const nj = j + dj; if (nj < 0 || nj >= H) continue;
      const n = idx((i + di + W) % W, nj);
      if (sea[n] && !water[n]) { water[n] = 1; stack.push(n); }
    }
  }
  coast = new Uint8Array(W * H);
  for (let j = 1; j < H - 1; j++) for (let i = 0; i < W; i++) {
    const c = idx(i, j); if (!water[c]) continue;
    for (let dj = -1; dj <= 1 && !coast[c]; dj++) for (let di = -1; di <= 1; di++)
      if (!water[idx((i + di + W) % W, j + dj)]) { coast[c] = 1; break; }
  }
}

const passable = c => water[c] === 1 && !blockedCell.has(c);
let blockedCell = new Set();
function rebuildBlocked() {
  blockedCell = new Set();
  for (const n of blocked) for (const c of channelCells[n] || []) blockedCell.add(c);
  cache.clear();
}
export function setBlocked(name, on) { on ? blocked.add(name) : blocked.delete(name); rebuildBlocked(); }
export function isBlocked(name) { return blocked.has(name); }

// Nearest navigable cell to a coordinate (ring search), or -1.
export function nearestWater(lat, lon, maxR = 10) {
  init();
  const ci = cellI(lon), cj = cellJ(lat);
  let best = -1, bestD = Infinity;
  for (let r = 0; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const j = cj + dj; if (j < 0 || j >= H) continue;
      const c = idx((ci + di + W) % W, j);
      if (!passable(c)) continue;
      const d = haversine(lat, lon, latOf(j), lonOf((ci + di + W) % W));
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best >= 0 && r >= 2) break;
  }
  return best;
}

// Binary heap keyed by a Float64 score array.
function heap(score) {
  const a = [];
  const up = k => { while (k > 0) { const p = (k - 1) >> 1; if (score[a[p]] <= score[a[k]]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } };
  const down = k => { for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && score[a[l]] < score[a[m]]) m = l; if (r < a.length && score[a[r]] < score[a[m]]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } };
  return { push(v) { a.push(v); up(a.length - 1); }, pop() { const t = a[0], l = a.pop(); if (a.length) { a[0] = l; down(0); } return t; }, get size() { return a.length; } };
}

let G, F, From, Closed;
function astar(s, t) {
  if (!G) { G = new Float64Array(W * H); F = new Float64Array(W * H); From = new Int32Array(W * H); Closed = new Uint8Array(W * H); }
  G.fill(Infinity); Closed.fill(0);
  const ti = t % W, tj = (t - ti) / W, tlat = latOf(tj), tlon = lonOf(ti);
  const h = c => { const i = c % W, j = (c - i) / W; return haversine(latOf(j), lonOf(i), tlat, tlon) * 0.995; };
  G[s] = 0; F[s] = h(s); From[s] = -1;
  const open = heap(F); open.push(s);
  const step = CELL * 111.2;
  while (open.size) {
    const c = open.pop();
    if (c === t) break;
    if (Closed[c]) continue;
    Closed[c] = 1;
    const i = c % W, j = (c - i) / W, cosl = Math.cos(latOf(j) * D2R);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const nj = j + dj; if (nj < 0 || nj >= H) continue;
      const n = idx((i + di + W) % W, nj);
      if (Closed[n] || !passable(n)) continue;
      const dx = di * step * cosl, dy = dj * step;
      const g = G[c] + Math.sqrt(dx * dx + dy * dy) * (coast[n] ? 1.25 : 1);
      if (g < G[n]) { G[n] = g; F[n] = g + h(n); From[n] = c; open.push(n); }
    }
  }
  if (G[t] === Infinity) return null;
  const cells = [];
  for (let c = t; c !== -1; c = From[c]) cells.push(c);
  return cells.reverse();
}

function unwrapTo(prevLon, lon) {
  while (lon - prevLon > 180) lon -= 360;
  while (lon - prevLon < -180) lon += 360;
  return lon;
}

function lineClear(a, b) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 2)));
  for (let k = 1; k < n; k++) {
    const lon = a[0] + (b[0] - a[0]) * k / n, lat = a[1] + (b[1] - a[1]) * k / n;
    if (!passable(idx(cellI(lon), cellJ(lat)))) return false;
  }
  return true;
}

function finish(pts) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + haversine(pts[k - 1][1], pts[k - 1][0], pts[k][1], pts[k][0]));
  return { pts, cum, km: cum[cum.length - 1] };
}

// Sea route between two ports given as [lat, lon]. Returns {pts, cum, km} or null.
export function seaRoute(key, a, b) {
  init();
  const ck = key + (blocked.size ? '|' + [...blocked].sort().join(',') : '');
  if (cache.has(ck)) return cache.get(ck);
  const s = nearestWater(a[0], a[1]), t = nearestWater(b[0], b[1]);
  let res = null;
  if (s >= 0 && t >= 0) {
    const cells = astar(s, t);
    if (cells) {
      const raw = [[a[1], a[0]]];
      for (const c of cells) {
        const i = c % W, j = (c - i) / W;
        raw.push([unwrapTo(raw[raw.length - 1][0], lonOf(i)), latOf(j)]);
      }
      raw.push([unwrapTo(raw[raw.length - 1][0], b[1]), b[0]]);
      // String-pull the grid path into long straight legs.
      const out = [raw[0]];
      let anchor = 0;
      for (let k = 2; k < raw.length; k++) {
        if (!lineClear(raw[anchor], raw[k])) { anchor = k - 1; out.push(raw[anchor]); }
      }
      out.push(raw[raw.length - 1]);
      res = finish(out);
    }
  }
  cache.set(ck, res);
  return res;
}

// Great-circle flight path.
export function airRoute(a, b) {
  const [la1, lo1] = [a[0] * D2R, a[1] * D2R], [la2, lo2] = [b[0] * D2R, b[1] * D2R];
  const v1 = [Math.cos(la1) * Math.cos(lo1), Math.cos(la1) * Math.sin(lo1), Math.sin(la1)];
  const v2 = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)];
  const om = Math.acos(Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2])));
  const n = Math.max(2, Math.ceil(om / D2R / 2));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const A = om < 1e-6 ? 1 - f : Math.sin((1 - f) * om) / Math.sin(om), B = om < 1e-6 ? f : Math.sin(f * om) / Math.sin(om);
    const x = A * v1[0] + B * v2[0], y = A * v1[1] + B * v2[1], z = A * v1[2] + B * v2[2];
    let lon = Math.atan2(y, x) / D2R; const lat = Math.atan2(z, Math.hypot(x, y)) / D2R;
    if (pts.length) lon = unwrapTo(pts[pts.length - 1][0], lon);
    pts.push([lon, lat]);
  }
  return finish(pts);
}

// Position and heading at distance d along a route.
export function along(route, d) {
  const { pts, cum } = route;
  if (d <= 0) return { lon: pts[0][0], lat: pts[0][1], hdg: heading(pts[0], pts[1] || pts[0]) };
  if (d >= route.km) { const n = pts.length - 1; return { lon: pts[n][0], lat: pts[n][1], hdg: heading(pts[n - 1] || pts[n], pts[n]) }; }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const f = (d - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return { lon: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, lat: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f, hdg: heading(pts[lo], pts[hi]) };
}
const heading = (a, b) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
