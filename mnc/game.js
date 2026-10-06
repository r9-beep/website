// MNC Simulator — map rendering, UI panels and input.
import { COUNTRIES } from './world.js';
import * as Sea from './sea.js';
import * as G from './sim.js';
import { GOODS, GOOD_IDS, EQUIPMENT, COMMISSION, SECTORS, REGIONS, CITIES, CITY, RESEARCH, RESEARCH_BY, VEHICLES, RIVALS, COLORS, STORE_CAP } from './data.js';

const { W, money } = G;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Math.round(n).toLocaleString('en-GB');
const pct = n => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;
const SPEEDS = [0, 0.5, 1, 2, 4];
const SPEED_LABEL = ['❚❚', '1×', '2×', '4×', '8×'];
const KIND_ICON = { ship: '🚢', plane: '✈️' };
const rivalColor = id => (id === 'P' ? W.S.color : RIVALS.find(r => r.id === id)?.color || '#888');
const dateStr = d => G.dateOf(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ---------- Runtime state ----------
const R = {
  sel: null, tab: null, dirty: true, hover: null, fly: null, ghosts: [], ghostQueue: [],
  tint: new Map(), modal: null, mkGood: 'crude', codex: 'oil', plantSector: 'all', panelHold: false,
  lastUI: 0, lastHUD: 0, lastSave: 0, paused: false
};

// ---------- Map geometry ----------
const countries = COUNTRIES.map(c => {
  const p = new Path2D();
  for (const ring of c.r) {
    const a = ring.split(',').map(Number);
    let x = 0, y = 0;
    for (let k = 0; k < a.length; k += 2) {
      x += a[k]; y += a[k + 1];
      k ? p.lineTo(x / 20, -y / 20) : p.moveTo(x / 20, -y / 20);
    }
    p.closePath();
  }
  return { name: c.n, path: p };
});

const cv = $('#map'), cx = cv.getContext('2d');
const base = document.createElement('canvas'), bx = base.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
const view = { lon: 30, lat: 22, s: 4 };
const minScale = () => Math.max(VH / 150, VW / 720, 1.2);

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = innerWidth; VH = innerHeight;
  for (const c of [cv, base]) { c.width = Math.round(VW * DPR); c.height = Math.round(VH * DPR); }
  cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  clampView(); R.dirty = true;
}
function clampView() {
  view.s = Math.min(90, Math.max(minScale(), view.s));
  const half = VH / 2 / view.s, top = 84, bot = -62;
  view.lat = top - bot < half * 2 ? (top + bot) / 2 : Math.min(top - half, Math.max(bot + half, view.lat));
  view.lon = ((view.lon + 180) % 360 + 360) % 360 - 180;
}
const sx = lon => (lon - view.lon) * view.s + VW / 2;
const sy = lat => (view.lat - lat) * view.s + VH / 2;
const lonAt = x => view.lon + (x - VW / 2) / view.s;
const latAt = y => view.lat - (y - VH / 2) / view.s;
function copiesX(lon, pad = 60) {
  const ww = 360 * view.s, out = [];
  let x = sx(lon);
  x = ((x + pad) % ww + ww) % ww - pad;
  for (; x < VW + pad; x += ww) out.push(x);
  return out;
}
function kRange(lo, hi) {
  const L = lonAt(0), Rr = lonAt(VW);
  return [Math.ceil((L - hi) / 360), Math.floor((Rr - lo) / 360)];
}

// ---------- Base layer (ocean, graticule, countries) ----------
function computeTint() {
  R.tint.clear();
  const S = W.S; if (!S) return;
  const score = new Map();
  const bump = (country, owner, w) => {
    if (!score.has(country)) score.set(country, {});
    const o = score.get(country); o[owner] = (o[owner] || 0) + w;
  };
  for (const c of CITIES) {
    if (S.sites[c.id]) bump(c.country, 'P', 1.5);
    for (const d of S.deps[c.id]) for (const s of d.slots) if (s.o) bump(c.country, s.o, s.lvl);
  }
  for (const [country, o] of score) {
    const best = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    R.tint.set(country, { color: rivalColor(best[0]), mine: best[0] === 'P' || !!o.P });
  }
}
function drawBase() {
  const s = view.s;
  bx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = bx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#0a1724'); g.addColorStop(1, '#07111b');
  bx.fillStyle = g; bx.fillRect(0, 0, VW, VH);
  // Graticule.
  const step = s > 14 ? 5 : s > 6 ? 10 : 30;
  bx.strokeStyle = '#11233a'; bx.lineWidth = 1; bx.beginPath();
  for (let lon = Math.floor(lonAt(0) / step) * step; lon <= lonAt(VW); lon += step) { const x = Math.round(sx(lon)) + 0.5; bx.moveTo(x, 0); bx.lineTo(x, VH); }
  for (let lat = -90; lat <= 90; lat += step) { const y = Math.round(sy(lat)) + 0.5; bx.moveTo(0, y); bx.lineTo(VW, y); }
  bx.stroke();
  bx.strokeStyle = '#18304b'; bx.beginPath(); const ey = Math.round(sy(0)) + 0.5; bx.moveTo(0, ey); bx.lineTo(VW, ey); bx.stroke();
  // Countries, once per visible world copy.
  const [k0, k1] = kRange(-180, 180);
  for (let k = k0; k <= k1; k++) {
    bx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (VW / 2 + (k * 360 - view.lon) * s), DPR * (VH / 2 + view.lat * s));
    for (const c of countries) {
      bx.fillStyle = c.name === 'Antarctica' ? '#16222f' : '#1a2a3b';
      bx.fill(c.path);
      const t = R.tint.get(c.name);
      if (t) { bx.globalAlpha = t.mine ? 0.3 : 0.16; bx.fillStyle = t.color; bx.fill(c.path); bx.globalAlpha = 1; }
    }
    bx.lineWidth = 0.7 / s; bx.strokeStyle = '#2c4561';
    for (const c of countries) bx.stroke(c.path);
  }
  bx.setTransform(1, 0, 0, 1, 0, 0);
  // Shade channels closed by events.
  for (const [name, line] of Object.entries(Sea.CHANNELS)) {
    if (!Sea.isBlocked(name)) continue;
    bx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const [la, lo] = line[Math.floor(line.length / 2)];
    for (const x of copiesX(lo)) {
      bx.fillStyle = '#ff5f5f33'; bx.strokeStyle = '#ff5f5f'; bx.lineWidth = 1.5;
      bx.beginPath(); bx.arc(x, sy(la), Math.max(9, view.s * 1.2), 0, 7); bx.fill(); bx.stroke();
      bx.font = '600 10px Inter, sans-serif'; bx.fillStyle = '#ff8a8a'; bx.textAlign = 'center';
      bx.fillText('CLOSED', x, sy(la) - Math.max(12, view.s * 1.2) - 3);
    }
  }
}

// ---------- Dynamic layer ----------
function routeRange(r) {
  if (r.lo == null) { r.lo = Infinity; r.hi = -Infinity; for (const p of r.pts) { r.lo = Math.min(r.lo, p[0]); r.hi = Math.max(r.hi, p[0]); } }
  return kRange(r.lo, r.hi);
}
function strokeRoute(r, upto = null) {
  const [k0, k1] = routeRange(r);
  for (let k = k0; k <= k1; k++) {
    cx.beginPath();
    let first = true, dist = 0;
    for (let i = 0; i < r.pts.length; i++) {
      const [lon, lat] = r.pts[i];
      if (upto != null && r.cum[i] > upto) {
        const p = Sea.along(r, upto);
        cx.lineTo(sx(p.lon + k * 360), sy(p.lat)); break;
      }
      const x = sx(lon + k * 360), y = sy(lat);
      first ? cx.moveTo(x, y) : cx.lineTo(x, y); first = false; dist = r.cum[i];
    }
    cx.stroke();
  }
}
const hull = [[6.5, 0], [3, -2.6], [-5.5, -2.6], [-5.5, 2.6], [3, 2.6]];
const plane = [[7, 0], [3, -1.1], [0, -1.1], [-2.5, -7], [-4, -7], [-2.5, -1.1], [-5.5, -1.1], [-7, -3.4], [-8, -3.4], [-7, 0]];
const planeFull = [...plane, ...plane.slice(1, -1).reverse().map(([x, y]) => [x, -y])];
function shape(pts, x, y, a, sc, fill, stroke) {
  cx.save(); cx.translate(x, y); cx.rotate(a); cx.scale(sc, sc);
  cx.beginPath(); pts.forEach(([px, py], i) => (i ? cx.lineTo(px, py) : cx.moveTo(px, py))); cx.closePath();
  cx.fillStyle = fill; cx.fill(); cx.lineWidth = 1.2 / sc; cx.strokeStyle = stroke; cx.stroke();
  cx.restore();
}

function draw() {
  const S = W.S;
  if (R.dirty) { drawBase(); R.dirty = false; }
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.drawImage(base, 0, 0);
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!S) return;
  const sc = Math.min(1.5, Math.max(0.8, view.s / 5));

  // Player routes (deduplicated), then the selected vehicle's route on top.
  const seen = new Set();
  cx.lineWidth = 1.2; cx.setLineDash([4, 5]);
  for (const v of S.veh) {
    if (!v.a || !v.b) continue;
    const kind = VEHICLES[v.t].kind, key = kind + [v.a, v.b].sort().join();
    if (seen.has(key)) continue; seen.add(key);
    const r = G.routeFor(kind, v.a, v.b); if (!r) continue;
    cx.strokeStyle = kind === 'ship' ? S.color + '55' : S.color + '40';
    strokeRoute(r);
  }
  cx.setLineDash([]);
  const sv = R.sel?.type === 'veh' && S.veh.find(v => v.id === R.sel.id);
  if (sv && sv.a && sv.b) {
    const r = G.routeFor(VEHICLES[sv.t].kind, sv.a, sv.b);
    if (r) { cx.strokeStyle = S.color; cx.lineWidth = 2.2; strokeRoute(r); }
  }

  // Rival traffic.
  for (const gh of R.ghosts) {
    const p = Sea.along(gh.r, gh.d);
    const hdg = gh.dir > 0 ? p.hdg : p.hdg + Math.PI;
    for (const x of copiesX(p.lon)) shape(hull, x, sy(p.lat), hdg, sc * 0.75, gh.color, '#071019');
  }

  // Cities.
  drawCities();

  // Player vehicles.
  const docked = {};
  for (const v of S.veh) {
    const p = G.vehiclePos(v), V = VEHICLES[v.t];
    let ox = 0, oy = 0;
    if (!p.moving) { const key = V.kind + G.stopCity(v); const n = docked[key] = (docked[key] || 0) + 1; ox = (V.kind === 'ship' ? -1 : 1) * (6 + n * 5); oy = V.kind === 'ship' ? 8 : -8; }
    const selected = sv === v;
    for (const x of copiesX(p.lon)) {
      const y = sy(p.lat) + oy, xx = x + ox;
      if (selected) { cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(xx, y, 11 * sc, 0, 7); cx.stroke(); }
      if (V.kind === 'ship') shape(hull, xx, y, p.hdg, sc * (v.t === 'ulcv' ? 1.35 : v.t === 'bulker' ? 1.15 : 1), S.color, '#061018');
      else shape(planeFull, xx, y, p.hdg, sc * (v.t === 'heavylift' ? 1.3 : v.t === 'widebody' ? 1.15 : 0.95), '#f4f7fb', S.color);
    }
  }
}

