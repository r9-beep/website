// Procedural airliner generator for the BAC fleet.
// Builds a fully-liveried, articulated 3D aircraft from the parametric description in data/fleet.js:
// section-lofted wings and tail with hinged flaps, slats, ailerons, elevators and rudder; layered
// livery textures with panel-line normal maps; detailed turbofans; an animated undercarriage.
// Frame: +X forward (nose), +Y up, +Z starboard. Units: metres.
import * as THREE from '../vendor/three.js';
import { mergeGeometries } from '../vendor/three.js';

export const COLORS = {
  ivory: '#F2EFE8',
  midnight: '#0B1124',
  navy: '#121B38',
  union: '#C8102E',
  gold: '#C9A84C',
  titanium: '#9AA0AC',
  wing: '#C3C8CF'
};

const deg = Math.PI / 180;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const F32 = THREE.Float32BufferAttribute;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function mirrorZ(geo) {
  const g = geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, -p.getZ(i));
    if (n) n.setZ(i, -n.getZ(i));
  }
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
  }
  p.needsUpdate = true;
  return g;
}

function foilShape(camber = 0.022, camberPos = 0.42) {
  const t = x => 0.6 * (0.2969 * Math.sqrt(Math.max(x, 0)) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const c = x => camber === 0 ? 0 : (x < camberPos
    ? camber / (camberPos ** 2) * (2 * camberPos * x - x * x)
    : camber / ((1 - camberPos) ** 2) * ((1 - 2 * camberPos) + 2 * camberPos * x - x * x));
  return { yu: x => c(x) + t(x), yl: x => c(x) - t(x), yc: x => c(x) };
}

// Classic closed airfoil ring (TE upper -> LE -> TE lower) for small parts.
function airfoil(n = 18, camber = 0.02, camberPos = 0.4) {
  const s = foilShape(camber, camberPos);
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(0.5 * (1 - Math.cos(Math.PI * i / n)));
  const pts = [];
  for (let i = n; i >= 0; i--) pts.push({ x: xs[i], y: s.yu(xs[i]), up: true });
  for (let i = 1; i <= n; i++) pts.push({ x: xs[i], y: s.yl(xs[i]), up: false });
  return pts;
}

function frameOf(s) {
  const t = s.span.clone().normalize();
  const n = V3(0, t.z, -t.y);
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
  n.normalize();
  let c = (s.chordDir || V3(-1, 0, 0)).clone();
  if (s.twist) {
    const tw = s.twist * deg;
    const c2 = c.clone().multiplyScalar(Math.cos(tw)).addScaledVector(n, Math.sin(tw));
    n.multiplyScalar(Math.cos(tw)).addScaledVector(c, -Math.sin(tw));
    c = c2;
  }
  return { le: s.le, c, n, chord: s.chord, k: s.tc / 0.12 };
}
const onFrame = (f, x, y) => f.le.clone().addScaledVector(f.c, x * f.chord).addScaledVector(f.n, y * f.chord * f.k);

// Simple loft of a closed airfoil ring (used for winglets, pylons, antennas).
function loft(stations, { foil = airfoil(), capEnd = true } = {}) {
  const M = foil.length;
  const pos = [], uv = [], idx = [];
  stations.forEach((s, si) => {
    const f = frameOf(s);
    foil.forEach(p => {
      const v = onFrame(f, p.x, p.y);
      pos.push(v.x, v.y, v.z);
      uv.push(p.up ? p.x * 0.5 : 1 - p.x * 0.5, si / (stations.length - 1));
    });
  });
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < M - 1; k++) {
      const a = si * M + k, b = (si + 1) * M + k;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  if (capEnd) {
    const base = (stations.length - 1) * M, half = (M - 1) / 2;
    for (let k = 0; k < half; k++) {
      const u0 = base + k, u1 = base + k + 1, l0 = base + (M - 1 - k), l1 = base + (M - 2 - k);
      idx.push(u0, u1, l0);
      if (k < half - 1) idx.push(u1, l1, l0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new F32(pos, 3));
  g.setAttribute('uv', new F32(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Loft a chordwise slice [c0, c1] of an airfoil through stations. Each surface patch is lofted on its
// own so cut faces stay crisp; cut faces and end caps go in material group 1 (the dark "gap" colour).
function sectionLoft(stations, o = {}) {
  const { camber = 0.022, camberPos = 0.42, c0 = 0, c1 = 1, n = 22, uv = 'span', vOf = (s, i, N) => i / (N - 1), bbox = null, capStart = false, capEnd = false, capMat = 1 } = o;
  const shape = foilShape(camber, camberPos);
  const xs = [c0];
  for (let i = 1; i < n; i++) { const x = 0.5 * (1 - Math.cos(Math.PI * i / n)); if (x > c0 + 1e-4 && x < c1 - 1e-4) xs.push(x); }
  xs.push(c1);
  const frames = stations.map(frameOf);
  const up = xs.slice().reverse().map(x => ({ x, y: shape.yu(x), up: true }));
  const lo = xs.map(x => ({ x, y: shape.yl(x), up: false }));
  const patches = [];
  if (c0 <= 1e-6) patches.push({ pts: up.concat(lo.slice(1)), mat: 0 });
  else {
    patches.push({ pts: up, mat: 0 }, { pts: lo, mat: 0 });
    patches.push({ pts: [{ x: c0, y: shape.yu(c0), up: true }, { x: c0, y: shape.yl(c0), up: false }], mat: 1 });
  }
  if (c1 < 1 - 1e-6) patches.push({ pts: [{ x: c1, y: shape.yl(c1), up: false }, { x: c1, y: shape.yu(c1), up: true }], mat: 1 });
  const uvOf = (p, pt, si) => uv === 'planar'
    ? [(bbox.maxX - p.x) / (bbox.maxX - bbox.minX), (p.y - bbox.minY) / (bbox.maxY - bbox.minY)]
    : [pt.up ? pt.x * 0.5 : 1 - pt.x * 0.5, vOf(stations[si], si, stations.length)];
  const geos = [], mats = [];
  for (const patch of patches) {
    const M = patch.pts.length, pos = [], uvs = [], idx = [];
    frames.forEach((f, si) => patch.pts.forEach(pt => { const p = onFrame(f, pt.x, pt.y); pos.push(p.x, p.y, p.z); uvs.push(...uvOf(p, pt, si)); }));
    for (let si = 0; si < frames.length - 1; si++) for (let k = 0; k < M - 1; k++) {
      const a = si * M + k, b = (si + 1) * M + k;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new F32(pos, 3)); g.setAttribute('uv', new F32(uvs, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g); mats.push(patch.mat);
  }
  // end caps
  let ring = up.concat(c0 <= 1e-6 ? lo.slice(1) : lo);
  ring = ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6; });
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(p.x, p.y)), []);
  for (const [want, si, dir] of [[capStart, 0, -1], [capEnd, frames.length - 1, 1]]) {
    if (!want || !tris.length) continue;
    const f = frames[si];
    const pts = ring.map(pt => onFrame(f, pt.x, pt.y));
    const span = stations[si].span.clone().normalize().multiplyScalar(dir);
    const [a, b, c] = tris[0];
    const nrm = V3().crossVectors(pts[b].clone().sub(pts[a]), pts[c].clone().sub(pts[a]));
    const flip = nrm.dot(span) < 0;
    const pos = [], uvs = [], idx = [];
    pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); uvs.push(...uvOf(p, ring[i], si)); });
    tris.forEach(([x, y, z]) => flip ? idx.push(x, z, y) : idx.push(x, y, z));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new F32(pos, 3)); g.setAttribute('uv', new F32(uvs, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g); mats.push(capMat);
  }
  const merged = mergeGeometries(geos, true);
  merged.groups.forEach((gr, i) => { gr.materialIndex = mats[i]; });
  geos.forEach(g => g.dispose());
  return merged;
}

function lathe(profile, segs = 48, phiStart = 0, phiLength = Math.PI * 2) {
  // profile: [[radius, x]] ; returns geometry revolved about the X axis
  const pts = profile.map(([r, x]) => new THREE.Vector2(Math.max(r, 1e-4), x));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLength);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// Cylinder between two points.
function rod(a, b, r0, r1, mat, segs = 12) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 ?? r0, r0, len, segs), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  return m;
}

// Superellipsoid (boxy-rounded body) for fairings.
function superEllipsoid(ax, ay, az, eLong = 2.4, eSec = 2.6, segU = 40, segV = 24) {
  const pos = [], idx = [];
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
  for (let i = 0; i <= segU; i++) {
    const t = -1 + 2 * i / segU;
    const s = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), eLong)), 1 / eLong);
    for (let j = 0; j <= segV; j++) {
      const a = j / segV * Math.PI * 2;
      pos.push(t * ax, sp(Math.cos(a), eSec) * ay * s, sp(Math.sin(a), eSec) * az * s);
    }
  }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const a = i * (segV + 1) + j, b = a + segV + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new F32(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* Texture helpers                                                     */
/* ------------------------------------------------------------------ */

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function tex(cv, srgb = true, flipY = false) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = flipY; t.anisotropy = 8;
  return t;
}
// Height map canvas → tangent-space normal map (Sobel). wrapY wraps the V axis (fuselage circumference).
function heightToNormal(cv, strength = 2, wrapY = false) {
  const w = cv.width, h = cv.height;
  const src = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => {
    x = x < 0 ? 0 : x >= w ? w - 1 : x;
    y = wrapY ? (y + h) % h : (y < 0 ? 0 : y >= h ? h - 1 : y);
    return src[(y * w + x) * 4];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) / 255 * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) / 255 * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return tex(out, false);
}

function drawUnionFlag(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = '#012169'; ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  const diag = (lw, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  };
  diag(h * 0.2, '#FFFFFF');
  diag(h * 0.067, '#C8102E');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(w / 2 - h * 0.167, 0, h * 0.333, h); ctx.fillRect(0, h / 2 - h * 0.167, w, h * 0.333);
  ctx.fillStyle = '#C8102E';
  ctx.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h); ctx.fillRect(0, h / 2 - h * 0.1, w, h * 0.2);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* Fuselage                                                            */
/* ------------------------------------------------------------------ */

function fuselageProfile(geo) {
  const L = geo.length, R = geo.diameter / 2, hs = geo.heightScale || 1;
  const nl = geo.noseLen * geo.diameter, tl = geo.tailLen * geo.diameter;
  return x => {
    let top, bot, w;
    if (x < nl) {
      const t = x / nl;
      const r = R * Math.pow(1 - Math.pow(1 - t, 2.3), 1 / 2.3);
      const yc = -0.16 * R * Math.pow(1 - t, 1.6);
      const brow = 0.035 * R * Math.sin(Math.PI * clamp((t - 0.35) / 0.65, 0, 1));
      top = yc + r * hs + brow; bot = yc - r * hs; w = r;
    } else if (x > L - tl) {
      const t = (x - (L - tl)) / tl;
      top = R * hs * (1 - 0.34 * Math.pow(t, 2.1));
      const endBot = 0.40 * R * hs;
      bot = -R * hs + (R * hs + endBot) * Math.pow(t, 1.3) * (0.35 + 0.65 * t);
      w = R * (1 - 0.86 * Math.pow(t, 1.55));
    } else { top = R * hs; bot = -R * hs; w = R; }
    return { top, bot, w, cy: (top + bot) / 2, sv: (top - bot) / 2 };
  };
}

