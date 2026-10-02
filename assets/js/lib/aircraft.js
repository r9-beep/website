// Procedural airliner generator for the BAC fleet.
// Builds a fully-liveried 3D aircraft from the parametric description in data/fleet.js.
// Frame: +X forward (nose), +Y up, +Z starboard. Units: metres.
import * as THREE from '../vendor/three.js';

export const COLORS = {
  ivory: '#F2EFE8',
  midnight: '#0B1124',
  navy: '#121B38',
  union: '#C8102E',
  gold: '#C9A84C',
  titanium: '#9AA0AC',
  wing: '#BFC4CC'
};

const deg = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

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

// Airfoil ring: TE(upper) -> LE -> TE(lower). Returns [{x, y}] in chord units.
function airfoil(n = 18, camber = 0.02, camberPos = 0.4) {
  const pts = [];
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(0.5 * (1 - Math.cos(Math.PI * i / n))); // 0..1 cosine spaced
  const thick = x => 0.6 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const camb = x => camber === 0 ? 0 : (x < camberPos
    ? camber / (camberPos ** 2) * (2 * camberPos * x - x * x)
    : camber / ((1 - camberPos) ** 2) * ((1 - 2 * camberPos) + 2 * camberPos * x - x * x));
  for (let i = n; i >= 0; i--) pts.push({ x: xs[i], y: camb(xs[i]) + thick(xs[i]), up: true });
  for (let i = 1; i <= n; i++) pts.push({ x: xs[i], y: camb(xs[i]) - thick(xs[i]), up: false });
  return pts;
}