function drawCities() {
  const S = W.S, s = view.s;
  const labels = s >= 2.4, deps = s >= 5.2;
  const occupied = [];
  const free = (x, y, w, h) => { for (const o of occupied) if (x < o[0] + o[2] && x + w > o[0] && y < o[1] + o[3] && y + h > o[1]) return false; occupied.push([x, y, w, h]); return true; };
  const order = CITIES.slice().sort((a, b) => score(b) - score(a));
  function score(c) { return (R.sel?.id === c.id ? 100 : 0) + (S.sites[c.id] ? 50 : 0) + (c.id === S.hq ? 60 : 0) + (c.hq ? 5 : 0) + c.deposits.length; }
  cx.textAlign = 'center'; cx.textBaseline = 'top';
  for (const c of order) {
    const site = S.sites[c.id], slots = [];
    for (const d of S.deps[c.id]) for (const sl of d.slots) slots.push(sl.o);
    for (const x of copiesX(c.lon)) {
      const y = sy(c.lat);
      if (y < -30 || y > VH + 30) continue;
      // Ownership ring: one arc per resource slot.
      if (slots.length) {
        const n = slots.length, gap = n > 1 ? 0.22 : 0, rr = site ? 9 : 7.5;
        cx.lineWidth = 2.6;
        slots.forEach((o, i) => {
          const a0 = -Math.PI / 2 + i * 2 * Math.PI / n + gap / 2, a1 = a0 + 2 * Math.PI / n - gap;
          cx.strokeStyle = o ? rivalColor(o) : '#3b5470';
          cx.beginPath(); cx.arc(x, y, rr, a0, a1); cx.stroke();
        });
      }
      if (c.id === S.hq) {
        cx.fillStyle = S.color; cx.strokeStyle = '#fff'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(x, y - 6); cx.lineTo(x + 6, y); cx.lineTo(x, y + 6); cx.lineTo(x - 6, y); cx.closePath(); cx.fill(); cx.stroke();
      } else {
        cx.beginPath(); cx.arc(x, y, site ? 4.5 : 3, 0, 7);
        cx.fillStyle = site ? S.color : '#c9d6e6'; cx.fill();
        if (site) { cx.strokeStyle = '#fff'; cx.lineWidth = 1.3; cx.stroke(); }
      }
      if (R.sel?.type === 'city' && R.sel.id === c.id) {
        cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; cx.setLineDash([3, 3]);
        cx.beginPath(); cx.arc(x, y, 15, 0, 7); cx.stroke(); cx.setLineDash([]);
      }
      if (!labels && !site && R.sel?.id !== c.id) continue;
      cx.font = `${site || c.id === S.hq ? 600 : 500} 11px Inter, sans-serif`;
      const w = cx.measureText(c.name).width;
      const ly = y + (slots.length ? 12 : 8);
      if (!free(x - w / 2 - 2, ly, w + 4, 14)) continue;
      cx.lineWidth = 3; cx.strokeStyle = '#07111bdd'; cx.lineJoin = 'round';
      cx.strokeText(c.name, x, ly);
      cx.fillStyle = site ? '#ffffff' : '#b9c8da';
      cx.fillText(c.name, x, ly);
      if (deps && c.deposits.length) {
        cx.font = '11px sans-serif';
        const icons = c.deposits.map(d => GOODS[d[0]].icon).join(' ');
        const iw = cx.measureText(icons).width;
        if (free(x - iw / 2, ly + 14, iw, 13)) cx.fillText(icons, x, ly + 14);
      }
    }
  }
}

// ---------- Rival ghost traffic ----------
function rebuildGhosts() {
  const S = W.S;
  const want = [];
  for (const rv of S.rivals) {
    const hq = RIVALS.find(r => r.id === rv.id).hq;
    const cities = [...new Set(G.rivalSlots(rv).map(s => s.cid))].filter(c => c !== hq && G.hasPort(c));
    for (const c of cities.slice(0, 3)) want.push({ rid: rv.id, a: c, b: hq });
  }
  const keep = R.ghosts.filter(g => want.some(w => w.rid === g.rid && w.a === g.a));
  R.ghosts = keep;
  R.ghostQueue = want.filter(w => !keep.some(g => g.rid === w.rid && g.a === w.a));
}
function pumpGhosts() {
  const job = R.ghostQueue.shift();
  if (!job) return;
  const r = G.routeFor('ship', job.a, job.b);
  if (r && r.km > 50) R.ghosts.push({ ...job, r, d: Math.random() * r.km, dir: Math.random() < 0.5 ? 1 : -1, spd: 30 * 24, color: RIVALS.find(x => x.id === job.rid).color });
}
function moveGhosts(dd) {
  for (const g of R.ghosts) {
    g.d += g.dir * g.spd * dd;
    if (g.d > g.r.km) { g.d = g.r.km; g.dir = -1; }
    if (g.d < 0) { g.d = 0; g.dir = 1; }
  }
}

// ---------- Input ----------
const pointers = new Map();
let drag = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0 };
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, moved: 99 }; }
  R.fly = null;
});
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) { hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2 && drag?.pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    zoomAt(mx, my, drag.s * d / drag.pinch / view.s);
    return;
  }
  if (!drag) return;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 4) {
    cv.classList.add('dragging');
    view.lon -= dx / view.s; view.lat += dy / view.s; clampView(); R.dirty = true;
    $('#tip').style.display = 'none';
  }
});
const endPtr = e => {
  const wasClick = drag && drag.moved <= 4 && pointers.size === 1;
  pointers.delete(e.pointerId);
  cv.classList.remove('dragging');
  if (wasClick) clickAt(e.clientX, e.clientY);
  if (!pointers.size) drag = null;
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; });
cv.addEventListener('pointerleave', () => { $('#tip').style.display = 'none'; });
cv.addEventListener('wheel', e => { e.preventDefault(); R.fly = null; zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018))); }, { passive: false });
function zoomAt(x, y, f) {
  const lo = lonAt(x), la = latAt(y);
  view.s *= f; clampView();
  view.lon = lo - (x - VW / 2) / view.s; view.lat = la + (y - VH / 2) / view.s;
  clampView(); R.dirty = true;
}
function nearest(x, y) {
  const S = W.S; if (!S) return null;
  let best = null, bd = 16;
  for (const v of S.veh) {
    const p = G.vehiclePos(v);
    if (!p.moving) continue;
    for (const vx of copiesX(p.lon)) { const d = Math.hypot(vx - x, sy(p.lat) - y); if (d < bd) { bd = d; best = { type: 'veh', id: v.id }; } }
  }
  if (best) return best;
  bd = 18;
  for (const c of CITIES) for (const cxp of copiesX(c.lon)) {
    const d = Math.hypot(cxp - x, sy(c.lat) - y);
    if (d < bd) { bd = d; best = { type: 'city', id: c.id }; }
  }
  return best;
}
function clickAt(x, y) {
  const hit = nearest(x, y);
  select(hit);
}
function hoverAt(x, y) {
  const tip = $('#tip'), hit = nearest(x, y);
  cv.style.cursor = hit ? 'pointer' : '';
  if (!hit || !W.S) { tip.style.display = 'none'; return; }
  let h = '';
  if (hit.type === 'city') {
    const c = CITY[hit.id];
    h = `<b>${esc(c.name)}</b> <span class="muted">· ${esc(REGIONS[c.region].name)}</span>`;
    for (const d of W.S.deps[c.id]) {
      const own = d.slots.map(s => `<span class="pip ${s.o ? '' : 'free'}" style="--c:${s.o ? rivalColor(s.o) : ''};display:inline-block;width:8px;height:8px;margin-left:2px"></span>`).join('');
      h += `<div>${GOODS[d.g].icon} ${GOODS[d.g].name} ${own}</div>`;
    }
    if (W.S.sites[c.id]) h += `<div class="good">Your site</div>`;
  } else {
    const v = W.S.veh.find(v => v.id === hit.id);
    h = `<b>${esc(v.name)}</b><div class="muted">${esc(CITY[v.a].name)} ⇄ ${esc(CITY[v.b]?.name || '—')}</div>`;
  }
  tip.innerHTML = h; tip.style.display = 'block';
  tip.style.left = Math.min(VW - 270, x + 14) + 'px'; tip.style.top = Math.min(VH - 120, y + 14) + 'px';
}
function select(sel, fly = false) {
  R.sel = sel;
  if (sel && fly) {
    let lon, lat;
    if (sel.type === 'city') ({ lon, lat } = CITY[sel.id]);
    else { const v = W.S.veh.find(v => v.id === sel.id); ({ lon, lat } = G.vehiclePos(v)); }
    flyTo(lon, lat, Math.max(view.s, 6));
  }
  renderPanels(true);
}
function flyTo(lon, lat, s = view.s) {
  let d = lon - view.lon; d = ((d + 180) % 360 + 360) % 360 - 180;
  R.fly = { lon: view.lon + d, lat, s, t: 0, from: { ...view } };
}
function stepFly(dt) {
  const f = R.fly; if (!f) return;
  f.t = Math.min(1, f.t + dt * 2.2);
  const e = 1 - Math.pow(1 - f.t, 3);
  view.lon = f.from.lon + (f.lon - f.from.lon) * e;
  view.lat = f.from.lat + (f.lat - f.from.lat) * e;
  view.s = f.from.s * Math.pow(f.s / f.from.s, e);
  clampView(); R.dirty = true;
  if (f.t >= 1) R.fly = null;
}

addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape') { if (R.modal && R.modal.type !== 'start' && R.modal.type !== 'end') closeModal(); else if (R.sel) select(null); else if (R.tab) setTab(null); return; }
  if (!W.S || R.modal) return;
  if (e.key === ' ') { e.preventDefault(); setSpeed(W.S.speed === 0 ? (R.lastSpeed || 2) : 0); }
  if (/^[1-4]$/.test(e.key)) setSpeed(+e.key);
  if (e.key === '+' || e.key === '=') zoomAt(VW / 2, VH / 2, 1.3);
  if (e.key === '-') zoomAt(VW / 2, VH / 2, 1 / 1.3);
});
addEventListener('resize', resize);