function buildFuselage(geo, detail) {
  const L = geo.length;
  const nl = geo.noseLen * geo.diameter, tl = geo.tailLen * geo.diameter;
  const prof = fuselageProfile(geo);
  const xs = [];
  const nN = detail > 0.5 ? 56 : 28, nB = detail > 0.5 ? 48 : 20, nT = detail > 0.5 ? 52 : 24;
  for (let i = 0; i <= nN; i++) xs.push(nl * (1 - Math.cos(i / nN * Math.PI / 2)));
  xs[0] = 0.0005;
  for (let i = 1; i <= nB; i++) xs.push(nl + (L - nl - tl) * i / nB);
  for (let i = 1; i <= nT; i++) xs.push(L - tl + tl * i / nT);
  const seg = detail > 0.5 ? 96 : 44;
  const pos = [], uv = [], idx = [];
  xs.forEach(x => {
    const p = prof(Math.min(x, L - 0.001));
    for (let j = 0; j <= seg; j++) {
      const th = j / seg * Math.PI * 2;
      pos.push(L / 2 - x, p.cy + p.sv * Math.cos(th), p.w * Math.sin(th));
      uv.push(x / L, j / seg);
    }
  });
  const R1 = seg + 1;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * R1 + j, b = (i + 1) * R1 + j;
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const last = xs.length - 1, capC = pos.length / 3, pe = prof(L - 0.001);
  pos.push(-L / 2 - 0.05, pe.cy, 0); uv.push(1, 0.5);
  for (let j = 0; j < seg; j++) idx.push(last * R1 + j, capC, last * R1 + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new F32(pos, 3)); g.setAttribute('uv', new F32(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < xs.length; i++) {
    const a = i * R1, b = i * R1 + seg;
    const nx = (n.getX(a) + n.getX(b)) / 2, ny = (n.getY(a) + n.getY(b)) / 2, nz = (n.getZ(a) + n.getZ(b)) / 2;
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l); n.setXYZ(b, nx / l, ny / l, nz / l);
  }
  for (let j = 0; j <= seg; j++) n.setXYZ(j, 1, 0, 0);
  return { geometry: g, prof };
}