// Loft an airfoil through a list of stations.
// station: { le: Vector3, chord, tc, span: Vector3 (unit spanwise tangent), twist (deg), chordDir? }
function loft(stations, { foil = airfoil(), capEnd = true, uvMode = 'chord', bbox = null } = {}) {
  const M = foil.length;
  const pos = [], uv = [], idx = [];
  const X = new THREE.Vector3(-1, 0, 0);
  stations.forEach((s, si) => {
    const t = s.span.clone().normalize();
    // thickness normal: rotate span tangent +90° in the Y-Z plane
    const n = new THREE.Vector3(0, t.z, -t.y);
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();
    let c = (s.chordDir || X).clone();
    if (s.twist) {
      const tw = s.twist * deg;
      const c2 = c.clone().multiplyScalar(Math.cos(tw)).addScaledVector(n, Math.sin(tw));
      n.multiplyScalar(Math.cos(tw)).addScaledVector(c, -Math.sin(tw));
      c = c2;
    }
    foil.forEach((f, fi) => {
      const p = s.le.clone().addScaledVector(c, f.x * s.chord).addScaledVector(n, f.y * s.chord * (s.tc / 0.12));
      pos.push(p.x, p.y, p.z);
      if (uvMode === 'planar' && bbox) {
        uv.push((bbox.maxX - p.x) / (bbox.maxX - bbox.minX), (p.y - bbox.minY) / (bbox.maxY - bbox.minY));
      } else {
        uv.push(f.up ? f.x * 0.5 : 1 - f.x * 0.5, si / (stations.length - 1));
      }
    });
  });
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < M - 1; k++) {
      const a = si * M + k, b = (si + 1) * M + k, c = (si + 1) * M + k + 1, d = si * M + k + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (capEnd) {
    const base = (stations.length - 1) * M;
    const half = (M - 1) / 2;
    for (let k = 0; k < half; k++) {
      const u0 = base + k, u1 = base + k + 1;
      const l0 = base + (M - 1 - k), l1 = base + (M - 2 - k);
      idx.push(u0, u1, l0);
      if (k < half - 1) idx.push(u1, l1, l0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function lathe(profile, segs = 48, phiStart = 0, phiLength = Math.PI * 2) {
  // profile: [[radius, x]] ; returns geometry revolved about the X axis
  const pts = profile.map(([r, x]) => new THREE.Vector2(Math.max(r, 1e-4), x));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLength);
  g.rotateZ(-Math.PI / 2);
  return g;
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
      // flight-deck brow: lift the upper line a touch behind the windscreen
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
  const nN = detail > 0.5 ? 46 : 26, nB = detail > 0.5 ? 40 : 20, nT = detail > 0.5 ? 46 : 24;
  for (let i = 0; i <= nN; i++) { const t = i / nN; xs.push(nl * (1 - Math.cos(t * Math.PI / 2)) ** 1.0 * 1 + 0.0); }
  xs[0] = 0.0005;
  for (let i = 1; i <= nB; i++) xs.push(nl + (L - nl - tl) * i / nB);
  for (let i = 1; i <= nT; i++) xs.push(L - tl + tl * i / nT);
  const seg = detail > 0.5 ? 72 : 40;
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
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * R1 + j, b = (i + 1) * R1 + j, c = (i + 1) * R1 + j + 1, d = i * R1 + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  // tail cap
  const last = xs.length - 1;
  const capC = pos.length / 3;
  const pe = prof(L - 0.001);
  pos.push(L / 2 - L - 0.05, pe.cy, 0); uv.push(1, 0.5);
  for (let j = 0; j < seg; j++) idx.push(last * R1 + j, capC, last * R1 + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld seam normals + force nose tip normal forward
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

/* ------------------------------------------------------------------ */
/* Livery textures                                                     */
/* ------------------------------------------------------------------ */

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

function fuselageTextures(spec, prof, res) {
  const geo = spec.geo;
  const L = geo.length, R = geo.diameter / 2, D = geo.diameter;
  const nl = geo.noseLen * D, tl = geo.tailLen * D;
  const W = res, H = res / 4;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cv = mk(), em = mk();
  const ctx = cv.getContext('2d'), ex = em.getContext('2d');
  const sx = W / L;                 // px per metre along the fuselage
  const sy = H / (2 * Math.PI * R); // px per metre around the barrel (mid-body)
  const PX = x => x * sx;
  const PY = a => a / 360 * H;      // angle (deg) from top, increasing to starboard
  const accent = spec.accent === 'gold' ? COLORS.gold : COLORS.union;

  ctx.fillStyle = COLORS.ivory; ctx.fillRect(0, 0, W, H);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);

  // subtle barrel joints
  ctx.strokeStyle = 'rgba(40,46,60,0.10)'; ctx.lineWidth = Math.max(1, W / 2048);
  for (let x = nl * 0.8; x < L - tl * 0.5; x += 5.8) { ctx.beginPath(); ctx.moveTo(PX(x), 0); ctx.lineTo(PX(x), H); ctx.stroke(); }

  // Belly line: angle from the top, sweeping up over the tail cone
  const belly = x => {
    const u = x / L;
    const base = lerp(180, 113, smooth(nl * 0.45, nl * 1.35, x)); // radome stays ivory
    return base * (1 - Math.pow(smooth(0.58, 0.955, u), 1.15));
  };
  const steps = 400;
  const band = (a0f, a1f, col, xStart = 0, taper = 0) => {
    // draws a band between angle offsets from the belly line on both sides
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = xStart + (L - xStart) * i / steps;
        const k = taper ? smooth(xStart, xStart + taper, x) : 1;
        const b = belly(x), a = b - a0f * k;
        ctx.lineTo(PX(x), PY(side > 0 ? a : 360 - a));
      }
      for (let i = steps; i >= 0; i--) {
        const x = xStart + (L - xStart) * i / steps;
        const k = taper ? smooth(xStart, xStart + taper, x) : 1;
        const b = belly(x), a = b - a1f * k;
        ctx.lineTo(PX(x), PY(side > 0 ? a : 360 - a));
      }
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
  };
  // navy belly
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) { const x = L * i / steps; ctx.lineTo(PX(x), PY(belly(x))); }
  for (let i = steps; i >= 0; i--) { const x = L * i / steps; ctx.lineTo(PX(x), PY(360 - belly(x))); }
  ctx.closePath(); ctx.fillStyle = COLORS.midnight; ctx.fill();
  // cheatline: accent band + gold/ivory pinstripe, tapering in from the nose
  band(-0.2, 7.5, COLORS.union, nl * 1.0, 6);
  band(-1.8, -0.8, COLORS.gold, nl * 1.0, 6);
  band(9.0, 10.0, accent, nl * 1.25, 8);

  // Windows
  const pitch = geo.windowPitch || 0.55;
  const winA = 72; // degrees from top
  const ww = 0.27 * (D > 5 ? 1.15 : 1), wh = 0.38 * (D > 5 ? 1.2 : 1);
  const doors = (geo.doors || []).map(f => f * L);
  const over = (geo.overwing || []).map(f => f * L);
  const xStart = doors[0] + 1.6, xEnd = L - tl * 0.62;
  const avoid = x => doors.some(d => Math.abs(x - d) < 1.25) || over.some(d => Math.abs(x - d) < 0.42);
  const winPx = PX(ww), winPy = wh * sy;
  const drawWin = (x, side) => {
    const a = side > 0 ? winA : 360 - winA;
    const cx = PX(x), cy = PY(a);
    const onNavy = belly(x) < winA + 6;
    ctx.fillStyle = onNavy ? '#05070D' : '#1A2233';
    roundRect(ctx, cx - winPx / 2, cy - winPy / 2, winPx, winPy, winPx * 0.45); ctx.fill();
    ctx.strokeStyle = onNavy ? 'rgba(201,168,76,0.25)' : 'rgba(10,14,26,0.35)'; ctx.lineWidth = Math.max(1, winPx * 0.08); ctx.stroke();
    ex.fillStyle = '#FFC98A';
    roundRect(ex, cx - winPx / 2, cy - winPy / 2, winPx, winPy, winPx * 0.45); ex.fill();
  };
  for (let x = xStart; x < xEnd; x += pitch) if (!avoid(x)) { drawWin(x, 1); drawWin(x, -1); }

  // Doors
  const doorW = 1.07, doorH = 1.9;
  const doorA0 = winA - (doorH * 0.32) / (2 * Math.PI * R) * 360;
  const drawDoor = (x, side, w = doorW, h = doorH) => {
    const hA = h / (2 * Math.PI * R) * 360;
    const a0 = (side > 0 ? doorA0 : 360 - doorA0 - hA);
    const onNavy = belly(x) < doorA0 + hA;
    ctx.strokeStyle = onNavy ? 'rgba(201,168,76,0.35)' : 'rgba(30,36,52,0.45)';
    ctx.lineWidth = Math.max(1.2, W / 1600);
    roundRect(ctx, PX(x - w / 2), PY(a0), PX(w), hA / 360 * H, PX(0.18)); ctx.stroke();
    drawWin(x, side);
  };
  doors.forEach(x => { drawDoor(x, 1); drawDoor(x, -1); });
  over.forEach(x => {
    for (const side of [1, -1]) {
      const hA = 1.0 / (2 * Math.PI * R) * 360;
      const a0 = side > 0 ? winA - hA * 0.45 : 360 - winA - hA * 0.55;
      ctx.strokeStyle = 'rgba(30,36,52,0.35)'; ctx.lineWidth = Math.max(1, W / 2048);
      roundRect(ctx, PX(x - 0.3), PY(a0), PX(0.6), hA / 360 * H, PX(0.1)); ctx.stroke();
    }
  });

  // Flight deck windows (+ dark "mask" on the long-haul family)
  const fd = (x0, x1, a0, a1, slant = 0) => {
    for (const side of [1, -1]) {
      const A = a => side > 0 ? a : 360 - a;
      ctx.beginPath();
      ctx.moveTo(PX(x0), PY(A(a0))); ctx.lineTo(PX(x1 - slant), PY(A(a0)));
      ctx.lineTo(PX(x1), PY(A(a1))); ctx.lineTo(PX(x0 + slant * 0.3), PY(A(a1))); ctx.closePath();
      ctx.fillStyle = '#0A0F1A'; ctx.fill();
      ex.beginPath();
      ex.moveTo(PX(x0), PY(A(a0))); ex.lineTo(PX(x1 - slant), PY(A(a0)));
      ex.lineTo(PX(x1), PY(A(a1))); ex.lineTo(PX(x0 + slant * 0.3), PY(A(a1))); ex.closePath();
      ex.fillStyle = '#1d2a44'; ex.fill();
    }
  };
  // Flight deck: one dark band with slanted pillars
  const fx0 = 0.40 * D, fx1 = 0.84 * D;
  const poly = (pts, side, c, e) => {
    const A = a => side > 0 ? a : 360 - a;
    for (const [g, col] of [[ctx, c], [ex, e]]) {
      g.beginPath();
      pts.forEach(([x, a], i) => i ? g.lineTo(PX(x), PY(A(a))) : g.moveTo(PX(x), PY(A(a))));
      g.closePath(); g.fillStyle = col; g.fill();
    }
  };
  for (const side of [1, -1]) {
    if (geo.mask) poly([[fx0 - 0.05 * D, 60], [fx0 + 0.02 * D, 9], [fx1 - 0.01 * D, 31], [fx1 + 0.06 * D, 60]], side, '#121826', '#000');
    poly([[fx0, 54], [fx0 + 0.06 * D, 14], [fx1 - 0.05 * D, 36], [fx1, 54]], side, '#070B14', '#22314f');
    for (const f of [0.36, 0.68]) {
      const xb = lerp(fx0, fx1, f), xt = lerp(fx0 + 0.06 * D, fx1 - 0.05 * D, f) - 0.04 * D;
      const at = lerp(14, 36, f) - 1, pw = 0.03 * D;
      poly([[xb - pw / 2, 55], [xt - pw / 2, at], [xt + pw / 2, at], [xb + pw / 2, 55]], side, geo.mask ? '#121826' : COLORS.ivory, '#000');
    }
  }

  // Titles + flag
  const titleH = D > 5 ? 0.78 : 0.56;
  const titleA = 49;
  const font = `700 ${titleH * 100}px "Cormorant Garamond", Georgia, serif`;
  ctx.font = font;
  ctx.save();
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${titleH * 14}px`;
  const text = 'BRITISH AIRCRAFT CORPORATION';
  const tw = ctx.measureText(text).width / 100;
  ctx.restore();
  const tx0 = doors[0] + 2.2;
  const tcx = tx0 + tw / 2;
  const drawText = (str, cxm, ang, hM, color, side, fontW = 600, spacing = 14, family = '"Cormorant Garamond", Georgia, serif') => {
    ctx.save();
    const py = PY(side > 0 ? ang : 360 - ang);
    ctx.setTransform(side > 0 ? -sx / 100 : sx / 100, 0, 0, side > 0 ? sy / 100 : -sy / 100, PX(cxm), py);
    ctx.font = `${fontW} ${hM * 100}px ${family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${hM * spacing}px`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(str, 0, 0);
    ctx.restore();
  };
  for (const side of [1, -1]) {
    drawText(text, tcx, titleA, titleH, COLORS.midnight, side, 700);
    // flag aft of the title
    const fw = titleH * 1.9, fh = titleH * 0.95;
    const fx = tx0 + tw + 1.4;
    ctx.save();
    const py = PY(side > 0 ? titleA : 360 - titleA);
    ctx.setTransform(side > 0 ? -sx : sx, 0, 0, side > 0 ? sy : -sy, PX(fx + fw / 2), py);
    ctx.translate(-fw / 2, -fh / 2);
    ctx.scale(fw / 60, fh / 30);
    drawUnionFlag(ctx, 60, 30);
    ctx.restore();
    // registration on the navy tail cone
    drawText(spec.reg, L * 0.865, 62, titleH * 0.62, COLORS.gold, side, 500, 8, '"Inter", Arial, sans-serif');
    // aircraft type near the nose
    drawText(spec.code, doors[0] - 0.2 - 0, 40, titleH * 0.42, COLORS.midnight, side, 500, 10, '"Inter", Arial, sans-serif');
  }

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.flipY = false; map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(em);
  emissive.colorSpace = THREE.SRGBColorSpace; emissive.flipY = false;
  return { map, emissive };
}

function finTexture(spec, bbox, res) {
  const w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
  const W = res, H = Math.round(res * h / w);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const s = W / w;
  // metre space: x = 0 at fin leading-edge-most point (forward), increasing aft; y = 0 at root, up
  ctx.setTransform(s, 0, 0, -s, 0, H);
  ctx.fillStyle = COLORS.midnight; ctx.fillRect(0, 0, w, h);
  const gold = spec.accent === 'gold';
  // sweeping ribbons
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
  // roundel (the BAC mark) — positioned on the upper fin, near the mid chord
  const cy = h * 0.70;
  const sweep = Math.tan((spec.geo.tail.finSweep) * deg);
  const cx = (cy * sweep) + (spec.geo.tail.finRootChord * 0.5 - (spec.geo.tail.finRootChord - spec.geo.tail.finTipChord) * 0.5 * 0.70) + 0.1;
  const r = Math.min(h * 0.17, spec.geo.tail.finTipChord * 0.62);
  ctx.lineWidth = r * 0.09;
  ctx.strokeStyle = gold ? COLORS.gold : COLORS.union;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = r * 0.05; ctx.strokeStyle = COLORS.ivory;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLORS.union;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = gold ? COLORS.gold : COLORS.union;
  ctx.beginPath(); ctx.moveTo(cx - r * 1.0, cy); ctx.lineTo(cx - r * 0.33, cy + r * 0.14); ctx.lineTo(cx - r * 0.33, cy - r * 0.14); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + r * 1.0, cy); ctx.lineTo(cx + r * 0.33, cy + r * 0.14); ctx.lineTo(cx + r * 0.33, cy - r * 0.14); ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function nacelleTexture(accent) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = COLORS.midnight; ctx.fillRect(0, 0, 8, 256);
  // lathe v runs along the profile: draw an accent ring near the front
  ctx.fillStyle = accent; ctx.fillRect(0, 256 * 0.78, 8, 256 * 0.03);
  ctx.fillStyle = COLORS.gold; ctx.fillRect(0, 256 * 0.815, 8, 256 * 0.008);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/* ------------------------------------------------------------------ */
/* Engines                                                             */
/* ------------------------------------------------------------------ */

function buildEngine(d, len, mats, detail) {
  const g = new THREE.Group();
  const r = d / 2, h = len;
  const segs = detail > 0.5 ? 48 : 28;
  const front = h * 0.5;
  // outer cowl
  const cowl = lathe([
    [r * 0.93, front - h * 0.02], [r * 0.985, front - h * 0.07], [r, front - h * 0.16],
    [r * 0.995, front - h * 0.35], [r * 0.95, front - h * 0.6], [r * 0.84, front - h * 0.82], [r * 0.8, front - h * 0.86]
  ], segs);
  g.add(new THREE.Mesh(cowl, mats.nacelle));
  // polished intake lip
  const lip = lathe([
    [r * 0.82, front - h * 0.08], [r * 0.83, front - h * 0.02], [r * 0.87, front + h * 0.005], [r * 0.915, front - h * 0.005], [r * 0.935, front - h * 0.025]
  ], segs);
  g.add(new THREE.Mesh(lip, mats.lip));
  // inner duct (bypass outer wall)
  const duct = lathe([[r * 0.82, front - h * 0.07], [r * 0.80, front - h * 0.2], [r * 0.79, front - h * 0.5], [r * 0.76, front - h * 0.85]], segs);
  g.add(new THREE.Mesh(duct, mats.duct));
  // core cowl + exhaust plug
  const core = lathe([
    [r * 0.5, front - h * 0.42], [r * 0.56, front - h * 0.6], [r * 0.52, front - h * 0.85], [r * 0.4, front - h * 1.02],
    [r * 0.3, front - h * 1.03], [r * 0.24, front - h * 1.08], [0.001, front - h * 1.2]
  ], segs);
  g.add(new THREE.Mesh(core, mats.core));
  // fan face (dark disc) + spinner + blades
  const fanX = front - h * 0.17;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, segs), mats.fanFace);
  disc.rotation.y = Math.PI / 2; disc.position.x = fanX - h * 0.03;
  g.add(disc);
  const fan = new THREE.Group();
  fan.position.x = fanX;
  const spinner = lathe([[r * 0.27, -h * 0.02], [r * 0.25, h * 0.03], [r * 0.16, h * 0.08], [0.001, h * 0.12]], segs);
  fan.add(new THREE.Mesh(spinner, mats.spinner));
  const nBl = detail > 0.5 ? 20 : 14;
  const bladeGeo = fanBlade(r * 0.26, r * 0.79, r * 0.28);
  const blades = new THREE.InstancedMesh(bladeGeo, mats.blade, nBl);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < nBl; i++) {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), i / nBl * Math.PI * 2);
    m.compose(new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1));
    blades.setMatrixAt(i, m);
  }
  fan.add(blades);
  g.add(fan);
  return { group: g, fan };
}

function fanBlade(r0, r1, chord) {
  // twisted blade in the plane perpendicular to X, spanning +Y
  const ns = 6, pos = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    const t = i / ns, rr = lerp(r0, r1, t);
    const pitch = lerp(58, 28, t) * deg;
    const c = chord * lerp(0.75, 1.15, Math.sin(t * Math.PI * 0.8));
    const sweep = t * t * chord * 0.35;
    const cx = Math.cos(pitch) * c / 2, cz = Math.sin(pitch) * c / 2;
    pos.push(cx - sweep, rr, cz, -cx - sweep, rr, -cz);
  }
  for (let i = 0; i < ns; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* Main builder                                                        */
/* ------------------------------------------------------------------ */

export function buildAircraft(spec, opts = {}) {
  const detail = opts.detail ?? 1;
  const texRes = opts.textureSize ?? (detail > 0.5 ? 4096 : 2048);
  const geo = spec.geo;
  const L = geo.length, D = geo.diameter, R = D / 2;
  const group = new THREE.Group();
  group.name = spec.code;
  const accentHex = spec.accent === 'gold' ? COLORS.gold : COLORS.union;

  const fus = buildFuselage(geo, detail);
  const prof = fus.prof;
  const tex = fuselageTextures(spec, prof, texRes);

  const mats = {
    fuselage: new THREE.MeshPhysicalMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.18 }),
    wing: new THREE.MeshStandardMaterial({ color: COLORS.wing, roughness: 0.42, metalness: 0.35 }),
    wingDark: new THREE.MeshStandardMaterial({ color: '#7E848E', roughness: 0.5, metalness: 0.35 }),
    navy: new THREE.MeshPhysicalMaterial({ color: COLORS.midnight, roughness: 0.3, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    accent: new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.28, metalness: spec.accent === 'gold' ? 0.7 : 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    nacelle: new THREE.MeshPhysicalMaterial({ map: nacelleTexture(accentHex), roughness: 0.3, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.15, side: THREE.DoubleSide }),
    lip: new THREE.MeshStandardMaterial({ color: '#D9DDE3', roughness: 0.16, metalness: 1.0, side: THREE.DoubleSide }),
    duct: new THREE.MeshStandardMaterial({ color: '#1B1F28', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
    core: new THREE.MeshStandardMaterial({ color: '#6E737C', roughness: 0.38, metalness: 0.85, side: THREE.DoubleSide }),
    fanFace: new THREE.MeshStandardMaterial({ color: '#0A0C12', roughness: 0.9, metalness: 0.2 }),
    spinner: new THREE.MeshStandardMaterial({ color: '#20242C', roughness: 0.3, metalness: 0.8 }),
    blade: new THREE.MeshStandardMaterial({ color: '#A9AFB8', roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }),
    gear: new THREE.MeshStandardMaterial({ color: '#C9CDD3', roughness: 0.35, metalness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#15171B', roughness: 0.85, metalness: 0 })
  };

  const fuselage = new THREE.Mesh(fus.geometry, mats.fuselage);
  fuselage.name = 'fuselage';
  group.add(fuselage);

  /* ---------- Wing ---------- */
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
  const wingStations = [0, R * 0.9, zk, lerp(zk, zt, 0.5), zt].map((z, i, arr) => ({
    le: new THREE.Vector3(leX(z), yAt(z), z),
    chord: chordAt(z), tc: lerp(0.15, 0.1, z / zt), twist: -lerp(0, 3, z / zt) * -1,
    span: new THREE.Vector3(0, tanD, 1)
  }));
  const wingFoil = airfoil(detail > 0.5 ? 18 : 10, 0.022, 0.42);
  const wingGeo = loft(wingStations, { foil: wingFoil, capEnd: w.winglet === 'raked' ? false : true });
  // winglet
  const tip = wingStations[wingStations.length - 1];
  let wlStations = null;
  if (w.winglet === 'raked') {
    const z1 = s;
    const x1 = tip.le.x - (z1 - zt) * Math.tan(52 * deg);
    wlStations = [
      tip,
      { le: new THREE.Vector3(lerp(tip.le.x, x1, 0.5) - 0.1, yAt(lerp(zt, z1, 0.5)), lerp(zt, z1, 0.5)), chord: tip.chord * 0.65, tc: 0.09, twist: 0, span: new THREE.Vector3(0, tanD, 1) },
      { le: new THREE.Vector3(x1, yAt(z1), z1), chord: tip.chord * 0.24, tc: 0.08, twist: 0, span: new THREE.Vector3(0, tanD, 1) }
    ];
  } else {
    const hW = w.wingletH, rad = w.winglet === 'sharklet' ? hW * 0.42 : hW * 0.32;
    const n = 7;
    wlStations = [tip];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const ang = Math.min(1, t * 1.6) * (w.winglet === 'sharklet' ? 78 : 82) * deg;
      // arc then straight
      const arcLen = rad * (Math.PI / 2);
      const along = t * (arcLen + (hW - rad));
      let z, y;
      if (along < arcLen) { const a = along / rad; z = zt + rad * Math.sin(a) * 0.95; y = tip.le.y + rad * (1 - Math.cos(a)); }
      else { z = zt + rad * 0.95 + (along - arcLen) * Math.cos(78 * deg) * 0.4; y = tip.le.y + rad + (along - arcLen); }
      const xb = tip.le.x - along * Math.tan((w.winglet === 'sharklet' ? 36 : 32) * deg) - t * tip.chord * 0.1;
      wlStations.push({
        le: new THREE.Vector3(xb, y, z),
        chord: tip.chord * lerp(1, w.winglet === 'sharklet' ? 0.42 : 0.42, Math.pow(t, 0.8)),
        tc: lerp(0.1, 0.08, t), twist: 0,
        span: new THREE.Vector3(0, Math.sin(ang) + 0.001, Math.cos(ang))
      });
    }
  }
  const wingletGeo = loft(wlStations, { foil: wingFoil, capEnd: true });
  const wingMat = mats.wing;
  const wingletMat = w.winglet === 'raked' ? mats.wing : mats.accent;
  for (const g of [wingGeo, mirrorZ(wingGeo)]) group.add(new THREE.Mesh(g, wingMat));
  for (const g of [wingletGeo, mirrorZ(wingletGeo)]) group.add(new THREE.Mesh(g, wingletMat));

  // flap-track fairings
  const canoe = new THREE.SphereGeometry(1, 16, 8);
  [0.3, 0.5, 0.7].forEach(f => {
    const z = R + f * (zt - R);
    const c = chordAt(z);
    const geoF = canoe.clone();
    geoF.scale(c * 0.3, 0.16 * (D / 6) + 0.06, 0.12 * (D / 6) + 0.05);
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(geoF, mats.wingDark);
      m.position.set(leX(z) - c * 0.98, yAt(z) - 0.035 * c, z * side);
      group.add(m);
    }
  });

  // belly / wing-root fairing
  const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mats.navy);
  fair.scale.set(w.rootChord * 0.85, R * 0.42, R * 0.98);
  fair.position.set(xr - w.rootChord * 0.45, -R * 0.66, 0);
  group.add(fair);

  /* ---------- Empennage ---------- */
  const t = geo.tail;
  const xf = L / 2 - t.finRoot * L; // fin root leading edge x
  const finBaseY = prof(t.finRoot * L).top - 0.15;
  const finTop = finBaseY + t.finHeight;
  const tanF = Math.tan(t.finSweep * deg);
  const finStations = [
    { le: new THREE.Vector3(xf + 0.6, finBaseY - 0.9, 0), chord: t.finRootChord * 1.08, tc: 0.12, span: new THREE.Vector3(0, 1, 0) },
    { le: new THREE.Vector3(xf, finBaseY, 0), chord: t.finRootChord, tc: 0.12, span: new THREE.Vector3(0, 1, 0) },
    { le: new THREE.Vector3(xf - t.finHeight * tanF, finTop, 0), chord: t.finTipChord, tc: 0.1, span: new THREE.Vector3(0, 1, 0) }
  ];
  const finBox = { maxX: xf + 0.6, minX: xf - t.finHeight * tanF - t.finTipChord - 0.3, minY: finBaseY - 0.9, maxY: finTop + 0.05 };
  finBox.minX = Math.min(finBox.minX, xf + 0.6 - t.finRootChord * 1.08 - 0.2);
  const finGeo = loft(finStations, { foil: airfoil(detail > 0.5 ? 16 : 10, 0), uvMode: 'planar', bbox: finBox });
  // planar UV is a side view; remap so x=0 is the forward-most edge
  const finMat = new THREE.MeshPhysicalMaterial({ map: finTexture(spec, finBox, detail > 0.5 ? 1024 : 512), roughness: 0.3, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  // the fin texture is drawn with x increasing aft; planar u = (maxX - x)/width already does that
  const fin = new THREE.Mesh(finGeo, finMat);
  group.add(fin);

  // dorsal fillet
  const dorsal = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.navy);
  dorsal.scale.set(t.finRootChord * 0.35, 0.9, 0.35);
  dorsal.position.set(xf - 0.2, finBaseY - 0.25, 0);
  group.add(dorsal);

  // horizontal stabiliser
  const hs = t.hstabSpan / 2;
  const tanH = Math.tan(t.hstabSweep * deg), tanHD = Math.tan(t.hstabDihedral * deg);
  let hx, hy, hz0;
  if (t.type === 'T') {
    hx = xf - t.finHeight * tanF + 0.2; hy = finTop - 0.15; hz0 = 0;
  } else {
    hx = xf - t.finRootChord * 0.3; const pp = prof(L / 2 - hx + 0.5);
    hy = pp.cy + pp.sv * 0.05; hz0 = 0;
  }
  const hStations = [0, hs].map(z => ({
    le: new THREE.Vector3(hx - z * tanH, hy + z * tanHD, z),
    chord: lerp(t.hstabRootChord, t.hstabTipChord, z / hs), tc: 0.1,
    span: new THREE.Vector3(0, tanHD, 1)
  }));
  const hGeo = loft(hStations, { foil: airfoil(detail > 0.5 ? 14 : 8, 0) });
  for (const g of [hGeo, mirrorZ(hGeo)]) group.add(new THREE.Mesh(g, mats.wing));

  /* ---------- Engines ---------- */
  const e = geo.engines;
  const fans = [];
  const engineAnchors = [];
  const exhausts = [];
  const pylonFoil = airfoil(8, 0);
  if (e.mount === 'wing') {
    e.stations.forEach(f => {
      const z = f * s;
      const c = chordAt(z);
      const yw = yAt(z);
      const front = leX(z) + e.length * 0.42;
      const cx = front - e.length * 0.5;
      const cy = yw - 0.07 * c - e.diameter * 0.5 - 0.12;
      for (const side of [1, -1]) {
        const eng = buildEngine(e.diameter, e.length, mats, detail);
        eng.group.position.set(cx, cy, z * side);
        group.add(eng.group);
        fans.push(eng.fan);
        engineAnchors.push(new THREE.Vector3(front, cy, z * side));
        exhausts.push(new THREE.Vector3(front - e.length * 1.2, cy, z * side));
      }
      const pyl = loft([
        { le: new THREE.Vector3(front - e.length * 0.2, cy + e.diameter * 0.38, z), chord: e.length * 0.95, tc: 0.13, span: new THREE.Vector3(0, 1, 0) },
        { le: new THREE.Vector3(leX(z) + 0.4, yw + 0.12 * c * 0.1, z), chord: c * 0.78, tc: 0.13, span: new THREE.Vector3(0, 1, 0) }
      ], { foil: pylonFoil, capEnd: true });
      for (const g of [pyl, mirrorZ(pyl)]) group.add(new THREE.Mesh(g, mats.wingDark));
    });
  } else {
    const xc = L / 2 - e.x * L;
    const pp = prof(e.x * L);
    const z = pp.w + e.diameter * 0.5 + 0.55;
    const cy = pp.cy + pp.sv * 0.55;
    for (const side of [1, -1]) {
      const eng = buildEngine(e.diameter, e.length, mats, detail);
      eng.group.position.set(xc, cy, z * side);
      group.add(eng.group);
      fans.push(eng.fan);
      engineAnchors.push(new THREE.Vector3(xc + e.length * 0.5, cy, z * side));
      exhausts.push(new THREE.Vector3(xc - e.length * 0.7, cy, z * side));
    }
    const pyl = loft([
      { le: new THREE.Vector3(xc + e.length * 0.18, cy, pp.w * 0.6), chord: e.length * 0.62, tc: 0.14, span: new THREE.Vector3(0, 0, 1) },
      { le: new THREE.Vector3(xc + e.length * 0.08, cy, z - e.diameter * 0.3), chord: e.length * 0.48, tc: 0.12, span: new THREE.Vector3(0, 0, 1) }
    ], { foil: pylonFoil, capEnd: true });
    for (const g of [pyl, mirrorZ(pyl)]) group.add(new THREE.Mesh(g, mats.navy));
  }

  /* ---------- Landing gear ---------- */
  const gear = new THREE.Group();
  const groundY = -R * (geo.heightScale || 1) - geo.gearHeight;
  const wheelR = D > 5 ? 0.66 : 0.56, wheelW = D > 5 ? 0.42 : 0.36;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 24);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW * 1.02, 16);
  hubGeo.rotateX(Math.PI / 2);
  const addWheel = (parent, x, y, z) => {
    const wh = new THREE.Mesh(wheelGeo, mats.tyre); wh.position.set(x, y, z); parent.add(wh);
    const hb = new THREE.Mesh(hubGeo, mats.gear); hb.position.set(x, y, z); parent.add(hb);
  };
  const strut = (parent, x, yTop, yBot, z, rad) => {
    const len = yTop - yBot;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.85, len, 12), mats.gear);
    m.position.set(x, (yTop + yBot) / 2, z); parent.add(m);
  };
  // nose gear
  const nx = L / 2 - geo.noseLen * D * 0.95;
  const ng = new THREE.Group();
  strut(ng, nx, -R * 0.6, groundY + wheelR, 0, 0.12 * (D / 4));
  addWheel(ng, nx, groundY + wheelR, wheelW * 0.65); addWheel(ng, nx, groundY + wheelR, -wheelW * 0.65);
  gear.add(ng);
  // main gear
  const mx = xr - w.rootChord * 0.78;
  const mz = D > 5 ? R * 0.95 : R * 1.05;
  for (const side of [1, -1]) {
    const mg = new THREE.Group();
    strut(mg, mx, y0, groundY + wheelR * 1.1, mz * side, 0.2 * (D / 4));
    const nb = geo.bogie || 2;
    if (nb <= 2) {
      addWheel(mg, mx, groundY + wheelR, (mz + wheelW * 0.7) * side);
      addWheel(mg, mx, groundY + wheelR, (mz - wheelW * 0.7) * side);
    } else {
      const rows = nb / 2;
      for (let i = 0; i < rows; i++) {
        const ox = (i - (rows - 1) / 2) * wheelR * 2.3;
        addWheel(mg, mx + ox, groundY + wheelR, (mz + wheelW * 0.75) * side);
        addWheel(mg, mx + ox, groundY + wheelR, (mz - wheelW * 0.75) * side);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(rows * wheelR * 2.3, 0.18, 0.22), mats.gear);
      beam.position.set(mx, groundY + wheelR, mz * side); mg.add(beam);
    }
    gear.add(mg);
  }
  gear.visible = opts.gear ?? false;
  group.add(gear);

  /* ---------- Lights ---------- */
  const lights = [];
  const addLight = (pos, color, size, kind, phase = 0) => {
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos); sp.scale.setScalar(size);
    sp.userData = { kind, phase, base: size };
    group.add(sp);
    lights.push(sp);
    return sp;
  };
  const wl = wlStations[wlStations.length - 1];
  const tipPos = side => new THREE.Vector3(wl.le.x - wl.chord * 0.1, wl.le.y + 0.05, (wl.le.z + 0.05) * side);
  const tipRoot = side => new THREE.Vector3(tip.le.x - tip.chord * 0.15, tip.le.y, (tip.le.z + 0.1) * side);
  const navSize = D * 0.55;
  addLight(tipRoot(-1), '#ff2a3a', navSize, 'nav');
  addLight(tipRoot(1), '#2dff7a', navSize, 'nav');
  addLight(tipRoot(-1), '#ffffff', navSize * 2.2, 'strobe', 0);
  addLight(tipRoot(1), '#ffffff', navSize * 2.2, 'strobe', 0);
  addLight(new THREE.Vector3(-L / 2 - 0.2, prof(L - 0.01).cy, 0), '#ffffff', navSize * 0.8, 'nav');
  addLight(new THREE.Vector3(-L / 2 - 0.2, prof(L - 0.01).cy, 0), '#ffffff', navSize * 1.8, 'strobe', 0.12);
  addLight(new THREE.Vector3(xr - w.rootChord * 0.3, R * (geo.heightScale || 1) + 0.15, 0), '#ff2030', navSize * 1.3, 'beacon', 0);
  addLight(new THREE.Vector3(xr + 2, -R * (geo.heightScale || 1) - 0.2, 0), '#ff2030', navSize * 1.3, 'beacon', 0.5);
  void tipPos;

  /* ---------- Anchors (for hotspots / cameras) ---------- */
  const anchors = {
    cockpit: new THREE.Vector3(L / 2 - geo.noseLen * D * 0.42, R * 0.62, R * 0.5),
    cabin: new THREE.Vector3(L * 0.08, R * 0.25, R * 0.98),
    wing: new THREE.Vector3(leX(s * 0.62) - chordAt(s * 0.62) * 0.45, yAt(s * 0.62) + 0.2, s * 0.62),
    winglet: new THREE.Vector3(wl.le.x - wl.chord * 0.5, wl.le.y - (w.winglet === 'raked' ? 0 : 0.6), wl.le.z),
    engine: engineAnchors[0].clone(),
    fin: new THREE.Vector3(xf - t.finHeight * 0.55 * tanF - t.finRootChord * 0.4, finBaseY + t.finHeight * 0.55, 0.3),
    tail: new THREE.Vector3(-L / 2 + geo.tailLen * D * 0.55, 0, R * 0.7)
  };
  const anchorNormals = {
    cockpit: new THREE.Vector3(0.6, 0.6, 0.5).normalize(), cabin: new THREE.Vector3(0, 0.2, 1).normalize(),
    wing: new THREE.Vector3(0, 1, 0.1).normalize(), winglet: new THREE.Vector3(0, 0.2, 1).normalize(),
    engine: new THREE.Vector3(1, 0, 0.3).normalize(), fin: new THREE.Vector3(0, 0.2, 1).normalize(),
    tail: new THREE.Vector3(-0.3, 0.2, 1).normalize()
  };

  // bounding info
  const box = new THREE.Box3().setFromObject(group);
  const dims = { length: L, span: w.span, groundY, box, height: finTop - groundY };

  // all materials (for x-ray mode)
  const meshes = [];
  group.traverse(o => { if (o.isMesh || o.isInstancedMesh) meshes.push(o); });

  let nightLevel = 0;
  const api = {
    spec, group, dims, anchors, anchorNormals, gear, fans, lights, exhausts, materials: mats, finMaterial: finMat,
    fanSpeed: 1,
    update(time, dt) {
      for (const f of fans) f.rotation.x -= dt * 18 * api.fanSpeed;
      for (const l of lights) {
        const u = l.userData;
        let k = 1;
        if (u.kind === 'strobe') {
          const ph = ((time + u.phase) % 1.25) / 1.25;
          k = (ph < 0.04 || (ph > 0.1 && ph < 0.14)) ? 1 : 0;
        } else if (u.kind === 'beacon') {
          const ph = ((time + u.phase) % 1.1) / 1.1;
          k = Math.max(0, Math.sin(ph * Math.PI * 2)) ** 3;
        }
        const vis = u.kind === 'nav' ? 0.55 + 0.45 * nightLevel : 0.6 + 0.4 * nightLevel;
        l.material.opacity = k * vis * api.lightLevel;
        l.scale.setScalar(u.base * (0.6 + 0.4 * k));
      }
    },
    lightLevel: opts.lights ?? 1,
    setNight(v) {
      nightLevel = v;
      mats.fuselage.emissiveIntensity = v * 1.6;
      if (!finMat.emissiveMap) { finMat.emissiveMap = finMat.map; finMat.emissive = new THREE.Color('#ffffff'); finMat.needsUpdate = true; }
      finMat.emissiveIntensity = v * 0.35;
    },
    setGear(v) { gear.visible = v; },
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
      lights.forEach(l => l.visible = !on);
    },
    dispose() {
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      const seen = new Set();
      Object.values(mats).concat([finMat]).forEach(m => {
        if (seen.has(m)) return; seen.add(m);
        ['map', 'emissiveMap'].forEach(k => m[k] && m[k].dispose());
        m.dispose();
      });
      if (api.xray) api.xray.mat.dispose();
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