// ---------- HUD ----------
function buildChrome() {
  $('#speed').innerHTML = SPEED_LABEL.map((l, i) => `<button data-act="speed" data-v="${i}" title="${i ? `${SPEEDS[i]} days per second` : 'Pause (space)'}">${l}</button>`).join('');
  const tabs = [['empire', '🏢', 'Empire'], ['fleet', '🚢', 'Fleet'], ['research', '🧪', 'R&D'], ['markets', '📈', 'Markets'], ['rivals', '🏆', 'Rivals'], ['goals', '🎯', 'Goals'], ['codex', '📘', 'Codex'], ['news', '📰', 'News']];
  $('#rail').innerHTML = tabs.map(([id, i, l]) => `<button data-act="tab" data-tab="${id}" id="tab-${id}"><span class="i">${i}</span>${l}</button>`).join('');
}
function setSpeed(i) {
  if (!W.S) return;
  if (W.S.speed) R.lastSpeed = W.S.speed;
  W.S.speed = i; updateHUD();
}
function updateHUD() {
  const S = W.S; if (!S) return;
  document.documentElement.style.setProperty('--accent', S.color);
  $('#logo').textContent = S.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() || 'MNC';
  $('#coName').textContent = S.name;
  $('#coSub').textContent = `HQ ${CITY[S.hq].name}`;
  $('#hDate').textContent = dateStr(S.day);
  const cash = $('#hCash'); cash.textContent = money(S.cash); cash.className = S.cash < 0 ? 'neg' : '';
  $('#hWorth').textContent = money(G.netWorth());
  const p = G.operatingProfit(), pe = $('#hProfit'); pe.textContent = money(p); pe.className = p >= 0 ? 'pos' : 'neg';
  $('#hRank').textContent = `#${G.rank()} of ${S.rivals.length + 1}`;
  document.querySelectorAll('#speed button').forEach((b, i) => b.classList.toggle('on', i === S.speed));
  // Live world effects strip.
  const fx = S.fx.map(f => {
    const left = Math.max(0, Math.ceil(f.until - S.day));
    if (f.type === 'block') return `<span class="chip w">⛔ ${{ suez: 'Suez', panama: 'Panama', hormuz: 'Hormuz' }[f.channel]} closed · ${left}d</span>`;
    const what = f.goods ? (f.goods.length > 3 ? `${f.goods.length} goods` : f.goods.map(g => GOODS[g].icon).join('')) : 'all goods';
    const where = f.region ? REGIONS[f.region].name : 'Global';
    const lab = f.type === 'output' ? `Output ${pct(f.mult - 1)}` : f.type === 'tariff' ? `Tariff ${pct(f.mult - 1)}` : `${what} ${pct(f.mult - 1)}`;
    return `<span class="chip ${f.mult >= 1 && f.type === 'price' ? 'b' : 'w'}" title="${esc(where)}">${esc(where)}: ${lab} · ${left}d</span>`;
  }).join('');
  const bar = $('#fxbar'); if (bar.innerHTML !== fx) bar.innerHTML = fx;
  // Alert dot on Empire tab.
  $('#tab-empire')?.querySelector('.dot')?.remove();
  if (alerts().length) $('#tab-empire')?.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
  updateScale();
}
function updateScale() {
  const kmPerPx = 111.32 * Math.cos(view.lat * Math.PI / 180) / view.s;
  const target = kmPerPx * 110, mag = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map(m => m * mag).filter(v => v <= target).pop() || mag;
  $('#scale').innerHTML = `${num(nice)} km<i style="width:${nice / kmPerPx}px"></i>`;
}

// ---------- Panels ----------
function setTab(t) {
  R.tab = R.tab === t ? null : t;
  document.querySelectorAll('#rail button').forEach(b => b.classList.toggle('on', b.dataset.tab === R.tab));
  if (R.tab && innerWidth <= 900) R.sel = null;
  renderPanels(true);
}
function alerts() {
  const S = W.S, out = [];
  for (const [cid, site] of Object.entries(S.sites)) {
    const c = CITY[cid];
    if (G.storeUsed(site) > G.storeCap(site) * 0.95) out.push({ cid, t: `${c.name}: warehouse full`, k: 'warn' });
    for (const f of site.fac) if (f.miss && f.util < 0.6) out.push({ cid, t: `${c.name}: ${GOODS[f.g].family} ${f.miss === '__full' ? 'blocked — no storage' : `short of ${GOODS[f.miss].name}`}`, k: 'warn' });
  }
  for (const v of S.veh) if (v.st === 'stuck' || !v.a || !v.b) out.push({ vid: v.id, t: `${v.name}: ${v.msg || 'idle'}`, k: 'bad' });
  if (S.overdrawn) out.unshift({ t: `Overdrawn — ${45 - S.overdrawn} days to fix it`, k: 'bad' });
  return out;
}
function setHTML(el, html) {
  if (el.innerHTML === html) return;
  const pb = el.querySelector('.pb'), top = pb ? pb.scrollTop : 0;
  el.innerHTML = html;
  const nb = el.querySelector('.pb'); if (nb) nb.scrollTop = top;
}
function renderPanels(force = false) {
  const S = W.S; if (!S) return;
  const left = $('#left'), right = $('#right');
  const busy = el => R.panelHold || (el.contains(document.activeElement) && document.activeElement.matches('input, select'));
  if (R.tab) { left.hidden = false; if (force || !busy(left)) setHTML(left, LEFT[R.tab]()); } else left.hidden = true;
  let rh = null;
  if (R.sel?.type === 'city') rh = cityPanel(CITY[R.sel.id]);
  else if (R.sel?.type === 'veh') { const v = S.veh.find(v => v.id === R.sel.id); if (v) rh = vehiclePanel(v); else R.sel = null; }
  if (rh) { right.hidden = false; if (force || !busy(right)) setHTML(right, rh); } else right.hidden = true;
  if (innerWidth <= 900 && rh && R.tab) left.hidden = true;
}
for (const id of ['#left', '#right']) {
  $(id).addEventListener('pointerdown', () => { R.panelHold = true; });
}
addEventListener('pointerup', () => { setTimeout(() => { R.panelHold = false; }, 0); });

const head = (title, sub = '', close = 'close-left') => `<div class="ph"><h2>${title}${sub ? `<small>${sub}</small>` : ''}</h2><button class="x" data-act="${close}" aria-label="Close">×</button></div>`;
const goodChip = (g, q) => `<span title="${esc(GOODS[g].name)}">${GOODS[g].icon} ${q != null ? q : esc(GOODS[g].name)}</span>`;
const recipeHTML = g => `<div class="recipe">${Object.entries(GOODS[g].inputs).map(([i, q]) => goodChip(i, `${q}× ${GOODS[i].name}`)).join('')}<span>→ ${GOODS[g].out}× ${GOODS[g].name}</span></div>`;