// Livery: one drawing routine rendered into four layers (colour, cabin-light emissive, height for the
// normal map, roughness/metalness) so every window, door and stripe lines up across them.
function fuselageTextures(spec, res) {
  const geo = spec.geo;
  const L = geo.length, R = geo.diameter / 2, D = geo.diameter;
  const nl = geo.noseLen * D, tl = geo.tailLen * D;
  const W = res, H = res / 4;
  const sx = W / L, sy = H / (2 * Math.PI * R);
  const PX = x => x * sx;
  const PY = a => a / 360 * H;
  const gold = spec.accent === 'gold';
  const accent = gold ? COLORS.gold : COLORS.union;

  const belly = x => {
    const base = lerp(180, 113, smooth(nl * 0.45, nl * 1.35, x));
    return base * (1 - Math.pow(smooth(0.58, 0.955, x / L), 1.15));
  };
  const pitch = geo.windowPitch || 0.55;
  const winA = 72;
  const ww = 0.27 * (D > 5 ? 1.15 : 1), wh = 0.38 * (D > 5 ? 1.2 : 1);
  const doors = (geo.doors || []).map(f => f * L);
  const over = (geo.overwing || []).map(f => f * L);
  const xStart = doors[0] + 1.6, xEnd = L - tl * 0.62;
  const avoid = x => doors.some(d => Math.abs(x - d) < 1.25) || over.some(d => Math.abs(x - d) < 0.42);
  const winPx = PX(ww), winPy = wh * sy;
  const doorW = 1.07, doorH = 1.9;
  const doorA0 = winA - (doorH * 0.32) / (2 * Math.PI * R) * 360;
  const fx0 = 0.40 * D, fx1 = 0.84 * D;
  const titleH = D > 5 ? 0.78 : 0.56, titleA = 49;
  const title = 'BRITISH AIRCRAFT CORPORATION';

  const STYLE = {
    color: {
      base: COLORS.ivory, belly: COLORS.midnight, union: COLORS.union, gold: COLORS.gold, accent,
      panel: 'rgba(40,46,60,0.09)', panelLw: 2,
      win: '#1A2233', winNavy: '#05070D', rim: 'rgba(10,14,26,0.35)', rimNavy: 'rgba(201,168,76,0.25)',
      door: 'rgba(30,36,52,0.5)', doorNavy: 'rgba(201,168,76,0.4)', doorLw: 2.4,
      cargo: 'rgba(240,237,230,0.16)', access: 'rgba(30,36,52,0.25)', accessNavy: 'rgba(240,237,230,0.1)',
      cockpit: '#070B14', mask: '#121826', pillar: COLORS.ivory, pillarMask: '#121826', text: true
    },
    emissive: { base: '#000000', win: '#FFC98A', winNavy: '#FFC98A', cockpit: '#22314f', pillar: '#000', pillarMask: '#000' },
    height: {
      base: '#808080', panel: '#646464', panelLw: 3,
      win: '#383838', winNavy: '#383838', rim: '#b0b0b0', rimNavy: '#b0b0b0',
      door: '#202020', doorNavy: '#202020', doorLw: 4.5, cargo: '#202020', access: '#404040', accessNavy: '#404040',
      cockpit: '#404040', pillar: '#808080', pillarMask: '#808080', rivet: '#6c6c6c'
    },
    rough: {
      base: 'rgb(0,92,12)', belly: 'rgb(0,78,14)', union: 'rgb(0,86,12)', gold: 'rgb(0,56,200)', accent: gold ? 'rgb(0,56,200)' : 'rgb(0,86,12)',
      win: 'rgb(0,12,0)', winNavy: 'rgb(0,12,0)', cockpit: 'rgb(0,8,0)', mask: 'rgb(0,60,14)', pillar: 'rgb(0,92,12)', pillarMask: 'rgb(0,60,14)'
    }
  };

  function paint(ctx, S, k) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = S.base; ctx.fillRect(0, 0, W, H);
    const steps = 360;
    if (S.belly) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) { const x = L * i / steps; ctx.lineTo(PX(x), PY(belly(x))); }
      for (let i = steps; i >= 0; i--) { const x = L * i / steps; ctx.lineTo(PX(x), PY(360 - belly(x))); }
      ctx.closePath(); ctx.fillStyle = S.belly; ctx.fill();
    }
    const band = (a0f, a1f, col, x0, taper) => {
      if (!col) return;
      for (const side of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const x = x0 + (L - x0) * i / steps, kk = smooth(x0, x0 + taper, x), a = belly(x) - a0f * kk;
          ctx.lineTo(PX(x), PY(side > 0 ? a : 360 - a));
        }
        for (let i = steps; i >= 0; i--) {
          const x = x0 + (L - x0) * i / steps, kk = smooth(x0, x0 + taper, x), a = belly(x) - a1f * kk;
          ctx.lineTo(PX(x), PY(side > 0 ? a : 360 - a));
        }
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      }
    };
    band(-0.2, 7.5, S.union, nl, 6);
    band(-1.8, -0.8, S.gold, nl, 6);
    band(9.0, 10.0, S.accent, nl * 1.25, 8);

    // skin panel joints + rivet rows
    if (S.panel) {
      ctx.strokeStyle = S.panel; ctx.lineWidth = S.panelLw;
      for (let x = nl * 0.7; x < L - tl * 0.2; x += 2.4) { ctx.beginPath(); ctx.moveTo(PX(x), 0); ctx.lineTo(PX(x), H); ctx.stroke(); }
      for (const a of [24, 100, 142, 336, 260, 218]) {
        ctx.beginPath(); ctx.moveTo(PX(nl * 0.8), PY(a)); ctx.lineTo(PX(L - tl * 0.35), PY(a)); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(PX(nl * 0.55), PY(180)); ctx.lineTo(PX(L - tl * 0.6), PY(180)); ctx.stroke();
    }
    if (S.rivet) {
      ctx.fillStyle = S.rivet;
      const rs = Math.max(1.6, sx * 0.03);
      for (let x = nl * 0.7; x < L - tl * 0.2; x += 2.4) {
        for (let a = 0; a < 360; a += 1.6) { ctx.fillRect(PX(x) + 4, PY(a), rs, rs); ctx.fillRect(PX(x) - 4 - rs, PY(a), rs, rs); }
      }
    }

    // windows
    const win = (x, side) => {
      if (!S.win) return;
      const a = side > 0 ? winA : 360 - winA;
      const cx = PX(x), cy = PY(a);
      const navy = belly(x) < winA + 6;
      ctx.fillStyle = navy ? S.winNavy : S.win;
      roundRect(ctx, cx - winPx / 2, cy - winPy / 2, winPx, winPy, winPx * 0.45); ctx.fill();
      if (S.rim) {
        ctx.strokeStyle = navy ? S.rimNavy : S.rim; ctx.lineWidth = Math.max(1, winPx * 0.1);
        roundRect(ctx, cx - winPx * 0.62, cy - winPy * 0.6, winPx * 1.24, winPy * 1.2, winPx * 0.55); ctx.stroke();
      }
    };
    for (let x = xStart; x < xEnd; x += pitch) if (!avoid(x)) { win(x, 1); win(x, -1); }

    // passenger doors
    doors.forEach(x => {
      for (const side of [1, -1]) {
        const hA = doorH / (2 * Math.PI * R) * 360;
        const a0 = side > 0 ? doorA0 : 360 - doorA0 - hA;
        const navy = belly(x) < doorA0 + hA;
        if (S.door) {
          ctx.strokeStyle = navy ? S.doorNavy : S.door; ctx.lineWidth = S.doorLw;
          roundRect(ctx, PX(x - doorW / 2), PY(a0), PX(doorW), hA / 360 * H, PX(0.18)); ctx.stroke();
          // handle
          ctx.fillStyle = navy ? S.doorNavy : S.door;
          ctx.fillRect(PX(x + doorW * 0.18), PY(a0 + hA * 0.62), PX(0.22), Math.max(2, 0.05 * sy));
        }
        win(x, side);
      }
    });
    over.forEach(x => {
      if (!S.door) return;
      for (const side of [1, -1]) {
        const hA = 1.0 / (2 * Math.PI * R) * 360;
        const a0 = side > 0 ? winA - hA * 0.45 : 360 - winA - hA * 0.55;
        ctx.strokeStyle = S.door; ctx.lineWidth = S.doorLw * 0.7;
        roundRect(ctx, PX(x - 0.3), PY(a0), PX(0.6), hA / 360 * H, PX(0.1)); ctx.stroke();
      }
    });
    // cargo doors (starboard side only, like the real thing) + avionics / service panels
    if (S.cargo) {
      ctx.strokeStyle = S.cargo; ctx.lineWidth = S.doorLw;
      const cargo = (xc, wM, hM) => {
        const hA = hM / (2 * Math.PI * R) * 360;
        roundRect(ctx, PX(xc - wM / 2), PY(150 - hA), PX(wM), hA / 360 * H, PX(0.15)); ctx.stroke();
      };
      cargo(L * 0.24, D > 5 ? 2.7 : 1.4, D > 5 ? 1.7 : 1.25);
      cargo(L * 0.70, D > 5 ? 2.7 : 1.4, D > 5 ? 1.7 : 1.25);
      cargo(L * 0.78, 0.95, 0.9);
    }
    if (S.access) {
      const panelAt = (xc, a, wM, hM) => {
        const navy = belly(xc) < a;
        ctx.strokeStyle = navy ? S.accessNavy : S.access; ctx.lineWidth = S.doorLw * 0.6;
        const hA = hM / (2 * Math.PI * R) * 360;
        roundRect(ctx, PX(xc - wM / 2), PY(a - hA / 2), PX(wM), hA / 360 * H, PX(0.06)); ctx.stroke();
      };
      for (const s of [1, -1]) {
        const A = a => s > 0 ? a : 360 - a;
        panelAt(D * 1.2, A(168), 0.9, 0.6); panelAt(D * 1.9, A(160), 0.6, 0.5);
        panelAt(L * 0.55, A(96), 0.5, 0.4); panelAt(L * 0.9, A(150), 0.7, 0.5);
      }
      panelAt(D * 1.5, 180, 1.2, 0.9);
    }

    // flight deck
    const poly = (pts, side, col) => {
      if (!col) return;
      const A = a => side > 0 ? a : 360 - a;
      ctx.beginPath();
      pts.forEach(([x, a], i) => i ? ctx.lineTo(PX(x), PY(A(a))) : ctx.moveTo(PX(x), PY(A(a))));
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    for (const side of [1, -1]) {
      if (geo.mask) poly([[fx0 - 0.05 * D, 60], [fx0 + 0.02 * D, 9], [fx1 - 0.01 * D, 31], [fx1 + 0.06 * D, 60]], side, S.mask);
      poly([[fx0, 54], [fx0 + 0.06 * D, 14], [fx1 - 0.05 * D, 36], [fx1, 54]], side, S.cockpit);
      for (const f of [0.36, 0.68]) {
        const xb = lerp(fx0, fx1, f), xt = lerp(fx0 + 0.06 * D, fx1 - 0.05 * D, f) - 0.04 * D;
        const at = lerp(14, 36, f) - 1, pw = 0.03 * D;
        poly([[xb - pw / 2, 55], [xt - pw / 2, at], [xt + pw / 2, at], [xb + pw / 2, 55]], side, geo.mask ? S.pillarMask : S.pillar);
      }
    }

    if (!S.text) return;
    ctx.font = `700 ${titleH * 100}px "Cormorant Garamond", Georgia, serif`;
    ctx.save();
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${titleH * 14}px`;
    const tw = ctx.measureText(title).width / 100;
    ctx.restore();
    const tx0 = doors[0] + 2.2;
    const text = (str, cxm, ang, hM, color, side, fontW, spacing, family) => {
      ctx.save();
      const py = PY(side > 0 ? ang : 360 - ang);
      ctx.setTransform((side > 0 ? -sx : sx) / 100 * k, 0, 0, (side > 0 ? sy : -sy) / 100 * k, PX(cxm) * k, py * k);
      ctx.font = `${fontW} ${hM * 100}px ${family}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${hM * spacing}px`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = color; ctx.fillText(str, 0, 0);
      ctx.restore();
    };
    const serif = '"Cormorant Garamond", Georgia, serif', sans = '"Inter", Arial, sans-serif';
    for (const side of [1, -1]) {
      text(title, tx0 + tw / 2, titleA, titleH, COLORS.midnight, side, 700, 14, serif);
      const fw = titleH * 1.9, fh = titleH * 0.95, fx = tx0 + tw + 1.4;
      ctx.save();
      const py = PY(side > 0 ? titleA : 360 - titleA);
      ctx.setTransform((side > 0 ? -sx : sx) * k, 0, 0, (side > 0 ? sy : -sy) * k, PX(fx + fw / 2) * k, py * k);
      ctx.translate(-fw / 2, -fh / 2); ctx.scale(fw / 60, fh / 30);
      drawUnionFlag(ctx, 60, 30);
      ctx.restore();
      text(spec.reg, L * 0.865, 62, titleH * 0.62, COLORS.gold, side, 500, 8, sans);
      text(spec.code, doors[0] - 0.2, 40, titleH * 0.42, COLORS.midnight, side, 500, 10, sans);
      // small stencils: door numbers and "DANGER" by the engine/APU, as on real airframes
      doors.forEach((x, i) => text(`${i + 1}${side > 0 ? 'R' : 'L'}`, x, doorA0 - 4, 0.12, 'rgba(30,36,52,0.6)', side, 600, 2, sans));
    }
  }

  const half = Math.max(512, W / 2);
  const layers = {
    color: canvas(W, H), emissive: canvas(W, H),
    height: canvas(half, half / 4), rough: canvas(half, half / 4)
  };
  paint(layers.color.getContext('2d'), STYLE.color, 1);
  paint(layers.emissive.getContext('2d'), STYLE.emissive, 1);
  paint(layers.height.getContext('2d'), STYLE.height, half / W);
  paint(layers.rough.getContext('2d'), STYLE.rough, half / W);
  return {
    map: tex(layers.color), emissive: tex(layers.emissive),
    normal: heightToNormal(layers.height, 3.2, true), rough: tex(layers.rough, false)
  };
}

function finTexture(spec, bbox, res) {
  const w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
  const W = res, H = Math.round(res * h / w);
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  const s = W / w;
  ctx.setTransform(s, 0, 0, -s, 0, H);
  ctx.fillStyle = COLORS.midnight; ctx.fillRect(0, 0, w, h);
  const gold = spec.accent === 'gold';
  const ribbon = (y0, y1, bend, col, wid) => {
    ctx.beginPath();
    ctx.moveTo(-0.5, y0 * h);
    ctx.bezierCurveTo(w * 0.35, y0 * h + bend * h, w * 0.6, y1 * h - bend * h * 0.2, w + 0.5, y1 * h);
    ctx.lineTo(w + 0.5, y1 * h + wid * h);
    ctx.bezierCurveTo(w * 0.6, y1 * h - bend * h * 0.2 + wid * h, w * 0.35, y0 * h + bend * h + wid * h * 0.4, -0.5, y0 * h + wid * h * 0.2);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  ribbon(-0.05, 0.36, 0.08, COLORS.union, 0.10);
  ribbon(0.03, 0.50, 0.08, COLORS.ivory, 0.022);
  ribbon(0.10, 0.56, 0.08, gold ? COLORS.gold : COLORS.union, 0.012);
  const t = spec.geo.tail;
  const cy = h * 0.70;
  const cx = (cy * Math.tan(t.finSweep * deg)) + (t.finRootChord * 0.5 - (t.finRootChord - t.finTipChord) * 0.5 * 0.70) + 0.1;
  const r = Math.min(h * 0.17, t.finTipChord * 0.62);
  ctx.lineWidth = r * 0.09; ctx.strokeStyle = gold ? COLORS.gold : COLORS.union;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = r * 0.05; ctx.strokeStyle = COLORS.ivory;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLORS.union;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = gold ? COLORS.gold : COLORS.union;
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.33, cy + r * 0.14); ctx.lineTo(cx - r * 0.33, cy - r * 0.14); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r * 0.33, cy + r * 0.14); ctx.lineTo(cx + r * 0.33, cy - r * 0.14); ctx.closePath(); ctx.fill();
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  return tx;
}

// Wing / tail skin: u = chordwise (upper 0→0.5 LE→TE, lower 0.5→1 TE→LE), v = span fraction.
function wingTextures(o, res) {
  const W = res, H = res;
  const color = canvas(W, H), height = canvas(W, H), rough = canvas(W, H);
  const c = color.getContext('2d'), h = height.getContext('2d'), r = rough.getContext('2d');
  c.fillStyle = COLORS.wing; c.fillRect(0, 0, W, H);
  h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(0,128,38)'; r.fillRect(0, 0, W, H);
  const U = (x, upper) => (upper ? x * 0.5 : 1 - x * 0.5) * W;
  const Vy = z => z / o.span * H;
  // subtle panel tone variation
  for (let i = 0; i < 90; i++) {
    const upper = i % 2 === 0;
    const x0 = Math.random() * 0.8, z0 = Math.random() * o.span;
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,46,60'},0.035)`;
    const a = U(x0, upper), b = U(x0 + 0.15, upper);
    c.fillRect(Math.min(a, b), Vy(z0), Math.abs(b - a), Vy(1.6));
  }
  const line = (ctx, x0, y0, x1, y1, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  // spars + ribs
  for (const upper of [true, false]) {
    for (const x of [0.14, 0.42, 0.68]) {
      line(c, U(x, upper), 0, U(x, upper), H, 'rgba(40,46,60,0.12)', 1.5);
      line(h, U(x, upper), 0, U(x, upper), H, '#5c5c5c', 2.2);
    }
  }
  for (let z = 1.2; z < o.span; z += 1.6) {
    line(c, 0, Vy(z), W, Vy(z), 'rgba(40,46,60,0.08)', 1);
    line(h, 0, Vy(z), W, Vy(z), '#686868', 1.6);
  }
  // rivet lines along the front spar
  h.fillStyle = '#6a6a6a';
  for (const upper of [true, false]) for (let z = 0; z < o.span; z += 0.16) { h.fillRect(U(0.15, upper) + 3, Vy(z), 2, 2); h.fillRect(U(0.67, upper) - 5, Vy(z), 2, 2); }
  // bare-metal leading-edge erosion strip
  c.fillStyle = '#D9DDE2'; c.fillRect(0, 0, U(0.03, true), H); c.fillRect(U(0.03, false), 0, W - U(0.03, false), H);
  r.fillStyle = 'rgb(0,52,255)'; r.fillRect(0, 0, U(0.03, true), H); r.fillRect(U(0.03, false), 0, W - U(0.03, false), H);
  if (o.walkway) {
    // spoiler panels ahead of the flaps
    const zs0 = o.R * 1.05, zs1 = o.zAil;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const za = lerp(zs0, zs1, i / n) + 0.04, zb = lerp(zs0, zs1, (i + 1) / n) - 0.04;
      for (const [ctx, col, lw] of [[c, 'rgba(40,46,60,0.32)', 1.6], [h, '#383838', 3]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.strokeRect(U(0.6, true), Vy(za), U(0.745, true) - U(0.6, true), Vy(zb) - Vy(za));
      }
    }
    // walkway with anti-skid surface
    const w0 = o.R * 1.1, w1 = o.R * 1.1 + 3.4;
    c.fillStyle = 'rgba(120,126,136,0.35)'; c.fillRect(U(0.2, true), Vy(w0), U(0.55, true) - U(0.2, true), Vy(w1) - Vy(w0));
    r.fillStyle = 'rgb(0,225,40)'; r.fillRect(U(0.2, true), Vy(w0), U(0.55, true) - U(0.2, true), Vy(w1) - Vy(w0));
    c.setLineDash([10, 6]); c.strokeStyle = 'rgba(20,24,34,0.65)'; c.lineWidth = 2.5;
    c.strokeRect(U(0.2, true), Vy(w0), U(0.55, true) - U(0.2, true), Vy(w1) - Vy(w0)); c.setLineDash([]);
    // fuel and access panels underneath
    for (let z = o.R * 1.3; z < o.span - 1; z += 1.9) {
      for (const [ctx, col, lw] of [[c, 'rgba(40,46,60,0.25)', 1.5], [h, '#3c3c3c', 2.5]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        roundRect(ctx, U(0.36, false) - 14, Vy(z) - 9, 28, 18, 8); ctx.stroke();
      }
    }
  }
  return { map: tex(color), normal: heightToNormal(height, 2.4), rough: tex(rough, false) };
}

function nacelleTextures(accent, gold) {
  const W = 512, H = 256;
  const color = canvas(W, H), height = canvas(W, H), rough = canvas(W, H);
  const c = color.getContext('2d'), h = height.getContext('2d'), r = rough.getContext('2d');
  c.fillStyle = COLORS.midnight; c.fillRect(0, 0, W, H);
  h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(0,70,20)'; r.fillRect(0, 0, W, H);
  // v runs nose→tail along the cowl profile (see buildEngine)
  c.fillStyle = accent; c.fillRect(0, H * 0.36, W, H * 0.05);
  c.fillStyle = COLORS.gold; c.fillRect(0, H * 0.43, W, H * 0.012);
  r.fillStyle = gold ? 'rgb(0,50,210)' : 'rgb(0,64,20)'; r.fillRect(0, H * 0.36, W, H * 0.05);
  r.fillStyle = 'rgb(0,50,210)'; r.fillRect(0, H * 0.43, W, H * 0.012);
  for (const [v, lw] of [[0.2, 2], [0.62, 3], [0.8, 2]]) {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, H * v, W, lw);
    h.fillStyle = '#303030'; h.fillRect(0, H * v - 1, W, lw + 2);
  }
  // cowl latches + hinge line
  for (let i = 0; i < 4; i++) { h.fillStyle = '#404040'; h.fillRect(W * 0.5 - 30 + i * 18, H * 0.45, 10, 16); }
  return { map: tex(color), normal: heightToNormal(height, 2), rough: tex(rough, false) };
}

function spinnerTexture() {
  const cv = canvas(256, 256), c = cv.getContext('2d');
  c.fillStyle = '#16191f'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#f2f2f2'; c.lineWidth = 12; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, 256); c.bezierCurveTo(60, 180, 100, 90, 128, 8); c.stroke();
  return tex(cv, true, true);
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = canvas(128, 128), g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/* ------------------------------------------------------------------ */
/* Engines                                                             */
/* ------------------------------------------------------------------ */

function fanBlade(r0, r1, chord) {
  // scimitar wide-chord blade spanning +Y in the plane perpendicular to X
  const ns = 10, pos = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    const t = i / ns, rr = lerp(r0, r1, t);
    const pitch = lerp(62, 20, Math.pow(t, 0.85)) * deg;
    const c = chord * (0.62 + 0.62 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08)) ** 0.7);
    const sweep = chord * 0.55 * t * t;
    const cx = Math.cos(pitch) * c / 2, cz = Math.sin(pitch) * c / 2;
    pos.push(cx - sweep, rr, cz, -cx - sweep, rr, -cz);
  }
  for (let i = 0; i < ns; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new F32(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function vaneGeo(r0, r1, chord, pitchDeg) {
  const g = new THREE.BoxGeometry(chord, r1 - r0, chord * 0.06);
  g.translate(0, (r0 + r1) / 2, 0);
  g.rotateY(pitchDeg * deg);
  return g;
}

function ringOf(geo, mat, n, x = 0) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1), ax = V3(1, 0, 0);
  for (let i = 0; i < n; i++) { q.setFromAxisAngle(ax, i / n * Math.PI * 2); M.compose(V3(x, 0, 0), q, one); m.setMatrixAt(i, M); }
  return m;
}