const LEFT = {
  empire() {
    const S = W.S, t = G.ledgerTotals(), a = G.assets();
    const row = (l, k) => `<tr><td>${l}</td><td class="n ${(t[k] || 0) < 0 ? 'bad' : (t[k] || 0) > 0 ? 'good' : 'dim'}">${money(t[k] || 0)}</td></tr>`;
    let h = head('🏢 Empire', `${Object.keys(S.sites).length} sites · ${S.veh.length} vehicles · founded ${dateStr(0)}`) + '<div class="pb">';
    const al = alerts();
    if (al.length) h += `<h3>Needs attention</h3>` + al.slice(0, 8).map(x => `<div class="card click" data-act="${x.cid ? 'goto' : x.vid ? 'goto-veh' : 'noop'}" data-id="${x.cid || x.vid || ''}"><span class="${x.k}">●</span> ${esc(x.t)}</div>`).join('');
    h += `<h3>Finance</h3><div class="card"><table>
      <tr><td>Cash</td><td class="n">${money(S.cash)}</td></tr>
      <tr><td>Loan <span class="dim">@ ${(G.loanRate() * 100).toFixed(0)}% · limit ${money(G.maxLoan())}</span></td><td class="n ${S.loan ? 'warn' : ''}">${money(S.loan)}</td></tr>
      <tr><td>Buildings</td><td class="n">${money(a.buildings)}</td></tr>
      <tr><td>Stock &amp; cargo</td><td class="n">${money(a.inventory)}</td></tr>
      <tr><td>Fleet</td><td class="n">${money(a.vehicles)}</td></tr>
      <tr><td><b>Net worth</b></td><td class="n"><b>${money(G.netWorth())}</b></td></tr></table>
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sm" data-act="borrow" data-v="1000000">Borrow $1M</button><button class="btn sm" data-act="borrow" data-v="5000000">Borrow $5M</button><button class="btn sm" data-act="repay" data-v="1000000" ${S.loan ? '' : 'disabled'}>Repay $1M</button><button class="btn sm" data-act="repay" data-v="1e12" ${S.loan ? '' : 'disabled'}>Repay all</button></div></div>`;
    h += `<h3>Last 30 days</h3><div class="card"><table>${row('Sales', 'sales')}${row('Market purchases', 'purchases')}${row('Site upkeep', 'upkeep')}${row('Shipping &amp; flights', 'logistics')}${row('Research', 'research')}${row('Interest', 'interest')}${row('Grants &amp; disposals', 'other')}
      <tr><td><b>Operating profit</b></td><td class="n"><b class="${G.operatingProfit() >= 0 ? 'good' : 'bad'}">${money(G.operatingProfit())}</b></td></tr>${row('Capital spend', 'capex')}</table></div>`;
    h += `<h3>Net worth <span class="r dim">you vs rivals</span></h3><div class="card">${spark()}</div>`;
    h += `<h3>Sites</h3>`;
    for (const [cid, site] of Object.entries(S.sites)) {
      const c = CITY[cid], ext = S.deps[cid].reduce((n, d) => n + d.slots.filter(s => s.o === 'P').length, 0);
      const used = G.storeUsed(site), cap = G.storeCap(site);
      h += `<div class="card click" data-act="goto" data-id="${cid}"><div class="row"><b class="grow">${esc(c.name)}${cid === S.hq ? ' <span class="chip">HQ</span>' : ''}</b><span class="dim">${esc(REGIONS[c.region].name)}</span></div>
        <div class="muted">${ext} extractor${ext === 1 ? '' : 's'} · ${site.fac.length} plant${site.fac.length === 1 ? '' : 's'} · ${num(used)}/${num(cap)} stored</div>
        <div class="bar ${used / cap > 0.9 ? 'w' : 'g'}" style="margin-top:6px"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div></div>`;
    }
    return h + '</div>';
  },
  fleet() {
    const S = W.S;
    let h = head('🚢 Fleet', `${S.veh.filter(v => VEHICLES[v.t].kind === 'ship').length} ships · ${S.veh.filter(v => VEHICLES[v.t].kind === 'plane').length} aircraft`) + '<div class="pb">';
    h += `<button class="btn p block" data-act="buy-veh" ${Object.keys(S.sites).length < 2 ? 'disabled' : ''}>+ Buy a ship or aircraft</button>`;
    if (Object.keys(S.sites).length < 2) h += `<p class="muted">You need at least two sites to run a route. Open an office or build an extractor somewhere else first.</p>`;
    h += `<p class="dim" style="font-size:12px">Ships are cheap per tonne but slow and follow real sea lanes through Suez, Panama and the straits. Aircraft fly great circles in a day or two — perfect for chips, not for coal.</p>`;
    for (const v of S.veh) {
      const V = VEHICLES[v.t], r = v.b ? G.routeFor(V.kind, v.at === 0 ? v.a : v.b, v.at === 0 ? v.b : v.a) : null;
      const prog = v.st === 'move' && r ? v.d / r.km : 0, load = G.cargoTotal(v);
      const status = v.st === 'move' ? `En route to ${CITY[v.at === 0 ? v.b : v.a].name}` : v.st === 'stuck' ? v.msg : v.b ? `At ${CITY[G.stopCity(v)].name}${v.msg ? ' · ' + v.msg : ''}` : `Idle at ${CITY[v.a].name} — needs a route`;
      h += `<div class="card click" data-act="goto-veh" data-id="${v.id}"><div class="row"><span class="ic">${KIND_ICON[V.kind]}</span><b class="grow">${esc(v.name)} <span class="dim" style="font-weight:400">${esc(V.name)}</span></b><span class="mono dim">${num(load)}/${V.cap}</span></div>
        <div class="muted">${v.b ? `${esc(CITY[v.a].name)} ⇄ ${esc(CITY[v.b].name)}` : '—'}</div>
        <div class="${v.st === 'stuck' ? 'bad' : 'dim'}" style="font-size:12px">${esc(status)}</div>
        ${v.st === 'move' ? `<div class="bar" style="margin-top:6px"><i style="width:${prog * 100}%"></i></div>` : ''}
        ${load ? `<div class="recipe" style="margin-top:6px">${Object.entries(v.cargo).map(([g, q]) => goodChip(g, num(q))).join('')}</div>` : ''}</div>`;
    }
    return h + '</div>';
  },
  research() {
    const S = W.S, cur = S.res.cur && RESEARCH_BY[S.res.cur];
    let h = head('🧪 Research & Development', `${S.res.done.length - 1} of ${RESEARCH.length - 1} complete · speed ×${G.researchSpeed().toFixed(2)}`) + '<div class="pb">';
    if (cur) {
      const left = Math.ceil((cur.days - S.res.prog) / G.researchSpeed());
      h += `<div class="card"><div class="row"><b class="grow">${esc(cur.name)}</b><span class="mono dim">${left}d left</span></div><div class="bar g" style="margin-top:8px"><i style="width:${S.res.prog / cur.days * 100}%"></i></div></div>`;
    } else h += `<div class="card muted">Labs are idle. Pick a project below.</div>`;
    const groups = { avail: [], locked: [], done: [] };
    for (const r of RESEARCH) {
      if (r.id === 'basic') continue;
      if (G.research(r.id)) groups.done.push(r);
      else if (r.req.every(G.research)) groups.avail.push(r);
      else groups.locked.push(r);
    }
    const card = (r, state) => {
      const unl = r.unlocks.map(g => `<span>${GOODS[g].icon} ${esc(GOODS[g].name)}</span>`).concat((r.vehicles || []).map(t => `<span>${KIND_ICON[VEHICLES[t].kind]} ${esc(VEHICLES[t].name)}</span>`)).join('');
      return `<div class="card"><div class="row"><b class="grow">${state === 'done' ? '✓ ' : ''}${esc(r.name)}</b>${state === 'avail' ? `<button class="btn sm ${S.res.cur ? '' : 'p'}" data-act="research" data-id="${r.id}" ${S.res.cur || S.cash < r.cost ? 'disabled' : ''}>${money(r.cost)} · ${G.researchDays(r)}d</button>` : state === 'locked' ? `<span class="dim" style="font-size:11px">needs ${r.req.filter(x => !G.research(x)).map(x => RESEARCH_BY[x].name).join(', ')}</span>` : ''}</div>
        ${unl ? `<div class="recipe" style="margin-top:6px">${unl}</div>` : ''}${r.effect ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(r.effect)}</div>` : ''}</div>`;
    };
    if (groups.avail.length) h += `<h3>Available</h3>` + groups.avail.map(r => card(r, 'avail')).join('');
    if (groups.locked.length) h += `<h3>Locked</h3>` + groups.locked.map(r => card(r, 'locked')).join('');
    if (groups.done.length) h += `<h3>Completed</h3>` + groups.done.map(r => card(r, 'done')).join('');
    return h + '</div>';
  },
  markets() {
    const S = W.S, g = R.mkGood, Gd = GOODS[g];
    let h = head('📈 Markets', 'Regional prices move with supply — flood a market and it sags') + '<div class="pb">';
    h += `<select data-act="mk-good" style="width:100%;background:#0007;border:1px solid var(--line-2);border-radius:8px;padding:7px">${[0, 1, 2, 3, 4].map(t => `<optgroup label="Tier ${t}${t ? '' : ' · raw'}">${GOOD_IDS.filter(x => GOODS[x].tier === t).map(x => `<option value="${x}" ${x === g ? 'selected' : ''}>${GOODS[x].icon} ${GOODS[x].name}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const rows = Object.keys(REGIONS).map(r => ({ r, p: G.sellPrice(g, r) })).sort((a, b) => b.p - a.p);
    const max = rows[0].p;
    h += `<h3>${Gd.icon} ${esc(Gd.name)} <span class="r dim">base ${money(Gd.price)}</span></h3>`;
    h += rows.map((x, i) => `<div style="padding:5px 0"><div class="row"><span class="grow">${i === 0 ? '⭐ ' : ''}${esc(REGIONS[x.r].name)}</span><span class="mono">${money(x.p)}</span><span class="mono ${x.p >= Gd.price ? 'good' : 'bad'}" style="width:48px;text-align:right">${pct(x.p / Gd.price - 1)}</span></div><div class="bar ${x.p >= Gd.price ? 'g' : 'w'}"><i style="width:${x.p / max * 100}%"></i></div></div>`).join('');
    if (Gd.raw) {
      h += `<h3>Deposits</h3>`;
      for (const c of CITIES) S.deps[c.id].forEach(d => {
        if (d.g !== g) return;
        h += `<div class="card click" data-act="goto" data-id="${c.id}"><div class="row"><b class="grow">${esc(c.name)}</b><span class="dim">${d.rich}/day</span>${d.slots.map(s => `<span class="pip ${s.o ? '' : 'free'}" style="--c:${s.o ? rivalColor(s.o) : ''}"></span>`).join('')}</div></div>`;
      });
    } else {
      h += `<h3>Recipe</h3><div class="card">${recipeHTML(g)}<div class="muted" style="margin-top:6px">${esc(Gd.family)} · ${G.researchFor(g)?.name || ''}</div></div>`;
    }
    // Hottest opportunities right now.
    const hot = [];
    for (const x of GOOD_IDS) for (const r of Object.keys(REGIONS)) hot.push({ g: x, r, k: G.sellPrice(x, r) / GOODS[x].price });
    hot.sort((a, b) => b.k - a.k);
    h += `<h3>Hottest markets</h3>` + hot.slice(0, 8).map(x => `<div class="row click" data-act="mk-pick" data-g="${x.g}" style="padding:4px 0;cursor:pointer"><span class="ic">${GOODS[x.g].icon}</span><span class="grow">${esc(GOODS[x.g].name)} <span class="dim">· ${esc(REGIONS[x.r].name)}</span></span><span class="mono good">${pct(x.k - 1)}</span></div>`).join('');
    return h + '</div>';
  },
  rivals() {
    const S = W.S;
    const rows = [{ id: 'P', name: S.name, color: S.color, w: G.netWorth(), slots: Object.values(S.deps).reduce((a, ds) => a + ds.reduce((b, d) => b + d.slots.filter(s => s.o === 'P').length, 0), 0), lines: Object.values(S.sites).reduce((a, s) => a + s.fac.length, 0) }]
      .concat(S.rivals.map(rv => { const i = G.rivalInfo(rv.id); return { id: rv.id, name: i.name, color: i.color, w: G.rivalWorth(rv), slots: G.rivalSlots(rv).length, lines: rv.lines.length, hq: i.hq, tech: rv.tech, pref: i.pref }; }))
      .sort((a, b) => b.w - a.w);
    let h = head('🏆 Leaderboard', 'Net worth of every multinational in the game') + '<div class="pb">';
    const max = rows[0].w;
    h += rows.map((r, i) => `<div class="lead"><span class="mono dim">${i + 1}</span><div><div class="row"><span class="sw" style="background:${r.color}"></span><b class="grow">${esc(r.name)}${r.id === 'P' ? ' (you)' : ''}</b></div><div class="bar" style="margin-top:5px"><i style="width:${Math.max(2, r.w / max * 100)}%;background:${r.color}"></i></div><div class="dim" style="font-size:11px;margin-top:3px">${r.slots} resource sites · ${r.lines} plants${r.hq ? ` · HQ ${esc(CITY[r.hq].name)} · tech tier ${r.tech}` : ''}</div></div><span class="mono">${money(r.w)}</span></div>`).join('');
    h += `<h3>Their focus</h3>` + S.rivals.map(rv => { const i = G.rivalInfo(rv.id); return `<div class="card"><div class="row"><span class="sw" style="width:10px;height:10px;border-radius:3px;background:${i.color}"></span><b class="grow">${esc(i.name)}</b></div><div class="recipe" style="margin-top:6px">${i.pref.map(g => goodChip(g)).join('')}</div></div>`; }).join('');
    h += `<p class="dim" style="font-size:12px">Rivals claim deposits, build plants and dump output into regional markets. Every slot they take is one you can’t — unless you buy them out from the city panel.</p>`;
    return h + '</div>';
  },
  goals() {
    const S = W.S, done = G.GOALS.filter(g => S.goals[g.id] != null).length;
    let h = head('🎯 Goals', `${done} of ${G.GOALS.length} complete`) + '<div class="pb">';
    h += G.GOALS.map(g => { const d = S.goals[g.id] != null; return `<div class="goal ${d ? 'done' : ''}"><div class="ck">${d ? '✓' : ''}</div><div class="grow"><b>${esc(g.name)}</b><div class="muted">${esc(g.desc)}</div>${d ? `<div class="dim" style="font-size:11px">Done ${dateStr(S.goals[g.id])}</div>` : ''}</div><span class="mono ${d ? 'dim' : 'good'}" style="font-size:12px">${g.reward ? '+' + money(g.reward) : '🏁'}</span></div>`; }).join('');
    return h + '</div>';
  },
  codex() {
    const sec = R.codex;
    let h = head('📘 Codex', `${GOOD_IDS.length} products across ${Object.keys(SECTORS).length} industries`) + '<div class="pb">';
    h += `<div class="tabs">${Object.entries(SECTORS).map(([k, l]) => `<button data-act="codex" data-t="${k}" class="${k === sec ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const unl = G.unlockedGoods();
    for (const g of GOOD_IDS.filter(x => GOODS[x].sector === sec).sort((a, b) => GOODS[a].tier - GOODS[b].tier)) {
      const Gd = GOODS[g];
      h += `<div class="card"><div class="row"><span class="ic">${Gd.icon}</span><b class="grow">${esc(Gd.name)} <span class="dim" style="font-weight:400">${Gd.raw ? 'raw' : 'T' + Gd.tier}</span></b><span class="mono">${money(Gd.price)}</span></div>`;
      if (Gd.raw) h += `<div class="muted" style="font-size:12px;margin-top:4px">Found in: ${CITIES.filter(c => c.deposits.some(d => d[0] === g)).map(c => `<a href="#" data-act="goto" data-id="${c.id}" style="color:inherit">${esc(c.name)}</a>`).join(', ')}</div>`;
      else {
        const best = CITIES.filter(c => c.bonus[g]).map(c => `${c.name} +${Math.round((c.bonus[g] - 1) * 100)}%`);
        const usedIn = GOOD_IDS.filter(x => GOODS[x].inputs?.[g]).map(x => GOODS[x].icon).join(' ');
        h += recipeHTML(g) + `<div class="dim" style="font-size:11px;margin-top:4px">${esc(Gd.family)} · ${unl.has(g) ? '<span class="good">unlocked</span>' : `research ${esc(G.researchFor(g)?.name)}`} · ${num(G.plantRate(G.W.S.hq, g) * Gd.out)}/day at Lv1${EQUIPMENT[g] ? ` · plant needs ${Object.entries(EQUIPMENT[g]).map(([e, q]) => `${q}× ${GOODS[e].name}`).join(', ')}` : ''}${Gd.digital ? ' · digital' : ''}${COMMISSION[g] ? ` · can be commissioned as a ${esc(VEHICLES[COMMISSION[g]].name)}` : ''}</div>${best.length ? `<div class="good" style="font-size:11px">Best at: ${esc(best.join(' · '))}</div>` : ''}`;
        if (usedIn) h += `<div class="dim" style="font-size:11px">Used in: ${usedIn}</div>`;
      }
      if (Gd.raw) { const usedIn = GOOD_IDS.filter(x => GOODS[x].inputs?.[g]).map(x => GOODS[x].icon).join(' '); if (usedIn) h += `<div class="dim" style="font-size:11px">Used in: ${usedIn}</div>`; }
      h += `</div>`;
    }
    return h + '</div>';
  },
  news() {
    const S = W.S;
    let h = head('📰 Newswire', 'World events and rival moves') + '<div class="pb">';
    if (!S.news.length) h += `<p class="muted">Quiet so far.</p>`;
    h += S.news.map(n => `<div class="news"><div class="d">${dateStr(n.d)}${n.who && n.who !== 'you' && n.who !== 'event' ? ` · <span style="color:${rivalColor(n.who)}">●</span>` : n.who === 'event' ? ' · <span style="color:var(--event)">WORLD</span>' : ''}</div>${esc(n.text)}</div>`).join('');
    return h + '</div>';
  }
};

function spark() {
  const H = W.S.hist; if (H.length < 2) return '<div class="muted">Building history…</div>';
  const w = 320, h = 70, all = H.flatMap(p => [p.w, ...p.r]), max = Math.max(...all, 1), min = Math.min(0, ...all);
  const X = i => i / (H.length - 1) * w, Y = v => h - 4 - (v - min) / (max - min) * (h - 8);
  const line = (vals, color, wdt, op) => `<polyline fill="none" stroke="${color}" stroke-width="${wdt}" stroke-opacity="${op}" stroke-linejoin="round" points="${vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
  let s = `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  W.S.rivals.forEach((rv, k) => { s += line(H.map(p => p.r[k] ?? 0), rivalColor(rv.id), 1, 0.55); });
  s += line(H.map(p => p.w), W.S.color, 2.2, 1);
  return s + '</svg>';
}

// ---------- Right panel: city ----------
function cityPanel(c) {
  const S = W.S, site = S.sites[c.id], deps = S.deps[c.id];
  let h = head(`${esc(c.name)}${c.id === S.hq ? ' <span class="chip">HQ</span>' : ''}`, `${esc(c.country === 'United States of America' ? 'United States' : c.country)} · ${esc(REGIONS[c.region].name)}`, 'close-right') + '<div class="pb">';
  h += `<div class="chips"><span class="chip">Wages ×${c.wage}</span><span class="chip">Land ×${c.land}</span><span class="chip ${G.hasPort(c.id) ? '' : 'w'}">${G.hasPort(c.id) ? (c.port ? '⚓ Port via coast' : '⚓ Deep-water port') : '✈️ Air freight only'}</span>${Object.entries(c.bonus).map(([g, m]) => g === 'research' ? (c.id === S.hq ? `<span class="chip b">🧪 Research +${Math.round((m - 1) * 100)}%</span>` : '') : `<span class="chip b">${GOODS[g].icon} ${esc(GOODS[g].name)} +${Math.round((m - 1) * 100)}%</span>`).join('')}</div>`;
  if (c.note) h += `<p class="muted" style="margin:6px 0 0">${esc(c.note)}</p>`;
  if (deps.length) {
    h += `<h3>Resources</h3>`;
    deps.forEach((d, di) => {
      const Gd = GOODS[d.g];
      h += `<div class="card"><div class="row"><span class="ic">${Gd.icon}</span><b class="grow">${esc(Gd.name)}</b><span class="mono dim" title="Local sell price">${money(G.sellPrice(d.g, c.region))}</span></div>
        <div class="dim" style="font-size:12px;margin:2px 0 4px">${d.rich}/day per extractor at Lv1 · ${d.slots.length} slot${d.slots.length > 1 ? 's' : ''}${Gd.agri ? ' · farm: keep 🧪 fertiliser on site for +35% (after Agribusiness)' : ''}</div>`;
      d.slots.forEach((s, si) => {
        if (s.o === 'P') {
          const up = G.upgradeCost(G.extractorCost(c.id), s.lvl);
          h += `<div class="slotrow"><span class="pip" style="--c:${S.color}"></span><span class="grow"><b>Yours</b> · Lv${s.lvl} · ${num(d.rich * G.lvlMult(s.lvl) * (s.fert ? 1.35 : 1))}/day ${s.fert ? '<span class="good">· 🧪 fertilised</span>' : ''}${s.st === 'full' ? '<span class="warn">· storage full</span>' : ''}</span>${s.lvl < 5 ? `<button class="btn sm" data-act="up-ext" data-c="${c.id}" data-d="${di}" data-s="${si}" ${S.cash < up ? 'disabled' : ''}>Lv${s.lvl + 1} ${money(up)}</button>` : '<span class="chip">Max</span>'}<button class="btn sm ghost" data-act="sell-ext" data-c="${c.id}" data-d="${di}" data-s="${si}" title="Sell for 45% of what you invested">✕</button></div>`;
        } else if (s.o) {
          const cost = G.buyoutCost(c.id, di, si) + (site ? 0 : G.officeCost(c.id));
          h += `<div class="slotrow"><span class="pip" style="--c:${rivalColor(s.o)}"></span><span class="grow">${esc(G.rivalInfo(s.o).name)} · Lv${s.lvl}</span><button class="btn sm" data-act="buyout" data-c="${c.id}" data-d="${di}" data-s="${si}" ${S.cash < cost ? 'disabled' : ''}>Buy out ${money(cost)}</button></div>`;
        } else {
          const cost = G.extractorCost(c.id) + (site ? 0 : G.officeCost(c.id));
          h += `<div class="slotrow"><span class="pip free"></span><span class="grow muted">Unclaimed</span><button class="btn sm p" data-act="build-ext" data-c="${c.id}" data-d="${di}" ${S.cash < cost ? 'disabled' : ''}>Build ${money(cost)}</button></div>`;
        }
      });
      h += `</div>`;
    });
    if (!site) h += `<p class="dim" style="font-size:12px">Building an extractor opens an office here automatically (+${money(G.officeCost(c.id))}).</p>`;
  }
  if (site) {
    const used = G.storeUsed(site), cap = G.storeCap(site);
    h += `<h3>Warehouse <span class="r mono">${num(used)} / ${num(cap)}</span></h3><div class="bar ${used / cap > 0.9 ? 'w' : 'g'}"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div>
      <div class="row" style="margin-top:6px"><span class="dim grow" style="font-size:12px">Level ${site.wh}. Extractors stop at 80% so deliveries can land.</span><button class="btn sm" data-act="up-wh" data-c="${c.id}">+${num(STORE_CAP * (G.research('warehousing') ? 2 : 1))} · ${money(G.warehouseCost(c.id, site.wh))}</button></div>`;
    h += `<h3>Plants <span class="r dim">${site.fac.length}/${G.MAX_PLANTS}</span></h3>`;
    for (const f of site.fac) {
      const Gd = GOODS[f.g], rate = G.plantRate(c.id, f.g, f.lvl) * Gd.out, up = G.upgradeCost(G.plantCostAt(f.g, c.id), f.lvl);
      const st = f.miss === '__full' ? '<span class="warn">Blocked — warehouse full</span>' : f.miss ? `<span class="warn">Short of ${GOODS[f.miss].icon} ${esc(GOODS[f.miss].name)}</span>` : f.util > 0.85 ? '<span class="good">Running</span>' : f.util > 0.05 ? '<span class="muted">Partly running</span>' : '<span class="muted">Starting up</span>';
      h += `<div class="card"><div class="row"><span class="ic">${Gd.icon}</span><div class="grow"><b>${esc(Gd.family)}</b> <span class="dim">Lv${f.lvl}</span><div class="muted" style="font-size:12px">${esc(Gd.name)} · up to ${num(rate)}/day · ${st}</div></div>
        ${f.lvl < 5 ? `<button class="btn sm" data-act="up-plant" data-c="${c.id}" data-id="${f.id}" ${S.cash < up ? 'disabled' : ''}>Lv${f.lvl + 1} ${money(up)}</button>` : '<span class="chip">Max</span>'}<button class="btn sm ghost" data-act="demolish" data-c="${c.id}" data-id="${f.id}" title="Demolish (recover 35%)">✕</button></div>
        ${recipeHTML(f.g)}<div class="bar g" style="margin-top:6px"><i style="width:${f.util * 100}%"></i></div></div>`;
    }
    h += `<button class="btn block" data-act="plant-menu" data-c="${c.id}" ${site.fac.length >= G.MAX_PLANTS ? 'disabled' : ''}>+ Build a plant</button>`;
    const goods = new Set([...Object.keys(site.inv).filter(g => site.inv[g] >= 0.5), ...Object.keys(site.sell).filter(g => site.sell[g])]);
    h += `<h3>Stock &amp; sales <span class="r"><button class="btn sm" data-act="buy-menu" data-c="${c.id}">Buy goods</button></span></h3>`;
    if (!goods.size) h += `<p class="muted">Nothing in the warehouse yet.</p>`;
    else {
      h += `<table><tr><th>Good</th><th class="n">Qty</th><th class="n">Price</th><th></th><th title="Sell automatically every day">Auto</th><th title="Never sell or ship below this">Keep</th></tr>`;
      for (const g of [...goods].sort((a, b) => (site.inv[b] || 0) * GOODS[b].price - (site.inv[a] || 0) * GOODS[a].price)) {
        const q = site.inv[g] || 0;
        h += `<tr><td title="${esc(GOODS[g].name)}${GOODS[g].digital ? ' — digital: takes no space, can’t be shipped' : ''}">${GOODS[g].icon} <span style="font-size:12px">${esc(GOODS[g].name)}${GOODS[g].digital ? ' <span class="chip">digital</span>' : ''}</span></td><td class="n">${num(q)}</td><td class="n">${money(G.sellPrice(g, c.region))}</td>
          <td>${COMMISSION[g] && q >= 1 ? `<button class="btn sm p" data-act="commission" data-c="${c.id}" data-g="${g}" title="Fit out as a ${esc(VEHICLES[COMMISSION[g]].name)} for ${money(G.commissionFee(g))}">Commission</button> ` : ''}<button class="btn sm" data-act="sell" data-c="${c.id}" data-g="${g}" ${q < 1 ? 'disabled' : ''} title="Sell everything above your keep level">Sell</button></td>
          <td><input type="checkbox" class="toggle" data-act="autosell" data-c="${c.id}" data-g="${g}" ${site.sell[g] ? 'checked' : ''} aria-label="Auto-sell ${esc(GOODS[g].name)}"></td>
          <td><input class="keep" type="number" min="0" step="50" data-act="keep" data-c="${c.id}" data-g="${g}" value="${site.keep[g] || 0}" aria-label="Keep ${esc(GOODS[g].name)}"></td></tr>`;
      }
      h += `</table><p class="dim" style="font-size:11px">Auto-sell dumps stock above “keep” into the ${esc(REGIONS[c.region].name)} market each day. Big sales push the local price down.</p>`;
    }
    const calling = S.veh.filter(v => v.a === c.id || v.b === c.id);
    if (calling.length) h += `<h3>Routes calling here</h3>` + calling.map(v => `<div class="row click" data-act="goto-veh" data-id="${v.id}" style="padding:4px 0;cursor:pointer"><span class="ic">${KIND_ICON[VEHICLES[v.t].kind]}</span><span class="grow">${esc(v.name)}</span><span class="dim">${esc(CITY[v.a === c.id ? v.b : v.a].name)}</span></div>`).join('');
  } else {
    h += `<h3>Presence</h3><div class="card"><p class="muted" style="margin:0 0 8px">You have no office here. An office gives you a warehouse, lets you build plants, trade in the ${esc(REGIONS[c.region].name)} market and run ships or aircraft here.</p><button class="btn p" data-act="open-site" data-c="${c.id}" ${S.cash < G.officeCost(c.id) ? 'disabled' : ''}>Open office · ${money(G.officeCost(c.id))}</button></div>`;
  }
  h += `<details><summary>Local market prices (${esc(REGIONS[c.region].name)})</summary><table>${GOOD_IDS.map(g => { const p = G.sellPrice(g, c.region); return `<tr><td>${GOODS[g].icon} ${esc(GOODS[g].name)}</td><td class="n">${money(p)}</td><td class="n ${p >= GOODS[g].price ? 'good' : 'bad'}">${pct(p / GOODS[g].price - 1)}</td></tr>`; }).join('')}</table></details>`;
  return h + '</div>';
}

// ---------- Right panel: vehicle ----------
function vehiclePanel(v) {
  const S = W.S, V = VEHICLES[v.t];
  let h = head(`${KIND_ICON[V.kind]} ${esc(v.name)}`, `${esc(V.name)} · ${V.cap} units · ${V.speed} km/h`, 'close-right') + '<div class="pb">';
  if (!v.b) return h + `<p class="muted">${v.comm ? `Freshly commissioned from your own ${esc(GOODS[v.comm].name)}. ` : ''}Idle at ${esc(CITY[v.a].name)} with no route.</p><div class="row"><button class="btn p" data-act="edit-route" data-id="${v.id}">Set route</button><button class="btn" data-act="sell-veh" data-id="${v.id}">Sell · ${money(G.resaleValue(v))}</button></div></div>`;
  const from = v.at === 0 ? v.a : v.b, to = v.at === 0 ? v.b : v.a;
  const r = G.routeFor(V.kind, from, to), est = G.tripEstimate(v.t, v.a, v.b);
  if (v.st === 'move' && r) {
    const left = (r.km - v.d) / (V.speed * 24);
    h += `<div class="card"><div class="row"><span class="grow">${esc(CITY[from].name)} → <b>${esc(CITY[to].name)}</b></span><span class="mono dim">${left.toFixed(1)}d</span></div><div class="bar" style="margin-top:8px"><i style="width:${v.d / r.km * 100}%"></i></div><div class="dim mono" style="font-size:11px;margin-top:4px">${num(v.d)} / ${num(r.km)} km</div></div>`;
  } else {
    h += `<div class="card ${v.st === 'stuck' ? 'bad' : ''}">${v.st === 'stuck' ? '⛔ ' : '⚓ '}At ${esc(CITY[G.stopCity(v)].name)}${v.msg ? ` — ${esc(v.msg)}` : ''}</div>`;
  }
  const cargo = Object.entries(v.cargo);
  h += `<h3>Cargo <span class="r mono">${num(G.cargoTotal(v))} / ${V.cap}</span></h3>${cargo.length ? `<div class="recipe">${cargo.map(([g, q]) => goodChip(g, `${num(q)} ${GOODS[g].name}`)).join('')}</div>` : '<p class="muted">Empty</p>'}`;
  h += `<h3>Route</h3><div class="card"><div class="row"><b class="grow">${esc(CITY[v.a].name)}</b><span class="dim">loads</span></div><div class="recipe" style="margin:4px 0 10px">${v.la.length ? v.la.map(g => goodChip(g)).join('') : '<span>nothing</span>'}</div>
    <div class="row"><b class="grow">${esc(CITY[v.b].name)}</b><span class="dim">loads</span></div><div class="recipe" style="margin-top:4px">${v.lb.length ? v.lb.map(g => goodChip(g)).join('') : '<span>nothing</span>'}</div>
    ${est ? `<div class="dim" style="font-size:12px;margin-top:10px">${num(est.km)} km each way · ${est.days.toFixed(1)} days · fuel ${money(est.fuel)} per leg · ${v.full ? 'waits for a full load (max 12 days)' : 'leaves with whatever is ready'}</div>` : '<div class="bad" style="margin-top:8px">No route available right now.</div>'}</div>`;
  h += `<div class="row" style="margin-top:10px"><button class="btn p" data-act="edit-route" data-id="${v.id}">Edit route</button><button class="btn" data-act="sell-veh" data-id="${v.id}">Sell · ${money(G.resaleValue(v))}</button><span class="grow"></span><span class="dim">${v.trips} legs run</span></div>`;
  h += `<p class="dim" style="font-size:12px">Running cost ${money(V.upkeep)}/day plus ${money(V.fuel)}/km in fuel.</p>`;
  return h + '</div>';
}

// ---------- Modals ----------
function openModal(m, html) { R.modal = m; $('#mc').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { R.modal = null; $('#modal').hidden = true; $('#mc').innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' && R.modal && !['start', 'end'].includes(R.modal.type)) closeModal(); });

function startModal() {
  const info = G.saveInfo();
  const hqs = CITIES.filter(c => c.hq);
  const st = { color: COLORS[0], hq: 'london', diff: 'tycoon' };
  const render = () => {
    openModal({ type: 'start' }, `
      <h1>MNC Simulator</h1>
      <p class="sub">Found a company, claim the world’s resources and turn timber, oil and sand into steel, chips, EUV machines and quantum computers — shipping it all across a to-scale world by sea and air.</p>
      ${info ? `<div class="card row"><span class="grow">Saved game: <b>${esc(info.name)}</b> · ${dateStr(info.day)}</span><button class="btn p" data-act="continue">Continue</button></div>` : ''}
      <label class="f" for="nm">Company name</label><input type="text" id="nm" maxlength="32" value="${esc(st.name || 'Albion Industries')}">
      <label class="f">Colours</label><div class="swatches">${COLORS.map(c => `<button data-act="st-color" data-v="${c}" class="${c === st.color ? 'on' : ''}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
      <label class="f">Headquarters</label><div class="opts">${hqs.map(c => `<button class="opt ${c.id === st.hq ? 'on' : ''}" data-act="st-hq" data-v="${c.id}"><b>${esc(c.name)}</b><small>${esc(c.note || (Object.keys(c.bonus).some(k => k !== 'research') ? Object.keys(c.bonus).filter(k => k !== 'research').map(k => GOODS[k].name).join(', ') + ' bonus' : c.deposits.map(d => GOODS[d[0]].name).join(', ')))}</small></button>`).join('')}</div>
      <label class="f">Difficulty</label><div class="opts">${Object.entries(G.DIFFICULTY).map(([k, d]) => `<button class="opt ${k === st.diff ? 'on' : ''}" data-act="st-diff" data-v="${k}"><b>${d.label}</b><small>${d.blurb}</small></button>`).join('')}</div>
      <details><summary>How to play</summary>${howTo()}</details>
      <div class="acts"><a class="btn ghost" href="../">← BAC website</a><button class="btn p" data-act="begin">Found company →</button></div>`);
  };
  R.start = st; R.startRender = render;
  render();
}
function howTo() {
  return `<ol class="how">
    <li><b>Claim resources.</b> Click a city on the map. The coloured ring around it shows its resource slots — grey is free. Build an extractor to start producing.</li>
    <li><b>Sell or process.</b> Toggle auto-sell on stock, or build a plant to turn raw goods into something worth more (iron ore + coal → steel → beams…).</li>
    <li><b>Ship it.</b> Most chains span continents. Buy a ship or aircraft in the Fleet tab and set a two-stop route with what to load at each end. Ships follow real sea lanes; canals close during events.</li>
    <li><b>Research</b> unlocks higher tiers: electronics, chips, EUV lithography, aerospace, EVs and finally quantum computers. Some plants need equipment delivered first — a chip fab needs EUV machines.</li>
    <li><b>Watch the markets.</b> Every region has its own prices. Selling a lot in one place pushes the price down; rivals do the same. Ship to where prices are high.</li>
    <li><b>Win</b> by reaching $1B net worth. Go 45 days overdrawn and the administrators take over.</li>
    <li>Drag to pan, scroll or pinch to zoom. <kbd>Space</kbd> pauses, <kbd>1</kbd>–<kbd>4</kbd> set speed.</li></ol>`;
}

function plantModal(cid) {
  const S = W.S, c = CITY[cid], site = S.sites[cid], unl = G.unlockedGoods();
  const sec = R.plantSector;
  const list = GOOD_IDS.filter(g => !GOODS[g].raw && (sec === 'all' ? true : sec === 'bonus' ? c.bonus[g] : sec === 'ready' ? unl.has(g) : GOODS[g].sector === sec)).sort((a, b) => (unl.has(b) - unl.has(a)) || GOODS[a].tier - GOODS[b].tier);
  const secs = [['all', 'All'], ['ready', 'Unlocked'], ['bonus', `★ ${c.name} bonus`], ...Object.entries(SECTORS).filter(([k]) => GOOD_IDS.some(g => !GOODS[g].raw && GOODS[g].sector === k))];
  let h = `<h1>Build a plant in ${esc(c.name)}</h1><p class="sub">Estimated profit uses today’s ${esc(REGIONS[c.region].name)} prices and assumes inputs are bought locally — your own extractors make it far better.</p>
    <div class="tabs">${secs.map(([k, l]) => `<button data-act="plant-sec" data-c="${cid}" data-v="${k}" class="${k === sec ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  if (!list.length) h += '<p class="muted">Nothing in this category.</p>';
  for (const g of list) {
    const Gd = GOODS[g], ok = unl.has(g), rate = G.plantRate(cid, g, 1), cost = G.plantCostAt(g, cid);
    const inCost = Object.entries(Gd.inputs).reduce((a, [i, q]) => a + G.sellPrice(i, c.region) * q, 0) * rate;
    const outVal = G.sellPrice(g, c.region) * Gd.out * rate, up = G.UPKEEP_T[Gd.tier] * c.wage;
    const prof = outVal - inCost - up;
    const eq = EQUIPMENT[g], eqOk = !eq || Object.entries(eq).every(([e, q]) => (site.inv[e] || 0) >= q);
    h += `<div class="plant ${ok ? '' : 'locked'}"><span class="ic">${Gd.icon}</span><div><b>${esc(Gd.family)}</b> → ${esc(Gd.name)} <span class="dim">T${Gd.tier}</span>${c.bonus[g] ? ` <span class="chip b">+${Math.round((c.bonus[g] - 1) * 100)}% here</span>` : ''}</div>
      <button class="btn sm ${ok && eqOk ? 'p' : ''}" data-act="build-plant" data-c="${cid}" data-g="${g}" ${ok && eqOk && S.cash >= cost ? '' : 'disabled'}>${ok ? money(cost) : '🔒'}</button>
      <div style="grid-column:2/4">${recipeHTML(g)}<div class="dim" style="font-size:11px;margin-top:3px">${num(rate * Gd.out)}/day · est. ${prof >= 0 ? '<span class="good">' : '<span class="bad">'}${money(prof)}/day</span>${ok ? '' : ` · needs ${esc(G.researchFor(g).name)}`}${eq ? ` · <span class="${eqOk ? 'good' : 'warn'}">requires ${Object.entries(eq).map(([e, q]) => `${q}× ${GOODS[e].name} on site`).join(', ')}</span>` : ''}</div></div></div>`;
  }
  openModal({ type: 'plant' }, h + `<div class="acts"><button class="btn" data-act="close-modal">Close</button></div>`);
  $('#mc').scrollTop = R.plantScroll || 0; R.plantScroll = 0;
}

function buyModal(cid) {
  const c = CITY[cid];
  const h = `<h1>Buy goods in ${esc(c.name)}</h1><p class="sub">Market purchases in ${esc(REGIONS[c.region].name)} carry a 25% premium and push the local price up.</p>
    <label class="f">Good</label><select id="bg">${GOOD_IDS.map(g => `<option value="${g}">${GOODS[g].icon} ${GOODS[g].name}</option>`).join('')}</select>
    <label class="f">Quantity</label><input type="number" id="bq" min="1" value="100">
    <p id="bquote" class="muted"></p>
    <div class="acts"><button class="btn" data-act="close-modal">Cancel</button><button class="btn p" data-act="do-buy" data-c="${cid}">Buy</button></div>`;
  openModal({ type: 'buy', cid }, h);
  const upd = () => { const g = $('#bg').value, q = Math.max(1, +$('#bq').value || 1); $('#bquote').innerHTML = `${num(q)} × ${GOODS[g].name} ≈ <b>${money(G.quoteBuy(g, c.region, q))}</b> · you have ${money(W.S.cash)}`; };
  $('#bg').addEventListener('change', upd); $('#bq').addEventListener('input', upd); upd();
}

function routeModal(v) {
  const S = W.S, sites = Object.keys(S.sites);
  const st = R.route = v ? { id: v.id, t: v.t, a: v.a || sites[0], b: v.b || sites[1], la: [...v.la], lb: [...v.lb], full: v.full } : { id: null, t: null, a: sites[0], b: sites[1], la: [], lb: [], full: true };
  const render = () => {
    let h = `<h1>${st.id ? 'Edit route' : 'Buy a vehicle'}</h1>`;
    if (!st.id) {
      h += `<label class="f">Vehicle</label><div class="opts">${Object.entries(VEHICLES).map(([k, V]) => { const ok = G.vehicleUnlocked(k); return `<button class="opt ${st.t === k ? 'on' : ''}" data-act="rt-type" data-v="${k}" ${ok ? '' : 'disabled style="opacity:.45"'}><b>${KIND_ICON[V.kind]} ${esc(V.name)}</b><small>${V.cap} units · ${V.speed} km/h · ${ok ? money(G.vehicleCost(k)) : '🔒 ' + RESEARCH.find(r => r.vehicles?.includes(k)).name}</small></button>`; }).join('')}</div>`;
    } else h += `<p class="sub">${esc(S.veh.find(x => x.id === st.id).name)} · ${esc(VEHICLES[st.t].name)}</p>`;
    const opt = sel => sites.map(cid => `<option value="${cid}" ${cid === sel ? 'selected' : ''}>${esc(CITY[cid].name)}${G.hasPort(cid) ? '' : ' (air only)'}</option>`).join('');
    const pickList = (cid, list, side) => {
      const site = S.sites[cid];
      const goods = GOOD_IDS.filter(g => !GOODS[g].digital).sort((x, y) => ((site.inv[y] || 0) > 0) - ((site.inv[x] || 0) > 0) || (list.includes(y) - list.includes(x)) || GOODS[x].tier - GOODS[y].tier);
      return `<div class="pick">${goods.map(g => `<label><input type="checkbox" data-act="rt-g" data-side="${side}" data-g="${g}" ${list.includes(g) ? 'checked' : ''}>${GOODS[g].icon} ${esc(GOODS[g].name)}<span class="q">${site.inv[g] ? num(site.inv[g]) : ''}</span></label>`).join('')}</div>`;
    };
    h += `<label class="f">From</label><select data-act="rt-a">${opt(st.a)}</select><label class="f">Load at ${esc(CITY[st.a]?.name || '')}</label>${st.a ? pickList(st.a, st.la, 'la') : ''}
      <label class="f">To</label><select data-act="rt-b">${opt(st.b)}</select><label class="f">Load at ${esc(CITY[st.b]?.name || '')} for the return</label>${st.b ? pickList(st.b, st.lb, 'lb') : ''}
      <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" class="toggle" data-act="rt-full" ${st.full ? 'checked' : ''}> Wait for a full load before leaving (max 12 days)</label>
      <p id="rtest" class="muted"></p>
      <div class="acts"><button class="btn" data-act="close-modal">Cancel</button><button class="btn p" data-act="rt-save" id="rtsave">${st.id ? 'Save route' : 'Buy & dispatch'}</button></div>`;
    openModal({ type: 'route' }, h);
    estimate();
  };
  const estimate = () => {
    const out = $('#rtest'), btn = $('#rtsave');
    let msg = '', ok = true;
    if (!st.t) { msg = 'Pick a vehicle.'; ok = false; }
    else if (!st.a || !st.b || st.a === st.b) { msg = 'Choose two different sites.'; ok = false; }
    else {
      const V = VEHICLES[st.t];
      if (V.kind === 'ship' && (!G.hasPort(st.a) || !G.hasPort(st.b))) { msg = '<span class="bad">One of these sites has no sea access — use an aircraft.</span>'; ok = false; }
      else {
        const e = G.tripEstimate(st.t, st.a, st.b);
        if (!e) { msg = '<span class="bad">No sea route right now — a canal or strait may be closed.</span>'; ok = false; }
        else msg = `${num(e.km)} km · ${e.days.toFixed(1)} days each way · ${money(e.fuel)} fuel per leg + ${money(V.upkeep)}/day. Carries ${V.cap} units.`;
        if (!st.id && S.cash < G.vehicleCost(st.t)) { msg += ` <span class="bad">Not enough cash.</span>`; ok = false; }
      }
    }
    out.innerHTML = msg; btn.disabled = !ok;
  };
  R.routeRender = render; R.routeEstimate = estimate;
  render();
}

function endModal(kind) {
  const S = W.S;
  openModal({ type: 'end' }, kind === 'win'
    ? `<h1>🏁 ${esc(S.name)} is a global megacorp</h1><p class="sub">You crossed $1 billion in net worth on ${dateStr(S.day)}, ranked #${G.rank()} of ${S.rivals.length + 1}. Keep playing to crush the competition, or start again.</p><div class="acts"><button class="btn" data-act="new">New game</button><button class="btn p" data-act="close-modal">Keep playing</button></div>`
    : `<h1>📉 Administration</h1><p class="sub">${esc(S.name)} spent 45 days overdrawn and the administrators have taken over on ${dateStr(S.day)}. Peak net worth isn’t everything — cash flow is.</p><div class="acts"><button class="btn p" data-act="new">Start again</button></div>`);
  G.deleteSave();
}
function menuModal() {
  openModal({ type: 'menu' }, `<h1>Menu</h1><p class="sub">${esc(W.S.name)} · ${dateStr(W.S.day)}</p>
    <div class="opts"><button class="opt" data-act="close-modal"><b>▶ Resume</b><small>Back to the map</small></button><button class="opt" data-act="save"><b>💾 Save</b><small>Stored in this browser (also autosaves monthly)</small></button><button class="opt" data-act="new"><b>✨ New game</b><small>Abandon this company</small></button><button class="opt" data-act="help"><b>❓ How to play</b><small>The basics</small></button></div>
    <div class="acts"><a class="btn ghost" href="../">← BAC website</a></div>`);
}

// ---------- Actions ----------
const after = () => { renderPanels(true); updateHUD(); };
const ACT = {
  noop() {},
  speed: d => setSpeed(+d.v),
  tab: d => setTab(d.tab),
  'close-left': () => setTab(R.tab),
  'close-right': () => select(null),
  goto: (d, el, e) => { e.preventDefault(); select({ type: 'city', id: d.id }, true); },
  'goto-veh': d => select({ type: 'veh', id: +d.id }, true),
  borrow: d => { G.borrow(+d.v); after(); },
  repay: d => { G.repay(+d.v); after(); },
  research: d => { G.startResearch(d.id); after(); },
  'mk-pick': d => { R.mkGood = d.g; after(); },
  codex: d => { R.codex = d.t; after(); },
  'build-ext': d => { G.buildExtractor(d.c, +d.d); after(); },
  'up-ext': d => { G.upgradeExtractor(d.c, +d.d, +d.s); after(); },
  'sell-ext': d => { if (confirm('Sell this extractor for 45% of what you put in?')) { G.sellExtractor(d.c, +d.d, +d.s); after(); } },
  buyout: d => { G.buyout(d.c, +d.d, +d.s); after(); },
  'open-site': d => { if (G.openSite(d.c)) toast(`🏢 Office opened in ${CITY[d.c].name}`, 'good'); after(); },
  'up-wh': d => { G.upgradeWarehouse(d.c); after(); },
  'up-plant': d => { G.upgradePlant(d.c, +d.id); after(); },
  demolish: d => { if (confirm('Demolish this plant? You recover 35% of its cost.')) { G.demolishPlant(d.c, +d.id); after(); } },
  'plant-menu': d => plantModal(d.c),
  'plant-sec': d => { R.plantSector = d.v; plantModal(d.c); },
  commission: d => { const v = G.commission(d.c, d.g); if (v) select({ type: 'veh', id: v.id }); after(); },
  'build-plant': d => { if (G.buildPlant(d.c, d.g)) closeModal(); after(); },
  'buy-menu': d => buyModal(d.c),
  'do-buy': d => { if (G.buy(d.c, $('#bg').value, Math.max(1, Math.floor(+$('#bq').value || 0)))) { toast(`Bought ${num(+$('#bq').value)} ${GOODS[$('#bg').value].name}`, 'good'); closeModal(); } after(); },
  sell: d => { const site = W.S.sites[d.c]; const v = G.sell(d.c, d.g, Math.floor((site.inv[d.g] || 0) - (site.keep[d.g] || 0))); if (v) toast(`Sold ${GOODS[d.g].name} for ${money(v)}`, 'good'); after(); },
  'buy-veh': () => routeModal(null),
  'edit-route': d => routeModal(W.S.veh.find(v => v.id === +d.id)),
  'sell-veh': d => { const v = W.S.veh.find(v => v.id === +d.id); if (v && confirm(`Sell ${v.name}? Any cargo aboard is sold at a discount.`)) { G.sellVehicle(v); select(null); after(); } },
  'rt-type': d => { R.route.t = d.v; R.routeRender(); },
  'rt-save': () => {
    const st = R.route;
    if (st.id) { G.setRoute(W.S.veh.find(v => v.id === st.id), st.a, st.b, st.la, st.lb, st.full); closeModal(); }
    else { const v = G.buyVehicle(st.t, st.a, st.b, st.la, st.lb, st.full); if (v) { closeModal(); toast(`${KIND_ICON[VEHICLES[v.t].kind]} ${v.name} dispatched: ${CITY[v.a].name} ⇄ ${CITY[v.b].name}`, 'good'); select({ type: 'veh', id: v.id }); } }
    after();
  },
  'close-modal': () => closeModal(),
  save: () => { toast(G.save() ? '💾 Game saved' : 'Could not save — storage is blocked in this browser', G.save() ? 'good' : 'bad'); closeModal(); },
  new: () => { closeModal(); startModal(); },
  help: () => openModal({ type: 'help' }, `<h1>How to play</h1>${howTo()}<div class="acts"><button class="btn p" data-act="close-modal">Got it</button></div>`),
  continue: () => { if (G.load()) { closeModal(); boot(); } else toast('Save file could not be read', 'bad'); },
  'st-color': d => { R.start.name = $('#nm').value; R.start.color = d.v; R.startRender(); },
  'st-hq': d => { R.start.name = $('#nm').value; R.start.hq = d.v; R.startRender(); },
  'st-diff': d => { R.start.name = $('#nm').value; R.start.diff = d.v; R.startRender(); },
  begin: () => {
    const name = ($('#nm').value || '').trim() || 'Albion Industries';
    Sea.setBlocked('suez', false); Sea.setBlocked('panama', false); Sea.setBlocked('hormuz', false); G.clearRoutes();
    G.newGame({ name, color: R.start.color, hq: R.start.hq, difficulty: R.start.diff });
    closeModal(); boot(true);
  }
};
const CHANGE = {
  autosell: (d, el) => { W.S.sites[d.c].sell[d.g] = el.checked; },
  keep: (d, el) => { W.S.sites[d.c].keep[d.g] = Math.max(0, +el.value || 0); },
  'mk-good': (d, el) => { R.mkGood = el.value; },
  'rt-a': (d, el) => { R.route.a = el.value; R.route.la = []; R.routeRender(); },
  'rt-b': (d, el) => { R.route.b = el.value; R.route.lb = []; R.routeRender(); },
  'rt-g': (d, el) => { const l = R.route[d.side]; const k = l.indexOf(d.g); if (el.checked && k < 0) l.push(d.g); if (!el.checked && k >= 0) l.splice(k, 1); },
  'rt-full': (d, el) => { R.route.full = el.checked; }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.matches('input, select')) return;
  if (t.disabled) return;
  ACT[t.dataset.act]?.(t.dataset, t, e);
});
document.addEventListener('change', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  CHANGE[t.dataset.act]?.(t.dataset, t, e);
  if (!R.modal) after();
});
$('#menuBtn').addEventListener('click', () => { if (W.S && !R.modal) menuModal(); });

// ---------- Toasts ----------
function toast(msg, kind = '', opts = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="grow">${esc(msg)}</span>${opts.actions || ''}`;
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  if (!opts.sticky) setTimeout(() => el.remove(), kind === 'event' ? 9000 : 5200);
  return el;
}

// ---------- Hooks ----------
W.hooks.toast = (m, k) => toast(m, k);
W.hooks.news = () => { if (R.tab === 'news') renderPanels(); };
W.hooks.goal = g => toast(`🎯 Goal complete: ${g.name}${g.reward ? ` · +${money(g.reward)}` : ''}`, 'goal');
W.hooks.end = k => { setSpeed(0); endModal(k); };
W.hooks.changed = what => { if (what === 'map') { computeTint(); R.dirty = true; } if (what === 'ghosts') rebuildGhosts(); };
W.hooks.offer = o => {
  const g = GOODS[W.S.deps[o.cid][o.di].g], rv = G.rivalInfo(o.rid);
  const el = toast(`${rv.name} offers ${money(o.amount)} for your ${g.name} operation in ${CITY[o.cid].name}.`, 'warn', { sticky: true, actions: `<button class="btn sm p">Accept</button><button class="btn sm">Decline</button>` });
  const [yes, no] = el.querySelectorAll('button');
  yes.onclick = () => { G.answerOffer(o.id, true); el.remove(); after(); };
  no.onclick = () => { G.answerOffer(o.id, false); el.remove(); };
  setTimeout(() => el.remove(), 40000);
};

// ---------- Boot & loop ----------
function boot(fresh = false) {
  const S = W.S;
  for (const f of S.fx) if (f.type === 'block') Sea.setBlocked(f.channel, true);
  computeTint(); R.ghosts = []; rebuildGhosts(); R.sel = null; R.tab = null;
  document.querySelectorAll('#rail button').forEach(b => b.classList.remove('on'));
  const hq = CITY[S.hq];
  flyTo(hq.lon, hq.lat, Math.max(minScale(), Math.min(5, VW / 300)));
  updateHUD(); renderPanels(true);
  if (fresh) {
    S.speed = 0;
    setTimeout(() => toast(`Welcome, ${S.name}. Your HQ office in ${hq.name} is open. Pick a city with free resource slots (grey ring) and build an extractor.`, 'good'), 400);
    setTimeout(() => toast('Tip: the 🎯 Goals tab pays cash grants for each milestone. Press space or ▶ to unpause.', ''), 2200);
    setTab('goals');
    select({ type: 'city', id: S.hq });
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const S = W.S;
  stepFly(dt);
  if (S && !R.modal && !S.over) {
    const dd = dt * SPEEDS[S.speed];
    if (dd > 0) { G.step(dd); moveGhosts(dd); }
    if (S.day - R.lastSave >= 30) { R.lastSave = S.day; G.save(); }
  }
  pumpGhosts();
  draw();
  if (S && now - R.lastHUD > 200) { R.lastHUD = now; updateHUD(); }
  if (S && now - R.lastUI > 500) { R.lastUI = now; renderPanels(); }
  requestAnimationFrame(frame);
}

Sea.init();
buildChrome();
resize();
view.s = minScale() * 1.1;
startModal();
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => { if (document.hidden && W.S && !W.S.over) G.save(); });