function buildEngine(d, len, mats, detail, inboardSign = -1) {
  const g = new THREE.Group();
  const r = d / 2, h = len;
  const segs = detail > 0.5 ? 64 : 32;
  const front = h * 0.5;
  // outer cowl (UV v runs front→back for the nacelle texture)
  g.add(new THREE.Mesh(lathe([
    [r * 0.93, front - h * 0.02], [r * 0.985, front - h * 0.07], [r, front - h * 0.16],
    [r * 0.995, front - h * 0.35], [r * 0.95, front - h * 0.6], [r * 0.84, front - h * 0.82], [r * 0.8, front - h * 0.86]
  ], segs), mats.nacelle));
  // polished intake lip
  g.add(new THREE.Mesh(lathe([[r * 0.82, front - h * 0.08], [r * 0.83, front - h * 0.02], [r * 0.87, front + h * 0.005], [r * 0.915, front - h * 0.005], [r * 0.935, front - h * 0.025]], segs), mats.lip));
  // inlet acoustic liner + bypass duct
  g.add(new THREE.Mesh(lathe([[r * 0.82, front - h * 0.07], [r * 0.80, front - h * 0.2]], segs), mats.liner));
  g.add(new THREE.Mesh(lathe([[r * 0.80, front - h * 0.2], [r * 0.79, front - h * 0.5], [r * 0.76, front - h * 0.85]], segs), mats.duct));
  // core cowl, core nozzle and exhaust plug
  g.add(new THREE.Mesh(lathe([[r * 0.5, front - h * 0.42], [r * 0.56, front - h * 0.6], [r * 0.52, front - h * 0.85], [r * 0.4, front - h * 1.02]], segs), mats.core));
  g.add(new THREE.Mesh(lathe([[r * 0.395, front - h * 1.02], [r * 0.36, front - h * 0.93]], segs), mats.hot));
  g.add(new THREE.Mesh(lathe([[r * 0.3, front - h * 0.93], [r * 0.3, front - h * 1.03], [r * 0.24, front - h * 1.08], [0.001, front - h * 1.2]], segs), mats.plug));
  // LP turbine blades visible from behind
  g.add(ringOf(vaneGeo(r * 0.22, r * 0.36, r * 0.07, 35), mats.turbine, detail > 0.5 ? 48 : 24, front - h * 0.94));
  // fan face, spinner (with swirl) and scimitar blades
  const fanX = front - h * 0.17;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, segs), mats.fanFace);
  disc.rotation.y = Math.PI / 2; disc.position.x = fanX - h * 0.08;
  g.add(disc);
  // outlet guide vanes behind the fan
  g.add(ringOf(vaneGeo(r * 0.5, r * 0.79, r * 0.16, 8), mats.ogv, detail > 0.5 ? 40 : 20, fanX - h * 0.12));
  const fan = new THREE.Group();
  fan.position.x = fanX;
  fan.add(new THREE.Mesh(lathe([[r * 0.27, -h * 0.02], [r * 0.255, h * 0.03], [r * 0.2, h * 0.07], [r * 0.1, h * 0.105], [0.001, h * 0.12]], segs), mats.spinner));
  fan.add(ringOf(fanBlade(r * 0.26, r * 0.79, r * 0.3), mats.blade, detail > 0.5 ? 22 : 16));
  g.add(fan);
  // nacelle chine (vortex strake) on the inboard side
  const chine = new THREE.Mesh(new THREE.BoxGeometry(h * 0.16, 0.03, r * 0.22), mats.nacelleDark);
  const ca = 50 * deg;
  const radial = V3(0, Math.sin(ca), inboardSign * Math.cos(ca));
  chine.position.set(front - h * 0.3, 0, 0).addScaledVector(radial, r * 1.09);
  chine.rotation.x = Math.atan2(-radial.y, radial.z); // aligns the strake's width with the radial direction
  g.add(chine);
  return { group: g, fan };
}

/* ------------------------------------------------------------------ */
/* Hinged control surfaces                                             */
/* ------------------------------------------------------------------ */

// Builds a starboard + port pair of hinged meshes. Positive angle = trailing edge down (both sides).
function hingedPair(parent, geoS, mats, A, B, { pair = true } = {}) {
  const make = (geo, a, axis) => {
    const g = geo.clone(); g.translate(-a.x, -a.y, -a.z);
    const pivot = new THREE.Group(); pivot.position.copy(a);
    pivot.add(new THREE.Mesh(g, mats));
    parent.add(pivot);
    return { pivot, base: a.clone(), axis };
  };
  const axS = B.clone().sub(A).normalize();
  const sides = [make(geoS, A, axS)];
  if (pair) {
    const gP = mirrorZ(geoS);
    sides.push(make(gP, V3(A.x, A.y, -A.z), V3(axS.x, axS.y, -axS.z)));
    gP.dispose();
  }
  return {
    sides,
    set(angleS, angleP = angleS, slide = null) {
      sides.forEach((s, i) => {
        const a = i === 0 ? angleS : -angleP;
        s.pivot.quaternion.setFromAxisAngle(s.axis, a);
        s.pivot.position.copy(s.base);
        if (slide) s.pivot.position.add(i === 0 ? slide : V3(slide.x, slide.y, -slide.z));
      });
    }
  };
}

/* ------------------------------------------------------------------ */
/* Main builder                                                        */
/* ------------------------------------------------------------------ */

export function buildAircraft(spec, opts = {}) {
  const detail = opts.detail ?? 1;
  const texRes = opts.textureSize ?? (detail > 0.5 ? 4096 : 2048);
  const geo = spec.geo;
  const L = geo.length, D = geo.diameter, R = D / 2, hsc = geo.heightScale || 1;
  const group = new THREE.Group();
  group.name = spec.code;
  const gold = spec.accent === 'gold';
  const accentHex = gold ? COLORS.gold : COLORS.union;

  const fus = buildFuselage(geo, detail);
  const prof = fus.prof;
  const ftex = fuselageTextures(spec, texRes);

  /* ---------- Wing planform ---------- */
  const w = geo.wing;
  const s = w.span / 2;
  const xr = L / 2 - w.rootLE * L;
  const y0 = w.y * R;
  const tanS = Math.tan(w.sweep * deg), tanD = Math.tan(w.dihedral * deg);
  const zk = R + w.kink * (s - R);
  const rake = w.winglet === 'raked' ? w.wingletH : 0;
  const zt = s - rake - (w.winglet === 'blended' || w.winglet === 'sharklet' ? 0.6 : 0);
  const leX = z => xr - z * tanS;
  const yAt = z => y0 + Math.max(0, z - R * 0.4) * tanD;
  const ck = w.rootChord - zk * (tanS - Math.tan(3 * deg));
  const chordAt = z => z <= zk ? lerp(w.rootChord, ck, z / zk) : lerp(ck, w.tipChord, (z - zk) / (zt - zk));
  const ws = z => ({ le: V3(leX(z), yAt(z), z), chord: chordAt(z), tc: lerp(0.15, 0.1, z / zt), twist: lerp(0, 3, z / zt), span: V3(0, tanD, 1) });
  const wingBreaks = [R * 0.4, R * 0.9, zk, (zk + zt) / 2];
  const span = (za, zb) => [za, ...wingBreaks.filter(z => z > za + 0.01 && z < zb - 0.01), zb].map(ws);
  const e = geo.engines;
  const engineZ = e.mount === 'wing' ? e.stations.map(f => f * s) : [];
  const zAil = zk + 0.62 * (zt - zk);

  const wingT = wingTextures({ span: zt, R, zk, zAil, walkway: true }, detail > 0.5 ? 1024 : 512);
  const tailT = wingTextures({ span: 10, R: 0, zk: 0, zAil: 0, walkway: false }, detail > 0.5 ? 512 : 256);
  const nac = nacelleTextures(accentHex, gold);

  const mats = {
    fuselage: new THREE.MeshPhysicalMaterial({ map: ftex.map, emissiveMap: ftex.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, normalMap: ftex.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: ftex.rough, metalnessMap: ftex.rough, roughness: 1, metalness: 1, clearcoat: 0.55, clearcoatRoughness: 0.12 }),
    wing: new THREE.MeshStandardMaterial({ map: wingT.map, normalMap: wingT.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: wingT.rough, metalnessMap: wingT.rough, roughness: 1, metalness: 1 }),
    tail: new THREE.MeshStandardMaterial({ map: tailT.map, normalMap: tailT.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: tailT.rough, metalnessMap: tailT.rough, roughness: 1, metalness: 1 }),
    gap: new THREE.MeshStandardMaterial({ color: '#2a2f39', roughness: 0.7, metalness: 0.4 }),
    gapNavy: new THREE.MeshStandardMaterial({ color: '#070a14', roughness: 0.7, metalness: 0.2 }),
    wingDark: new THREE.MeshStandardMaterial({ color: '#8a9099', roughness: 0.45, metalness: 0.45 }),
    navy: new THREE.MeshPhysicalMaterial({ color: COLORS.midnight, roughness: 0.32, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    accent: new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.26, metalness: gold ? 0.75 : 0.1, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
    nacelle: new THREE.MeshPhysicalMaterial({ map: nac.map, normalMap: nac.normal, roughnessMap: nac.rough, metalnessMap: nac.rough, roughness: 1, metalness: 1, clearcoat: 0.7, clearcoatRoughness: 0.12, side: THREE.DoubleSide }),
    nacelleDark: new THREE.MeshStandardMaterial({ color: COLORS.midnight, roughness: 0.4, metalness: 0.2 }),
    lip: new THREE.MeshStandardMaterial({ color: '#DDE1E6', roughness: 0.12, metalness: 1.0, side: THREE.DoubleSide }),
    liner: new THREE.MeshStandardMaterial({ color: '#2c313b', roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide }),
    duct: new THREE.MeshStandardMaterial({ color: '#1B1F28', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
    core: new THREE.MeshStandardMaterial({ color: '#7a7f88', roughness: 0.34, metalness: 0.9, side: THREE.DoubleSide }),
    hot: new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 0.45, metalness: 0.9, side: THREE.DoubleSide }),
    plug: new THREE.MeshStandardMaterial({ color: '#8d8579', roughness: 0.4, metalness: 0.85, side: THREE.DoubleSide }),
    turbine: new THREE.MeshStandardMaterial({ color: '#4d4740', roughness: 0.5, metalness: 0.9 }),
    fanFace: new THREE.MeshStandardMaterial({ color: '#0A0C12', roughness: 0.9, metalness: 0.2 }),
    ogv: new THREE.MeshStandardMaterial({ color: '#3a3f48', roughness: 0.6, metalness: 0.5 }),
    spinner: new THREE.MeshStandardMaterial({ map: spinnerTexture(), roughness: 0.25, metalness: 0.6 }),
    blade: new THREE.MeshStandardMaterial({ color: '#B5BBC4', roughness: 0.22, metalness: 1, side: THREE.DoubleSide }),
    gear: new THREE.MeshStandardMaterial({ color: '#CDD1D7', roughness: 0.38, metalness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#EEF0F3', roughness: 0.08, metalness: 1 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.82, metalness: 0 }),
    hub: new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.3, metalness: 0.85 }),
    hubDark: new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.5, metalness: 0.7 }),
    antenna: new THREE.MeshStandardMaterial({ color: '#d9dce1', roughness: 0.4, metalness: 0.3 }),
    radome: new THREE.MeshPhysicalMaterial({ color: '#e9e6df', roughness: 0.35, metalness: 0, clearcoat: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: '#08090c', roughness: 0.9, metalness: 0 }),
    lensRed: new THREE.MeshStandardMaterial({ color: '#ff3040', emissive: new THREE.Color('#ff1a2e'), emissiveIntensity: 1.5, roughness: 0.2 }),
    lensGreen: new THREE.MeshStandardMaterial({ color: '#30ff80', emissive: new THREE.Color('#1aff6a'), emissiveIntensity: 1.5, roughness: 0.2 }),
    lensWhite: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.2, roughness: 0.2 })
  };
  const wingMats = [mats.wing, mats.gap];
  const tailMats = [mats.tail, mats.gap];

  const fuselage = new THREE.Mesh(fus.geometry, mats.fuselage);
  fuselage.name = 'fuselage';
  group.add(fuselage);

  /* ---------- Wing: main box + leading/trailing edge pieces ---------- */
  const C_LE = 0.125, C_TE = 0.75, GAP = 0.006;
  const vWing = st => st.le.z / zt;
  const wingFoil = { camber: 0.022, camberPos: 0.42, n: detail > 0.5 ? 26 : 14, vOf: vWing };
  const addPair = (geoS, matsArr) => {
    group.add(new THREE.Mesh(geoS, matsArr));
    group.add(new THREE.Mesh(mirrorZ(geoS), matsArr));
  };
  addPair(sectionLoft(span(0, zt), { ...wingFoil, c0: C_LE, c1: C_TE, capEnd: w.winglet !== 'raked', capMat: 0 }), wingMats);

  // leading edge: fixed segments around the engines/root, slats elsewhere
  const blocked = [[0, R * 1.15], ...engineZ.map(z => [z - e.diameter * 0.6, z + e.diameter * 0.6])].sort((a, b) => a[0] - b[0]);
  const slatRanges = [];
  let cursor = 0;
  for (const [a, b] of blocked) { if (a - cursor > 1.6) slatRanges.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (zt - 0.2 - cursor > 1.6) slatRanges.push([cursor, zt - 0.2]);
  const fixedLE = [];
  let last = 0;
  for (const [a, b] of slatRanges) { if (a > last) fixedLE.push([last, a]); last = b; }
  if (zt > last) fixedLE.push([last, zt]);
  fixedLE.forEach(([a, b]) => addPair(sectionLoft(span(a, b), { ...wingFoil, c0: 0, c1: C_LE - GAP, capStart: a > 0.01, capEnd: b < zt - 0.01 || w.winglet !== 'raked', capMat: b >= zt - 0.01 ? 0 : 1 }), wingMats));
  const slats = [];
  slatRanges.forEach(([a, b]) => {
    const n = Math.max(1, Math.round((b - a) / (D > 5 ? 5.5 : 4)));
    for (let i = 0; i < n; i++) {
      const za = lerp(a, b, i / n) + 0.04, zb = lerp(a, b, (i + 1) / n) - 0.04;
      const g = sectionLoft(span(za, zb), { ...wingFoil, c0: 0, c1: C_LE - GAP, capStart: true, capEnd: true });
      const fa = frameOf(ws(za)), fb = frameOf(ws(zb));
      const shp = foilShape(0.022, 0.42);
      const A = onFrame(fa, C_LE - GAP, shp.yu(C_LE)), B = onFrame(fb, C_LE - GAP, shp.yu(C_LE));
      const pair = hingedPair(group, g, wingMats, A, B);
      const fm = frameOf(ws((za + zb) / 2));
      slats.push({ pair, slide: fm.c.clone().multiplyScalar(-0.07 * fm.chord).addScaledVector(fm.n, -0.035 * fm.chord) });
      g.dispose();
    }
  });

  // trailing edge: fixed root piece, two flaps, aileron, fixed tip piece
  const shp = foilShape(0.022, 0.42);
  const teFixed = [[0, R * 1.02], [zt - 0.3, zt]];
  teFixed.forEach(([a, b]) => addPair(sectionLoft(span(a, b), { ...wingFoil, c0: C_TE + GAP, c1: 1, capStart: a > 0.01, capEnd: true, capMat: b >= zt - 0.01 ? 0 : 1 }), wingMats));
  const flapTracks = [];
  const mkTE = (za, zb, kind) => {
    const g = sectionLoft(span(za, zb), { ...wingFoil, c0: C_TE + GAP, c1: 1, capStart: true, capEnd: true });
    const fa = frameOf(ws(za)), fb = frameOf(ws(zb));
    const A = onFrame(fa, C_TE + GAP, shp.yl(C_TE) - 0.01), B = onFrame(fb, C_TE + GAP, shp.yl(C_TE) - 0.01);
    const pair = hingedPair(group, g, wingMats, A, B);
    g.dispose();
    const fm = frameOf(ws((za + zb) / 2));
    return { pair, kind, chord: fm.chord, slide: fm.c.clone().multiplyScalar(0.14 * fm.chord).addScaledVector(fm.n, -0.03 * fm.chord), za, zb };
  };
  const flaps = [mkTE(R * 1.02 + 0.05, zk - 0.04, 'inboard'), mkTE(zk + 0.04, zAil - 0.04, 'outboard')];
  const ailerons = mkTE(zAil + 0.04, zt - 0.34, 'aileron');

  // flap-track canoe fairings ride with the flaps
  const canoe = new THREE.SphereGeometry(1, 20, 10);
  const tracks = [R * 1.02 + (zk - R) * 0.5, zk + (zAil - zk) * 0.33, zk + (zAil - zk) * 0.72];
  if (D > 5) tracks.unshift(R * 1.02 + (zk - R) * 0.1);
  tracks.forEach(z => {
    const f = flaps.find(fl => z >= fl.za && z <= fl.zb) || flaps[1];
    const c = chordAt(z);
    const geoF = canoe.clone();
    geoF.scale(c * 0.24, 0.12 * (D / 6) + 0.06, 0.09 * (D / 6) + 0.045);
    const fr = frameOf(ws(z));
    const p = onFrame(fr, 0.86, shp.yl(0.8) - 0.045);
    void f;
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(geoF, mats.wingDark);
      m.position.set(p.x, p.y, p.z * side);
      group.add(m);
    }
    flapTracks.push(z);
  });

  // winglet
  const tipSt = ws(zt);
  let wlStations;
  if (w.winglet === 'raked') {
    const z1 = s, x1 = tipSt.le.x - (z1 - zt) * Math.tan(52 * deg);
    wlStations = [tipSt,
      { le: V3(lerp(tipSt.le.x, x1, 0.5) - 0.1, yAt(lerp(zt, z1, 0.5)), lerp(zt, z1, 0.5)), chord: tipSt.chord * 0.65, tc: 0.09, span: V3(0, tanD, 1) },
      { le: V3(x1, yAt(z1), z1), chord: tipSt.chord * 0.24, tc: 0.08, span: V3(0, tanD, 1) }];
  } else {
    const hW = w.wingletH, rad = w.winglet === 'sharklet' ? hW * 0.42 : hW * 0.32;
    const n = detail > 0.5 ? 10 : 6;
    wlStations = [tipSt];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const ang = Math.min(1, t * 1.6) * (w.winglet === 'sharklet' ? 78 : 82) * deg;
      const arcLen = rad * Math.PI / 2, along = t * (arcLen + (hW - rad));
      let z, y;
      if (along < arcLen) { const a = along / rad; z = zt + rad * Math.sin(a) * 0.95; y = tipSt.le.y + rad * (1 - Math.cos(a)); }
      else { z = zt + rad * 0.95 + (along - arcLen) * Math.cos(78 * deg) * 0.4; y = tipSt.le.y + rad + (along - arcLen); }
      const xb = tipSt.le.x - along * Math.tan((w.winglet === 'sharklet' ? 36 : 32) * deg) - t * tipSt.chord * 0.1;
      wlStations.push({ le: V3(xb, y, z), chord: tipSt.chord * lerp(1, 0.42, Math.pow(t, 0.8)), tc: lerp(0.1, 0.08, t), span: V3(0, Math.sin(ang) + 0.001, Math.cos(ang)) });
    }
  }
  const wingletGeo = sectionLoft(wlStations, { ...wingFoil, vOf: (st, i, N) => 0.98 + 0.02 * i / (N - 1), capEnd: true, capMat: 0 });
  addPair(wingletGeo, w.winglet === 'raked' ? wingMats : [mats.accent, mats.accent]);

  // wing-body fairing
  const fair = new THREE.Mesh(superEllipsoid(w.rootChord * 0.95, R * 0.4, R * 0.99, 2.2, 2.8, detail > 0.5 ? 48 : 24, detail > 0.5 ? 32 : 18), mats.navy);
  fair.position.set(xr - w.rootChord * 0.42, -R * 0.66, 0);
  group.add(fair);

  /* ---------- Empennage ---------- */
  const t = geo.tail;
  const xf = L / 2 - t.finRoot * L;
  const finBaseY = prof(t.finRoot * L).top - 0.15;
  const finTop = finBaseY + t.finHeight;
  const tanF = Math.tan(t.finSweep * deg);
  const finSt = (y, chordMul = 1) => {
    const f = (y - finBaseY) / t.finHeight;
    return { le: V3(xf - (y - finBaseY) * tanF, y, 0), chord: lerp(t.finRootChord, t.finTipChord, f) * chordMul, tc: lerp(0.12, 0.1, f), span: V3(0, 1, 0) };
  };
  const finRootSt = { le: V3(xf + 0.6, finBaseY - 0.9, 0), chord: t.finRootChord * 1.08, tc: 0.12, span: V3(0, 1, 0) };
  const finBox = { maxX: xf + 0.6, minX: Math.min(xf - t.finHeight * tanF - t.finTipChord - 0.3, xf + 0.6 - t.finRootChord * 1.08 - 0.2), minY: finBaseY - 0.9, maxY: finTop + 0.05 };
  const finMat = new THREE.MeshPhysicalMaterial({ map: finTexture(spec, finBox, detail > 0.5 ? 1024 : 512), roughness: 0.3, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.14 });
  const finMats = [finMat, mats.gapNavy];
  const finFoil = { camber: 0, n: detail > 0.5 ? 20 : 12, uv: 'planar', bbox: finBox };
  const RUD = 0.68;
  group.add(new THREE.Mesh(sectionLoft([finRootSt, finSt(finBaseY), finSt(finTop)], { ...finFoil, c0: 0, c1: RUD, capEnd: true, capMat: 0 }), finMats));
  const rudY0 = finBaseY + 0.25, rudY1 = finTop - (t.type === 'T' ? 0.7 : 0.25);
  const rudGeo = sectionLoft([finSt(rudY0), finSt(rudY1)], { ...finFoil, c0: RUD + 0.006, c1: 1, capStart: true, capEnd: true });
  const rudder = hingedPair(group, rudGeo, finMats, onFrame(frameOf(finSt(rudY0)), RUD + 0.006, 0), onFrame(frameOf(finSt(rudY1)), RUD + 0.006, 0), { pair: false });
  rudGeo.dispose();
  // fixed rudder-root fairing below the rudder
  group.add(new THREE.Mesh(sectionLoft([finRootSt, finSt(rudY0 - 0.05)], { ...finFoil, c0: RUD + 0.006, c1: 1, capEnd: true }), finMats));
  if (t.type === 'T') group.add(new THREE.Mesh(sectionLoft([finSt(rudY1 + 0.05), finSt(finTop)], { ...finFoil, c0: RUD + 0.006, c1: 1, capStart: true, capEnd: true, capMat: 0 }), finMats));

  // dorsal fillet
  const dorsal = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mats.navy);
  dorsal.scale.set(t.finRootChord * 0.35, 0.9, 0.35);
  dorsal.position.set(xf - 0.2, finBaseY - 0.25, 0);
  group.add(dorsal);

  // horizontal stabiliser + elevators
  const hs = t.hstabSpan / 2;
  const tanH = Math.tan(t.hstabSweep * deg), tanHD = Math.tan(t.hstabDihedral * deg);
  let hx, hy;
  if (t.type === 'T') { hx = xf - t.finHeight * tanF + 0.2; hy = finTop - 0.15; }
  else { hx = xf - t.finRootChord * 0.3; const pp = prof(L / 2 - hx + 0.5); hy = pp.cy + pp.sv * 0.05; }
  const hSt = z => ({ le: V3(hx - z * tanH, hy + z * tanHD, z), chord: lerp(t.hstabRootChord, t.hstabTipChord, z / hs), tc: 0.1, span: V3(0, tanHD, 1) });
  const ELE = 0.7;
  const hFoil = { camber: 0, n: detail > 0.5 ? 18 : 10, vOf: st => Math.abs(st.le.z) / hs };
  addPair(sectionLoft([hSt(0), hSt(hs)], { ...hFoil, c0: 0, c1: ELE, capEnd: true, capMat: 0 }), tailMats);
  const hRoot = t.type === 'T' ? 0.35 : R * 0.45;
  addPair(sectionLoft([hSt(0), hSt(hRoot)], { ...hFoil, c0: ELE + 0.006, c1: 1, capEnd: true }), tailMats);
  addPair(sectionLoft([hSt(hs - 0.25), hSt(hs)], { ...hFoil, c0: ELE + 0.006, c1: 1, capStart: true, capEnd: true, capMat: 0 }), tailMats);
  const eleGeo = sectionLoft([hSt(hRoot + 0.05), hSt(hs - 0.3)], { ...hFoil, c0: ELE + 0.006, c1: 1, capStart: true, capEnd: true });
  const elevators = hingedPair(group, eleGeo, tailMats, onFrame(frameOf(hSt(hRoot + 0.05)), ELE + 0.006, 0), onFrame(frameOf(hSt(hs - 0.3)), ELE + 0.006, 0));
  eleGeo.dispose();

  /* ---------- Engines + pylons ---------- */
  const fans = [], engineAnchors = [], exhausts = [];
  const pylonFoil = airfoil(10, 0);
  if (e.mount === 'wing') {
    e.stations.forEach(f => {
      const z = f * s, c = chordAt(z), yw = yAt(z);
      const front = leX(z) + e.length * 0.42;
      const cx = front - e.length * 0.5;
      const cy = yw - 0.07 * c - e.diameter * 0.5 - 0.12;
      for (const side of [1, -1]) {
        const eng = buildEngine(e.diameter, e.length, mats, detail, -side);
        eng.group.position.set(cx, cy, z * side);
        group.add(eng.group);
        fans.push(eng.fan);
        engineAnchors.push(V3(front, cy, z * side));
        exhausts.push(V3(front - e.length * 1.2, cy, z * side));
      }
      const pyl = loft([
        { le: V3(front - e.length * 0.2, cy + e.diameter * 0.38, z), chord: e.length * 1.05, tc: 0.13, span: V3(0, 1, 0) },
        { le: V3(leX(z) + 0.4, yw + 0.012 * c, z), chord: c * 0.92, tc: 0.13, span: V3(0, 1, 0) }
      ], { foil: pylonFoil, capEnd: true });
      for (const g of [pyl, mirrorZ(pyl)]) group.add(new THREE.Mesh(g, mats.wingDark));
      // aft pylon fairing under the wing
      const aft = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.wingDark);
      aft.scale.set(c * 0.34, e.diameter * 0.2, e.diameter * 0.11);
      for (const side of [1, -1]) {
        const m = aft.clone();
        m.position.set(leX(z) - c * 0.62, yw - 0.035 * c, z * side);
        group.add(m);
      }
    });
  } else {
    const xc = L / 2 - e.x * L, pp = prof(e.x * L);
    const z = pp.w + e.diameter * 0.5 + 0.55, cy = pp.cy + pp.sv * 0.55;
    for (const side of [1, -1]) {
      const eng = buildEngine(e.diameter, e.length, mats, detail, -side);
      eng.group.position.set(xc, cy, z * side);
      group.add(eng.group);
      fans.push(eng.fan);
      engineAnchors.push(V3(xc + e.length * 0.5, cy, z * side));
      exhausts.push(V3(xc - e.length * 0.7, cy, z * side));
    }
    const pyl = loft([
      { le: V3(xc + e.length * 0.18, cy, pp.w * 0.6), chord: e.length * 0.62, tc: 0.14, span: V3(0, 0, 1) },
      { le: V3(xc + e.length * 0.08, cy, z - e.diameter * 0.3), chord: e.length * 0.48, tc: 0.12, span: V3(0, 0, 1) }
    ], { foil: pylonFoil, capEnd: true });
    for (const g of [pyl, mirrorZ(pyl)]) group.add(new THREE.Mesh(g, mats.navy));
  }

  /* ---------- Small fittings ---------- */
  const fittings = new THREE.Group();
  group.add(fittings);
  const bladeAntenna = (x, top, hgt = 0.42, chord = 0.5) => {
    const p = prof(L / 2 - x);
    const g = loft([{ le: V3(chord / 2, 0, 0), chord, tc: 0.14, span: V3(0, 1, 0) }, { le: V3(chord / 2 - hgt * 0.7, hgt, 0), chord: chord * 0.45, tc: 0.12, span: V3(0, 1, 0) }], { foil: airfoil(6, 0), capEnd: true });
    const m = new THREE.Mesh(g, top ? mats.antenna : mats.navy);
    if (!top) m.rotation.x = Math.PI;
    m.position.set(x, top ? p.top - 0.02 : p.bot + 0.02, 0);
    fittings.add(m);
  };
  bladeAntenna(L * 0.22, true); bladeAntenna(-L * 0.05, true, 0.32, 0.4);
  bladeAntenna(L * 0.28, false); bladeAntenna(-L * 0.12, false, 0.3, 0.38); bladeAntenna(L * 0.05, false, 0.22, 0.3);
  if (D > 5) {
    const sat = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.radome);
    const p = prof(L * 0.62);
    sat.scale.set(1.5, 0.34, 0.75); sat.position.set(L / 2 - L * 0.62, p.top - 0.05, 0);
    fittings.add(sat);
  }
  // pitot probes and AoA vanes below the flight deck
  for (const side of [1, -1]) {
    for (const [dx, dy] of [[0.55, -0.05], [0.62, -0.22]]) {
      const x = L / 2 - D * dx, p = prof(D * dx);
      const th = Math.acos(clamp((p.cy + R * dy - p.cy) / p.sv, -1, 1));
      const base = V3(x, p.cy + R * dy, Math.sin(th) * p.w * side);
      const out = V3(0, 0, side).multiplyScalar(0.12);
      fittings.add(rod(base, base.clone().add(out), 0.035, 0.03, mats.antenna, 8));
      fittings.add(rod(base.clone().add(out), base.clone().add(out).add(V3(0.32, 0, 0)), 0.022, 0.016, mats.antenna, 8));
    }
  }
  // APU exhaust
  const pe = prof(L - 0.01);
  const apu = new THREE.Mesh(new THREE.CylinderGeometry(pe.w * 0.75, pe.w * 0.85, 0.35, 20, 1, true), mats.black);
  apu.rotation.z = Math.PI / 2; apu.position.set(-L / 2 - 0.12, pe.cy, 0);
  fittings.add(apu);
  // static wicks on the trailing edges
  const wick = (p) => fittings.add(rod(p, p.clone().add(V3(-0.42, -0.02, 0)), 0.012, 0.008, mats.black, 6));
  for (const side of [1, -1]) {
    for (const z of [zt - 0.1, zt - 0.22]) { const p = onFrame(frameOf(ws(z)), 1, 0); wick(V3(p.x, p.y, p.z * side)); }
    const ph = onFrame(frameOf(hSt(hs - 0.1)), 1, 0); wick(V3(ph.x, ph.y, ph.z * side));
  }
  wick(onFrame(frameOf(finSt(finTop - 0.1)), 1, 0));
  // wingtip lens housings + beacon domes
  const wl = wlStations[wlStations.length - 1];
  const tipRoot = side => V3(tipSt.le.x - tipSt.chord * 0.15, tipSt.le.y, (tipSt.le.z + 0.1) * side);
  const lens = (p, mat, r = 0.11) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat); m.position.copy(p); fittings.add(m); };
  lens(tipRoot(-1), mats.lensRed); lens(tipRoot(1), mats.lensGreen);
  const beaconTop = V3(xr - w.rootChord * 0.3, R * hsc + 0.08, 0), beaconBot = V3(xr + 2, -R * hsc - 0.1, 0);
  lens(beaconTop, mats.lensRed, 0.14); lens(beaconBot, mats.lensRed, 0.14);

  /* ---------- Landing gear (animated) ---------- */
  const gear = new THREE.Group();
  const groundY = -R * hsc - geo.gearHeight;
  const big = D > 5;
  const wheelR = big ? 0.66 : 0.56, wheelW = big ? 0.44 : 0.36;
  const tyreGeo = (rw, ww) => {
    const g = new THREE.LatheGeometry([[0.6, -0.5], [0.88, -0.5], [0.97, -0.36], [1, -0.14], [1, 0.14], [0.97, 0.36], [0.88, 0.5], [0.6, 0.5]].map(([a, b]) => new THREE.Vector2(a * rw, b * ww)), detail > 0.5 ? 32 : 18);
    g.rotateX(Math.PI / 2);
    return g;
  };
  const hubGeo = (rw, ww) => { const g = new THREE.CylinderGeometry(rw * 0.62, rw * 0.62, ww * 0.86, 20); g.rotateX(Math.PI / 2); return g; };
  const capGeo = (rw, ww) => { const g = new THREE.CylinderGeometry(rw * 0.2, rw * 0.26, ww * 0.98, 12); g.rotateX(Math.PI / 2); return g; };
  const wellGeo = (rw, ww) => { const g = new THREE.CylinderGeometry(rw * 0.46, rw * 0.46, ww * 0.92, 18); g.rotateX(Math.PI / 2); return g; };
  const tyre = tyreGeo(wheelR, wheelW), hub = hubGeo(wheelR, wheelW), cap = capGeo(wheelR, wheelW), well = wellGeo(wheelR, wheelW);
  const addWheel = (parent, x, y, z, ty = tyre, hb = hub, cp = cap, wl = well) => {
    for (const [g, m] of [[ty, mats.tyre], [hb, mats.hub], [wl, mats.hubDark], [cp, mats.chrome]]) { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); parent.add(mesh); }
  };
  const legs = [];
  // main gear
  const mx = xr - w.rootChord * 0.78;
  const mz = big ? R * 0.95 : R * 1.05;
  const yPivot = y0 - 0.05 * w.rootChord;
  const Ltot = yPivot - (groundY + wheelR);
  const r1 = big ? 0.23 : 0.16;
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(mx, yPivot, mz * side);
    pivot.add(rod(V3(0, 0, 0), V3(0, -Ltot * 0.62, 0), r1, r1 * 0.95, mats.gear, 16));
    pivot.add(rod(V3(0, -Ltot * 0.55, 0), V3(0, -Ltot, 0), r1 * 0.62, r1 * 0.62, mats.chrome, 16));
    // torque links
    const tl1 = rod(V3(r1 * 0.9, -Ltot * 0.6, 0), V3(r1 * 2.2, -Ltot * 0.74, 0), 0.04, 0.04, mats.gear, 6);
    const tl2 = rod(V3(r1 * 2.2, -Ltot * 0.74, 0), V3(r1 * 0.8, -Ltot * 0.9, 0), 0.04, 0.04, mats.gear, 6);
    pivot.add(tl1, tl2);
    // side brace toward the fuselage
    pivot.add(rod(V3(0, -Ltot * 0.4, 0), V3(-0.4, -0.08, -side * (big ? 1.9 : 1.4)), r1 * 0.32, r1 * 0.32, mats.gear, 8));
    const nb = geo.bogie || 2;
    const ay = -Ltot;
    if (nb <= 2) {
      pivot.add(rod(V3(0, ay, -wheelW * 0.95), V3(0, ay, wheelW * 0.95), 0.08, 0.08, mats.gear, 10));
      addWheel(pivot, 0, ay, wheelW * 0.72); addWheel(pivot, 0, ay, -wheelW * 0.72);
    } else {
      const rows = nb / 2, pitch = wheelR * 2.3;
      pivot.add(rod(V3(-(rows - 1) / 2 * pitch - 0.3, ay + 0.05, 0), V3((rows - 1) / 2 * pitch + 0.3, ay + 0.05, 0), 0.13, 0.13, mats.gear, 12));
      for (let i = 0; i < rows; i++) {
        const ox = (i - (rows - 1) / 2) * pitch;
        pivot.add(rod(V3(ox, ay, -wheelW * 1.0), V3(ox, ay, wheelW * 1.0), 0.08, 0.08, mats.gear, 10));
        addWheel(pivot, ox, ay, wheelW * 0.76); addWheel(pivot, ox, ay, -wheelW * 0.76);
      }
    }
    // leg door on the outboard side
    const door = new THREE.Mesh(new THREE.BoxGeometry(big ? 1.1 : 0.8, Ltot * 0.55, 0.05), mats.navy);
    door.position.set(-0.1, -Ltot * 0.3, side * (r1 + 0.07));
    pivot.add(door);
    gear.add(pivot);
    legs.push({ pivot, kind: 'main', side });
  }
  // nose gear
  const nxPos = L / 2 - geo.noseLen * D * 0.95;
  const nProf = prof(L / 2 - nxPos);
  const nyPivot = nProf.bot + 0.35;
  const nwR = wheelR * 0.72, nwW = wheelW * 0.85;
  const nLtot = nyPivot - (groundY + nwR);
  const nPivot = new THREE.Group();
  nPivot.position.set(nxPos, nyPivot, 0);
  nPivot.add(rod(V3(0, 0, 0), V3(0, -nLtot * 0.6, 0), 0.12 * (D / 4) + 0.03, 0.11 * (D / 4) + 0.03, mats.gear, 14));
  nPivot.add(rod(V3(0, -nLtot * 0.52, 0), V3(0, -nLtot, 0), 0.07 * (D / 4) + 0.02, 0.07 * (D / 4) + 0.02, mats.chrome, 14));
  nPivot.add(rod(V3(0, -nLtot * 0.3, 0), V3(-1.1, -0.05, 0), 0.05, 0.05, mats.gear, 8));
  nPivot.add(rod(V3(0, -nLtot, -nwW * 0.9), V3(0, -nLtot, nwW * 0.9), 0.06, 0.06, mats.gear, 8));
  const nTyre = tyreGeo(nwR, nwW), nHub = hubGeo(nwR, nwW), nCap = capGeo(nwR, nwW), nWell = wellGeo(nwR, nwW);
  addWheel(nPivot, 0, -nLtot, nwW * 0.62, nTyre, nHub, nCap, nWell); addWheel(nPivot, 0, -nLtot, -nwW * 0.62, nTyre, nHub, nCap, nWell);
  gear.add(nPivot);
  legs.push({ pivot: nPivot, kind: 'nose' });
  // nose gear bay doors
  const doors = [];
  for (const side of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(nxPos + 0.2, nProf.bot + 0.08, side * 0.42);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.6 : 2.0, 0.04, 0.4), mats.navy);
    plate.position.set(0, 0, -side * 0.2);
    hinge.add(plate);
    gear.add(hinge);
    doors.push({ hinge, side });
  }
  group.add(gear);

  /* ---------- Lights ---------- */
  const lights = [];
  const addLight = (pos, color, size, kind, phase = 0, parent = group) => {
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos); sp.scale.setScalar(size);
    sp.userData = { kind, phase, base: size, color: new THREE.Color(color) };
    parent.add(sp);
    lights.push(sp);
    return sp;
  };
  const navSize = D * 0.55;
  addLight(tipRoot(-1), '#ff2a3a', navSize, 'nav');
  addLight(tipRoot(1), '#2dff7a', navSize, 'nav');
  addLight(tipRoot(-1), '#ffffff', navSize * 2.2, 'strobe', 0);
  addLight(tipRoot(1), '#ffffff', navSize * 2.2, 'strobe', 0);
  addLight(V3(-L / 2 - 0.2, pe.cy, 0), '#ffffff', navSize * 0.8, 'nav');
  addLight(V3(-L / 2 - 0.2, pe.cy, 0), '#ffffff', navSize * 1.8, 'strobe', 0.12);
  addLight(beaconTop, '#ff2030', navSize * 1.3, 'beacon', 0);
  addLight(beaconBot, '#ff2030', navSize * 1.3, 'beacon', 0.5);
  for (const side of [1, -1]) addLight(V3(leX(R * 1.3) + 0.2, yAt(R * 1.3) - 0.15, R * 1.3 * side), '#fff6e0', navSize * 1.6, 'landing');
  addLight(V3(0.35, -nLtot * 0.55, 0), '#fff6e0', navSize * 1.3, 'landing', 0, nPivot);

  /* ---------- Anchors (for hotspots / cameras) ---------- */
  const anchors = {
    cockpit: V3(L / 2 - geo.noseLen * D * 0.42, R * 0.62, R * 0.5),
    cabin: V3(L * 0.08, R * 0.25, R * 0.98),
    wing: V3(leX(s * 0.62) - chordAt(s * 0.62) * 0.45, yAt(s * 0.62) + 0.2, s * 0.62),
    winglet: V3(wl.le.x - wl.chord * 0.5, wl.le.y - (w.winglet === 'raked' ? 0 : 0.6), wl.le.z),
    engine: engineAnchors[0].clone(),
    fin: V3(xf - t.finHeight * 0.55 * tanF - t.finRootChord * 0.4, finBaseY + t.finHeight * 0.55, 0.3),
    tail: V3(-L / 2 + geo.tailLen * D * 0.55, 0, R * 0.7)
  };
  const anchorNormals = {
    cockpit: V3(0.6, 0.6, 0.5).normalize(), cabin: V3(0, 0.2, 1).normalize(),
    wing: V3(0, 1, 0.1).normalize(), winglet: V3(0, 0.2, 1).normalize(),
    engine: V3(1, 0, 0.3).normalize(), fin: V3(0, 0.2, 1).normalize(),
    tail: V3(-0.3, 0.2, 1).normalize()
  };

  const box = new THREE.Box3().setFromObject(group);
  const dims = { length: L, span: w.span, groundY, box, height: finTop - groundY };
  const meshes = [];
  group.traverse(o => { if (o.isMesh || o.isInstancedMesh) meshes.push(o); });

  /* ---------- State + animation ---------- */
  const state = { gear: opts.gear ? 1 : 0, gearTarget: opts.gear ? 1 : 0, flaps: 0, flapTarget: 0, night: 0 };
  const applyGear = () => {
    const ext = easeIO(clamp(state.gear, 0, 1));
    const swing = smooth(0.12, 1, state.gear);
    legs.forEach(l => {
      if (l.kind === 'main') l.pivot.rotation.x = l.side * (1 - swing) * Math.PI / 2;
      else l.pivot.rotation.z = (1 - swing) * Math.PI / 2;
    });
    const open = state.gear > 0.001 && state.gear < 0.999 ? 1 : smooth(0, 0.15, state.gear) * (state.gear >= 0.999 ? 0.92 : 1);
    doors.forEach(d => { d.hinge.rotation.x = -d.side * open * 82 * deg; });
    gear.visible = state.gear > 0.002;
    void ext;
  };
  const applyFlaps = (ctl) => {
    const f = easeIO(clamp(state.flaps, 0, 1));
    flaps.forEach(fl => fl.pair.set(f * (fl.kind === 'inboard' ? 32 : 26) * deg, f * (fl.kind === 'inboard' ? 32 : 26) * deg, fl.slide.clone().multiplyScalar(f)));
    slats.forEach(sl => sl.pair.set(-f * 20 * deg, -f * 20 * deg, sl.slide.clone().multiplyScalar(f)));
    ailerons.pair.set((ctl.ail + f * 5) * deg, (-ctl.ail + f * 5) * deg);
    elevators.set(ctl.ele * deg, ctl.ele * deg);
    rudder.set(ctl.rud * deg);
  };
  applyGear();
  applyFlaps({ ail: 0, ele: 0, rud: 0 });

  const api = {
    spec, group, dims, anchors, anchorNormals, gear, fans, lights, exhausts, materials: mats, finMaterial: finMat,
    fanSpeed: 1,
    lightLevel: opts.lights ?? 1,
    lightBoost: 1,
    controlCheck: false,
    controls: { ail: 0, ele: 0, rud: 0 },
    update(time, dt) {
      for (const f of fans) f.rotation.x -= dt * 18 * api.fanSpeed;
      // gear + flaps run their own sequences
      if (state.gear !== state.gearTarget) {
        const dir = Math.sign(state.gearTarget - state.gear);
        state.gear = clamp(state.gear + dir * dt / 3.2, Math.min(state.gear, state.gearTarget), Math.max(state.gear, state.gearTarget));
        applyGear();
      }
      if (state.flaps !== state.flapTarget) {
        const dir = Math.sign(state.flapTarget - state.flaps);
        state.flaps = clamp(state.flaps + dir * dt / 3.5, Math.min(state.flaps, state.flapTarget), Math.max(state.flaps, state.flapTarget));
      }
      const ctl = { ail: api.controls.ail, ele: api.controls.ele, rud: api.controls.rud };
      if (api.controlCheck) {
        const c = time % 14;
        const pulse = (a, b) => (c > a && c < b) ? Math.sin(Math.PI * (c - a) / (b - a)) : 0;
        ctl.ail = 16 * (pulse(0.5, 2.2) - pulse(2.4, 4.1));
        ctl.ele = 14 * (pulse(5, 6.6) - pulse(6.8, 8.4));
        ctl.rud = 20 * (pulse(9.2, 10.8) - pulse(11, 12.6));
      }
      applyFlaps(ctl);
      const gearOn = smooth(0.85, 1, state.gear);
      for (const l of lights) {
        const u = l.userData;
        let k = 1;
        if (u.kind === 'strobe') { const ph = ((time + u.phase) % 1.25) / 1.25; k = (ph < 0.04 || (ph > 0.1 && ph < 0.14)) ? 1 : 0; }
        else if (u.kind === 'beacon') { const ph = ((time + u.phase) % 1.1) / 1.1; k = Math.max(0, Math.sin(ph * Math.PI * 2)) ** 3; }
        else if (u.kind === 'landing') k = gearOn * (0.2 + 0.8 * state.night);
        const vis = u.kind === 'nav' ? 0.55 + 0.45 * state.night : 0.6 + 0.4 * state.night;
        l.material.opacity = k * vis * api.lightLevel;
        l.material.color.copy(u.color).multiplyScalar(api.lightBoost);
        l.scale.setScalar(u.base * (0.6 + 0.4 * k));
      }
    },
    setNight(v) {
      state.night = v;
      mats.fuselage.emissiveIntensity = v * 1.6;
      if (!finMat.emissiveMap) { finMat.emissiveMap = finMat.map; finMat.emissive = new THREE.Color('#ffffff'); finMat.needsUpdate = true; }
      finMat.emissiveIntensity = v * 0.35;
    },
    setGear(v, instant = false) {
      state.gearTarget = v ? 1 : 0;
      if (instant) { state.gear = state.gearTarget; applyGear(); }
    },
    setFlaps(v, instant = false) {
      state.flapTarget = clamp(+v, 0, 1);
      if (instant) state.flaps = state.flapTarget;
    },
    get gearState() { return state.gear; },
    xray: null,
    setXray(on) {
      if (on && !api.xray) {
        const xm = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color('#7FD3FF') }, uPow: { value: 2.2 } },
          vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 p = vec4(position,1.0); vec3 n = normal;
            #ifdef USE_INSTANCING
            p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
            #endif
            vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix*n); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
          fragmentShader: `uniform vec3 uColor; uniform float uPow; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor * (0.15 + f*1.6), 0.05 + f*0.85); }`,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        });
        api.xray = { mat: xm, saved: meshes.map(m => m.material) };
      }
      if (!api.xray) return;
      meshes.forEach((m, i) => { m.material = on ? api.xray.mat : api.xray.saved[i]; });
      lights.forEach(l => { l.visible = !on; });
    },
    dispose() {
      const geos = new Set(), matSet = new Set();
      group.traverse(o => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) [].concat(o.material).forEach(m => matSet.add(m));
      });
      Object.values(mats).concat([finMat]).forEach(m => matSet.add(m));
      if (api.xray) api.xray.saved.forEach(m => [].concat(m).forEach(x => matSet.add(x)));
      geos.forEach(g => g.dispose());
      const texs = new Set();
      matSet.forEach(m => {
        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap'].forEach(k => { if (m[k] && m[k] !== glowTex) texs.add(m[k]); });
        m.dispose();
      });
      texs.forEach(t => t.dispose());
    }
  };
  return api;
}

// Wait for the fonts used on the livery so canvas text renders in the right face.
export async function loadLiveryFonts(timeout = 2500) {
  if (!document.fonts || !document.fonts.load) return;
  const p = Promise.all([
    document.fonts.load('700 64px "Cormorant Garamond"'),
    document.fonts.load('500 64px "Inter"')
  ]).catch(() => {});
  await Promise.race([p, new Promise(r => setTimeout(r, timeout))]);
}
