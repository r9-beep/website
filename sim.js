// Simulation: economy, production, logistics, rivals and world events.
// Pure logic — the UI talks to it through W.S (state) and W.hooks (notifications).
import * as Sea from './sea.js';
import {
  GOODS, GOOD_IDS, depth, cyclesPerDay, BUILD_COST, UPKEEP, EQUIPMENT, OFFICE_COST, STORE_CAP,
  TIER_OUTPUT, REGIONS, CITIES, CITY, RESEARCH, RESEARCH_BY, VEHICLES, RIVALS, COMMISSION, FERTILISER_BOOST, FERTILISER_USE
} from './data.js';

export const W = { S: null, hooks: { toast() {}, news() {}, goal() {}, end() {}, offer() {}, changed() {} } };
const rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const REG = Object.keys(REGIONS);

export const DIFFICULTY = {
  startup: { label: 'Start-up', cash: 10e6, rival: 0.75, blurb: '$10M seed money, gentle rivals.' },
  tycoon: { label: 'Tycoon', cash: 6e6, rival: 1, blurb: '$6M and rivals who mean business.' },
  cutthroat: { label: 'Cut-throat', cash: 3e6, rival: 1.4, blurb: '$3M, aggressive rivals, no mercy.' }
};
export const START_DATE = Date.UTC(2027, 0, 1);
export const MAX_LEVEL = 5;
export const MAX_PLANTS = 8;
export { UPKEEP as UPKEEP_T };

export const lvlMult = l => 1 + (l - 1) * 0.9;
const lvlUpkeep = l => 1 + (l - 1) * 0.75;

// ---------- New game ----------
export function newGame({ name, color, hq, difficulty }) {
  const D = DIFFICULTY[difficulty] || DIFFICULTY.tycoon;
  const S = {
    v: 1, name, color, hq, difficulty, t: 0, day: 0, speed: 2,
    cash: D.cash, loan: 0, overdrawn: 0, over: false, won: false,
    sites: {}, deps: {}, veh: [], vehSeq: 1, facSeq: 1,
    res: { done: ['basic'], cur: null, prog: 0 },
    mkt: {}, drift: {}, fx: [], nextEvent: 45 + Math.floor(rnd() * 40),
    rivals: [], made: {}, stats: { sales: 0, peak: 0 },
    today: {}, ledger: [], hist: [], goals: {}, news: [], offers: []
  };
  for (const r of REG) { S.mkt[r] = {}; for (const g of GOOD_IDS) S.mkt[r][g] = 0; }
  for (const g of GOOD_IDS) S.drift[g] = 1;
  for (const c of CITIES) S.deps[c.id] = c.deposits.map(([g, n, rich]) => ({ g, rich, slots: Array.from({ length: n }, () => ({ o: null, lvl: 1, inv: 0 })) }));
  W.S = S;
  openSite(hq, true);
  // Rivals start with a foothold near home.
  for (const r of RIVALS) {
    const rv = { id: r.id, cash: 14e6 * D.rival, lines: [], tech: 1, next: 10 + Math.floor(rnd() * 30), invested: 0, hist: [] };
    S.rivals.push(rv);
    for (let k = 0; k < 2; k++) rivalBuyDeposit(rv, true);
  }
  S.hist.push(histPoint());
  return S;
}

// ---------- Save / load ----------
const SAVE_KEY = 'mnc-simulator-save-v1';
export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(W.S)); return true; } catch { return false; }
}
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function saveInfo() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && { name: s.name, day: s.day, color: s.color }; } catch { return null; }
}
export function load() {
  try {
    const S = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!S || S.v !== 1) return null;
    // Canal closures belong to the saved game, not whatever game was running before.
    for (const ch of Object.keys(Sea.CHANNELS)) Sea.setBlocked(ch, false);
    for (const f of S.fx) if (f.type === 'block') Sea.setBlocked(f.channel, true);
    W.S = S; routes.clear();
    return S;
  } catch { return null; }
}
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

// ---------- Helpers ----------
export const dateOf = day => new Date(START_DATE + Math.floor(day) * 864e5);
export const hqCity = () => CITY[W.S.hq];
export const research = id => W.S.res.done.includes(id);
export function unlockedGoods() {
  const s = new Set();
  for (const id of W.S.res.done) for (const g of RESEARCH_BY[id].unlocks) s.add(g);
  return s;
}
export const researchFor = g => RESEARCH.find(r => r.unlocks.includes(g));
export function vehicleUnlocked(t) {
  if (t === 'feeder' || t === 'turboprop') return true;
  return RESEARCH.some(r => r.vehicles?.includes(t) && research(r.id));
}
const hqDiscount = () => (W.S.hq === 'dubai' ? 0.8 : 1);
export const loanRate = () => (W.S.hq === 'newyork' ? 0.05 : 0.07);
export const researchSpeed = () => hqCity().bonus.research || 1;

const seaOK = {};
export function hasPort(cid) {
  if (!(cid in seaOK)) { const c = CITY[cid], p = c.port || [c.lat, c.lon]; seaOK[cid] = Sea.nearestWater(p[0], p[1], 6) >= 0; }
  return seaOK[cid];
}
export const portOf = c => c.port || [c.lat, c.lon];

// ---------- Money ----------
// Ledger categories. Trading ones make up profit; the rest are investment, financing or one-offs.
//   sales, purchases, upkeep, logistics, stock (change in stock value, non-cash) → operating profit
//   interest → below the operating line, included in profit
//   research, capex, disposal, grant, loan → shown separately, never in profit
export const LEDGER_DAYS = 30;
export const PROFIT_CATS = ['sales', 'purchases', 'upkeep', 'logistics', 'stock', 'subsidiaries'];
export function spend(a, cat) { W.S.cash -= a; W.S.today[cat] = (W.S.today[cat] || 0) - a; }
export function earn(a, cat) { W.S.cash += a; W.S.today[cat] = (W.S.today[cat] || 0) + a; }
// Totals over the last 30 completed days (fewer early in the game — see ledgerDays()).
export function ledgerTotals() {
  const t = {};
  for (const d of W.S.ledger) for (const [k, v] of Object.entries(d)) t[k] = (t[k] || 0) + v;
  return t;
}
export const ledgerDays = () => W.S.ledger.length;
export function operatingProfit(t = ledgerTotals()) {
  let p = 0;
  for (const k of PROFIT_CATS) p += t[k] || 0;
  return p;
}
// What the HUD shows: trading profit after interest, ignoring grants, research, asset sales and capex.
export const netProfit = (t = ledgerTotals()) => operatingProfit(t) + (t.interest || 0);

// ---------- Market ----------
function fxMult(type, g, region) {
  let m = 1;
  for (const f of W.S.fx) {
    if (f.type !== type) continue;
    if (f.goods && g && !f.goods.includes(g)) continue;
    if (f.region && f.region !== region) continue;
    m *= f.mult;
  }
  return m;
}
const satFactor = (sat, g) => { const D = depth(g); return sat >= 0 ? 1 / (1 + 0.012 * sat / D) : 1 + Math.min(0.6, -0.012 * sat / D); };
export const BUY_PREMIUM = 1.1;
export function price(g, region, sat = W.S.mkt[region][g]) {
  return GOODS[g].price * (REGIONS[region].mult[g] || 1) * W.S.drift[g] * fxMult('price', g, region) * satFactor(sat, g);
}
export const sellPrice = (g, region) => price(g, region) * fxMult('tariff', g, region);
export const buyPrice = (g, region) => price(g, region) * BUY_PREMIUM;
// Average price across a trade of q units, integrated over the price curve (Simpson's rule).
function avgPrice(g, region, s0, s1) {
  if (Math.abs(s1 - s0) < 1e-9) return price(g, region, s0);
  const n = 8, h = (s1 - s0) / n;
  let sum = price(g, region, s0) + price(g, region, s1);
  for (let k = 1; k < n; k++) sum += price(g, region, s0 + k * h) * (k % 2 ? 4 : 2);
  return sum * h / 3 / (s1 - s0);
}
export function quoteSell(g, region, q) {
  const s0 = W.S.mkt[region][g];
  return q * avgPrice(g, region, s0, s0 + q) * fxMult('tariff', g, region);
}
export function quoteBuy(g, region, q) {
  const s0 = W.S.mkt[region][g];
  return q * avgPrice(g, region, s0, s0 - q) * BUY_PREMIUM;
}
// Where a market settles if you keep selling q units a day into it (saturation decays 4% a day).
export const steadyPrice = (g, region, perDay) => price(g, region, Math.max(0, W.S.mkt[region][g]) + perDay / 0.04) * fxMult('tariff', g, region);
export const steadyBuyPrice = (g, region, perDay) => price(g, region, Math.min(0, W.S.mkt[region][g]) - perDay / 0.04) * BUY_PREMIUM;

// ---------- Sites & storage ----------
export const storeCap = site => STORE_CAP * site.wh * (research('warehousing') ? 2 : 1);
export const storeUsed = site => { let u = 0; for (const [g, v] of Object.entries(site.inv)) if (!GOODS[g].digital) u += v; return u; };
const add = (site, g, q) => {
  site.inv[g] = (site.inv[g] || 0) + q;
  if (site.inv[g] < 1e-6) delete site.inv[g];
  // Remember every good a site has held so its stock table keeps a stable set of rows.
  if (q > 0) markSeen(site, g);
};
const markSeen = (site, g) => { site.seen ||= []; if (!site.seen.includes(g)) site.seen.push(g); };
// Book value of goods, used for net worth and the change-in-stock line of profit.
export const BOOK_STOCK = 0.7, BOOK_BUILDINGS = 0.8, BOOK_VEHICLES = 0.7, BOOK_RESEARCH = 0.5;
const bookValue = (g, q) => GOODS[g].price * q * BOOK_STOCK;
// Goods leaving stock into fixed assets (plant equipment, commissioned ships) are a transfer, not a loss.
const transferToAssets = v => { if (W.S.lastInv != null) W.S.lastInv -= v; };
export const officeCost = cid => Math.round(OFFICE_COST * CITY[cid].land * hqDiscount());

export function openSite(cid, free = false) {
  const S = W.S;
  if (S.sites[cid]) return true;
  if (!free) { const c = officeCost(cid); if (S.cash < c) return fail('Not enough cash to open an office.'); spend(c, 'capex'); }
  S.sites[cid] = { inv: {}, sell: {}, keep: {}, fac: [], wh: 1, inv$: free ? 0 : officeCost(cid), opened: S.day };
  W.hooks.changed('map');
  return true;
}
function fail(msg) { W.hooks.toast(msg, 'bad'); return false; }

export const extractorCost = cid => Math.round(BUILD_COST[0] * CITY[cid].land);
export const upgradeCost = (base, lvl) => Math.round(base * 0.6 * lvl);
export function buildExtractor(cid, di) {
  const S = W.S, dep = S.deps[cid][di], slot = dep.slots.find(s => !s.o);
  if (!slot) return fail('Every slot here is taken — try a buy-out.');
  const cost = extractorCost(cid) + (S.sites[cid] ? 0 : officeCost(cid));
  if (S.cash < cost) return fail(`You need ${money(cost)} for that.`);
  if (!S.sites[cid]) openSite(cid);
  spend(extractorCost(cid), 'capex');
  Object.assign(slot, { o: 'P', lvl: 1, inv: extractorCost(cid), pl: 0 });
  // New output is auto-sold by default unless a plant here uses it.
  const site = S.sites[cid];
  if (site.sell[dep.g] == null) site.sell[dep.g] = !site.fac.some(f => GOODS[f.g].inputs[dep.g]);
  markSeen(site, dep.g);
  W.hooks.toast(`${GOODS[dep.g].icon} New ${GOODS[dep.g].name} extractor in ${CITY[cid].name}`, 'good');
  W.hooks.changed('map');
  return true;
}
export function upgradeExtractor(cid, di, si) {
  const slot = W.S.deps[cid][di].slots[si];
  if (slot.o !== 'P' || slot.lvl >= MAX_LEVEL) return false;
  const cost = upgradeCost(extractorCost(cid), slot.lvl);
  if (W.S.cash < cost) return fail(`Upgrade costs ${money(cost)}.`);
  spend(cost, 'capex'); slot.lvl++; slot.inv += cost;
  return true;
}
export function buyoutCost(cid, di, si) {
  const slot = W.S.deps[cid][di].slots[si];
  return Math.round(extractorCost(cid) * lvlMult(slot.lvl) * 2.6);
}
export function buyout(cid, di, si) {
  const S = W.S, slot = S.deps[cid][di].slots[si], rv = S.rivals.find(r => r.id === slot.o);
  if (!rv) return false;
  const cost = buyoutCost(cid, di, si) + (S.sites[cid] ? 0 : officeCost(cid));
  if (S.cash < cost) return fail(`The buy-out needs ${money(cost)}.`);
  if (!S.sites[cid]) openSite(cid);
  const c = buyoutCost(cid, di, si);
  spend(c, 'capex'); rv.cash += c; rv.invested -= slot.inv || 0;
  Object.assign(slot, { o: 'P', inv: c, pl: 0 });
  const site = S.sites[cid], g = S.deps[cid][di].g;
  if (site.sell[g] == null) site.sell[g] = !site.fac.some(f => GOODS[f.g].inputs[g]);
  news(`${S.name} buys out ${rivalName(rv)}'s ${GOODS[S.deps[cid][di].g].name} operation in ${CITY[cid].name}.`);
  W.hooks.changed('map'); W.hooks.changed('ghosts');
  return true;
}
export function sellExtractor(cid, di, si) {
  const slot = W.S.deps[cid][di].slots[si];
  if (slot.o !== 'P') return;
  earn(Math.round(slot.inv * 0.45), 'disposal');
  Object.assign(slot, { o: null, lvl: 1, inv: 0 });
  W.hooks.changed('map');
}

export const plantCost = g => BUILD_COST[GOODS[g].tier];
export const plantCostAt = (g, cid) => Math.round(plantCost(g) * CITY[cid].land);
export function buildPlant(cid, g) {
  const S = W.S, site = S.sites[cid];
  if (!site) return fail('Open an office here first.');
  if (site.fac.length >= MAX_PLANTS) return fail(`A site holds at most ${MAX_PLANTS} plants.`);
  if (!unlockedGoods().has(g)) return fail('Research this first.');
  const cost = plantCostAt(g, cid);
  if (S.cash < cost) return fail(`That plant costs ${money(cost)}.`);
  const eq = EQUIPMENT[g] || {};
  for (const [e, q] of Object.entries(eq)) if ((site.inv[e] || 0) < q) return fail(`Needs ${q}× ${GOODS[e].name} delivered to ${CITY[cid].name} first.`);
  for (const [e, q] of Object.entries(eq)) { add(site, e, -q); transferToAssets(bookValue(e, q)); }
  const eqVal = Object.entries(eq).reduce((a, [e, q]) => a + GOODS[e].price * q, 0);
  spend(cost, 'capex');
  site.fac.push({ id: S.facSeq++, g, lvl: 1, acc: 0, util: 0, miss: null, inv: cost + eqVal, pl: 0 });
  // A plant's inputs stay at the site instead of being auto-sold; its output is auto-sold unless you say otherwise.
  for (const i of Object.keys(GOODS[g].inputs)) { site.sell[i] = false; markSeen(site, i); }
  markSeen(site, g);
  if (site.sell[g] == null && !Object.values(site.fac).some(f => f.g !== g && GOODS[f.g].inputs[g])) site.sell[g] = true;
  W.hooks.toast(`${GOODS[g].icon} ${GOODS[g].family} for ${GOODS[g].name} opens in ${CITY[cid].name}`, 'good');
  return true;
}
export function upgradePlant(cid, id) {
  const site = W.S.sites[cid], f = site.fac.find(x => x.id === id);
  if (!f || f.lvl >= MAX_LEVEL) return false;
  const cost = upgradeCost(plantCostAt(f.g, cid), f.lvl);
  if (W.S.cash < cost) return fail(`Upgrade costs ${money(cost)}.`);
  spend(cost, 'capex'); f.lvl++; f.inv += cost;
  return true;
}
export function demolishPlant(cid, id) {
  const site = W.S.sites[cid], k = site.fac.findIndex(x => x.id === id);
  if (k < 0) return;
  earn(Math.round(site.fac[k].inv * 0.35), 'disposal');
  site.fac.splice(k, 1);
}
export const warehouseCost = (cid, wh) => Math.round(220000 * wh * CITY[cid].land);
export function upgradeWarehouse(cid) {
  const site = W.S.sites[cid], cost = warehouseCost(cid, site.wh);
  if (W.S.cash < cost) return fail(`Warehouse expansion costs ${money(cost)}.`);
  spend(cost, 'capex'); site.wh++; site.inv$ += cost;
  return true;
}

export function plantRate(cid, g, lvl = 1) {
  const c = CITY[cid];
  return cyclesPerDay(g) * lvlMult(lvl) * (c.bonus[g] || 1) * (research('automation') ? 1.15 : 1);
}

// Sell into a region's market (with price impact). Used by the Sell button, auto-sell and vehicle disposals.
function sellRaw(region, g, q) {
  const v = quoteSell(g, region, q);
  W.S.mkt[region][g] += q;
  earn(v, 'sales'); W.S.stats.sales += v;
  return v;
}
export function sell(cid, g, q) {
  const site = W.S.sites[cid];
  q = Math.min(q, site.inv[g] || 0);
  if (q < 1e-6) return 0;
  add(site, g, -q);
  return sellRaw(CITY[cid].region, g, q);
}
// Most you can buy right now: limited by free warehouse space (digital goods need none).
export const buyRoom = (cid, g) => GOODS[g].digital ? Infinity : Math.max(0, Math.floor(storeCap(W.S.sites[cid]) - storeUsed(W.S.sites[cid])));
export function buy(cid, g, q) {
  const S = W.S, site = S.sites[cid], c = CITY[cid];
  q = Math.min(q, buyRoom(cid, g));
  if (q <= 0) return fail('Warehouse is full.');
  const cost = quoteBuy(g, c.region, q);
  if (S.cash < cost) return fail(`That costs ${money(cost)}.`);
  S.mkt[c.region][g] -= q;
  add(site, g, q);
  spend(cost, 'purchases');
  return q;
}

// ---------- Finance ----------
// Credit line based on equity, so borrowing doesn't raise its own limit.
export const maxLoan = () => Math.max(5e6, Math.round((10e6 + Math.max(0, netWorth()) * 0.4) / 1e6) * 1e6);
export function borrow(a) {
  const S = W.S; a = Math.min(a, maxLoan() - S.loan);
  if (a <= 0) return fail('The bank won’t lend you more right now.');
  S.loan += a; earn(a, 'loan');
  return true;
}
export function repay(a) {
  const S = W.S; a = Math.min(a, S.loan, Math.max(0, S.cash));
  if (a <= 0) return false;
  S.loan -= a; spend(a, 'loan');
  return true;
}
// What a vehicle cost you: purchase price, or the built ship/airliner plus its fit-out fee.
export const vehicleInvested = v => v.inv ?? (v.comm ? GOODS[v.comm].price + commissionFee(v.comm) : VEHICLES[v.t].cost);
export const researchInvested = () => {
  const S = W.S;
  return S.res.done.reduce((a, id) => a + RESEARCH_BY[id].cost, 0) + (S.res.cur ? RESEARCH_BY[S.res.cur].cost : 0);
};
export function stockValue() {
  const S = W.S; let inv = 0;
  for (const site of Object.values(S.sites)) for (const [g, q] of Object.entries(site.inv)) inv += bookValue(g, q);
  for (const x of S.veh) for (const [g, q] of Object.entries(x.cargo)) inv += bookValue(g, q);
  return inv;
}
export function assets() {
  const S = W.S; let b = 0, v = 0;
  for (const site of Object.values(S.sites)) {
    b += site.inv$ * BOOK_BUILDINGS;
    for (const f of site.fac) b += f.inv * BOOK_BUILDINGS;
  }
  for (const deps of Object.values(S.deps)) for (const d of deps) for (const s of d.slots) if (s.o === 'P') b += s.inv * BOOK_BUILDINGS;
  for (const x of S.veh) v += vehicleInvested(x) * BOOK_VEHICLES;
  for (const l of S.subs || []) b += l.inv * BOOK_BUILDINGS;
  return { buildings: b, inventory: stockValue(), vehicles: v, research: researchInvested() * BOOK_RESEARCH };
}
export function netWorth() {
  const a = assets();
  return W.S.cash - W.S.loan + a.buildings + a.inventory + a.vehicles + a.research;
}
const histPoint = () => ({ d: W.S.day, w: Math.round(netWorth()), r: Object.fromEntries(W.S.rivals.map(r => [r.id, Math.round(rivalWorth(r))])) });

// ---------- Research ----------
export const researchCost = r => r.cost;
export const researchDays = r => Math.ceil(r.days / researchSpeed());
export function startResearch(id) {
  const S = W.S, r = RESEARCH_BY[id];
  if (S.res.cur) return fail('Your labs are busy — one project at a time.');
  if (research(id) || !r.req.every(research)) return false;
  if (S.cash < r.cost) return fail(`${r.name} needs ${money(r.cost)}.`);
  spend(r.cost, 'research');
  S.res.cur = id; S.res.prog = 0;
  return true;
}

// ---------- Vehicles & routing ----------
const routes = new Map();
function reverseRoute(r) {
  const pts = r.pts.slice().reverse();
  // Keep longitudes continuous from the new start.
  const shift = Math.round(pts[0][0] / 360) * 360;
  return { pts: pts.map(([x, y]) => [x - shift, y]), cum: r.cum.map(c => r.km - c).reverse(), km: r.km };
}
export function routeFor(kind, a, b) {
  const key = `${kind}:${a}>${b}:${Sea.isBlocked('suez')}${Sea.isBlocked('panama')}${Sea.isBlocked('hormuz')}`;
  if (routes.has(key)) return routes.get(key);
  let r;
  if (a > b) { const f = routeFor(kind, b, a); r = f && reverseRoute(f); }
  else if (kind === 'plane') r = Sea.airRoute([CITY[a].lat, CITY[a].lon], [CITY[b].lat, CITY[b].lon]);
  else r = Sea.seaRoute(`${a}>${b}`, portOf(CITY[a]), portOf(CITY[b]));
  routes.set(key, r);
  return r;
}
export function clearRoutes() { routes.clear(); }

export const vehicleCost = t => Math.round(VEHICLES[t].cost * hqDiscount());
export function buyVehicle(t, a, b, la = [], lb = [], full = false) {
  const S = W.S, V = VEHICLES[t];
  if (!vehicleUnlocked(t)) return fail('Research Logistics to unlock this.');
  const cost = vehicleCost(t);
  if (S.cash < cost) return fail(`A ${V.name} costs ${money(cost)}.`);
  spend(cost, 'capex');
  const n = S.veh.filter(v => v.t === t).length + 1;
  const v = { id: S.vehSeq++, t, name: `${V.name.split(' ').pop()} ${n}`, a, b, la, lb, full, st: 'dock', at: 0, here: a, d: 0, wait: 0, unloaded: true, cargo: {}, trips: 0, msg: '', inv: cost, costD: 0, moveD: 0 };
  S.veh.push(v);
  return v;
}
// Where a docked vehicle is, and the leg a moving one is on. (Old saves only have `at`.)
export const stopCity = v => v.here ?? (v.at === 0 ? v.a : v.b);
export const legOf = v => (v.from && v.to ? [v.from, v.to] : [v.at === 0 ? v.a : v.b, v.at === 0 ? v.b : v.a]);
const loadList = v => { const h = stopCity(v); return h === v.a ? v.la : h === v.b ? v.lb : []; };
// Re-routing never teleports: a docked vehicle sails from where it is (paying fuel); a moving one finishes its leg first.
export function setRoute(v, a, b, la, lb, full) {
  if (v.st === 'move') { v.pending = { a, b, la, lb, full }; return 'pending'; }
  const here = stopCity(v);
  Object.assign(v, { a, b, la, lb, full, pending: null, here, st: 'dock', wait: 0 });
  v.at = here === b ? 1 : 0;
  return here === a || here === b ? 'ok' : 'reposition';
}
export const resaleValue = v => Math.round(vehicleInvested(v) * 0.55);
export const commissionFee = g => Math.round(VEHICLES[COMMISSION[g]].cost * 0.35);
// Put a ship or airliner you built into service as part of your own fleet.
export function commission(cid, g) {
  const S = W.S, site = S.sites[cid], t = COMMISSION[g];
  if (!t || (site.inv[g] || 0) < 1) return false;
  if (VEHICLES[t].kind === 'ship' && !hasPort(cid)) return fail(`${CITY[cid].name} has no sea access to launch a ship.`);
  const fee = commissionFee(g);
  if (S.cash < fee) return fail(`Fitting out costs ${money(fee)}.`);
  add(site, g, -1); transferToAssets(bookValue(g, 1)); spend(fee, 'capex');
  const V = VEHICLES[t], n = S.veh.filter(v => v.t === t).length + 1;
  const v = { id: S.vehSeq++, t, name: `${V.name.split(' ').pop()} ${n}`, a: cid, b: null, la: [], lb: [], full: false, st: 'idle', at: 0, here: cid, d: 0, wait: 0, unloaded: true, cargo: {}, trips: 0, msg: '', comm: g, inv: GOODS[g].price + fee, costD: 0, moveD: 0 };
  S.veh.push(v);
  W.hooks.toast(`${GOODS[g].icon} ${v.name} commissioned in ${CITY[cid].name} — give it a route`, 'good');
  return v;
}
export function sellVehicle(v) {
  const S = W.S;
  earn(resaleValue(v), 'disposal');
  // Any cargo aboard is dumped on the market where the vehicle is (or the port it just left).
  const c = CITY[v.st === 'move' ? legOf(v)[0] : stopCity(v)];
  for (const [g, q] of Object.entries(v.cargo)) sellRaw(c.region, g, q * 0.8);
  S.veh = S.veh.filter(x => x !== v);
}
export const cargoTotal = v => Object.values(v.cargo).reduce((a, b) => a + b, 0);
export function tripEstimate(t, a, b) {
  const V = VEHICLES[t], r = routeFor(V.kind, a, b);
  if (!r) return null;
  const days = r.km / (V.speed * 24), fuel = r.km * V.fuel;
  // Cost per unit carried one way on a full load, counting the return leg and running costs.
  return { km: r.km, days, fuel, perUnit: (2 * fuel + V.upkeep * (2 * days + 1)) / V.cap };
}

function unload(v) {
  const site = W.S.sites[stopCity(v)];
  if (!site) return;
  const region = CITY[stopCity(v)].region;
  let free = storeCap(site) - storeUsed(site);
  for (const [g, q] of Object.entries(v.cargo)) {
    const n = GOODS[g].digital ? q : Math.min(q, Math.max(0, free));
    if (n <= 0) continue;
    add(site, g, n); free -= n;
    v.moveT = (v.moveT || 0) + n * sellPrice(g, region);
    v.cargo[g] -= n; if (v.cargo[g] < 1e-6) delete v.cargo[g];
  }
}
function loadUp(v) {
  const site = W.S.sites[stopCity(v)], list = loadList(v);
  if (!site || !list.length) return;
  let free = VEHICLES[v.t].cap - cargoTotal(v);
  for (let pass = 0; pass < 2 && free >= 1; pass++) {
    const goods = list.filter(g => !GOODS[g].digital && (site.inv[g] || 0) - (site.keep[g] || 0) >= 1);
    if (!goods.length) break;
    const share = Math.max(1, Math.floor(free / goods.length));
    for (const g of goods) {
      const n = Math.floor(Math.min(share, free, (site.inv[g] || 0) - (site.keep[g] || 0)));
      if (n <= 0) continue;
      add(site, g, -n); v.cargo[g] = (v.cargo[g] || 0) + n; free -= n;
    }
  }
}
function depart(v, from, to) {
  const V = VEHICLES[v.t], r = routeFor(V.kind, from, to);
  if (!r) { v.st = 'stuck'; v.msg = 'No sea route — a canal or strait is closed'; v.wait = 0; return; }
  spend(r.km * V.fuel, 'logistics'); v.fuelT = (v.fuelT || 0) + r.km * V.fuel;
  Object.assign(v, { st: 'move', d: 0, msg: '', from, to, here: null });
}
function updateVehicle(v, dt) {
  const V = VEHICLES[v.t];
  if (v.st === 'move') {
    const [from, to] = legOf(v), r = routeFor(V.kind, from, to);
    if (!r) { Object.assign(v, { st: 'dock', here: from, from: null, to: null }); return; }
    v.d += V.speed * 24 * dt;
    if (v.d >= r.km) {
      Object.assign(v, { st: 'dock', here: to, from: null, to: null, wait: 0, unloaded: false, d: 0 });
      v.trips++;
      if (v.pending) { const p = v.pending; v.pending = null; Object.assign(v, p); }
      v.at = v.here === v.b ? 1 : 0;
    }
    return;
  }
  if (!v.a || !v.b) { v.st = 'idle'; v.msg = 'No route assigned'; return; }
  if (v.st === 'idle') { v.st = 'dock'; v.wait = 0; }
  const here = stopCity(v);
  // Off-route (after a re-route): sail to the first stop with whatever is aboard.
  if (here !== v.a && here !== v.b) { depart(v, here, v.a); return; }
  v.wait += dt;
  if (v.wait < 0.4) return;
  if (!v.unloaded) {
    unload(v);
    v.unloaded = cargoTotal(v) < 1e-6;
    if (!v.unloaded) { v.msg = 'Waiting for warehouse space to unload'; return; }
  }
  if (!v.la.length && !v.lb.length) { v.msg = 'Nothing to load at either stop — edit the route'; return; }
  loadUp(v);
  const load = cargoTotal(v), list = loadList(v);
  // Never run an empty leg from a stop that is meant to supply cargo — wait for goods instead.
  const ready = !list.length || (load >= 1 && (!v.full || load >= V.cap - 0.5)) || v.wait >= 12;
  if (!ready) { v.msg = load < 1 ? `Waiting for cargo (${list.map(g => GOODS[g].name).join(', ')})` : `Loading — ${Math.round(load)}/${V.cap}`; return; }
  depart(v, here, here === v.a ? v.b : v.a);
}
export function vehiclePos(v) {
  const V = VEHICLES[v.t];
  if (v.st === 'move') {
    const [from, to] = legOf(v), r = routeFor(V.kind, from, to);
    if (r) return { ...Sea.along(r, v.d), moving: true, route: r, from, to };
  }
  const c = CITY[stopCity(v) || W.S.hq], p = V.kind === 'ship' ? portOf(c) : [c.lat, c.lon];
  return { lon: p[1], lat: p[0], hdg: 0, moving: false };
}

// ---------- Rivals ----------
export const rivalInfo = id => RIVALS.find(r => r.id === id);
export const rivalName = rv => rivalInfo(rv.id).name;
export function rivalWorth(rv) { return rv.cash + rv.invested * 0.8; }

// ---------- Takeovers ----------
// Shareholders want a premium over book value, and more if the rival is bigger than you.
export function takeoverPrice(rv) {
  const w = rivalWorth(rv), prem = 1.3 + Math.min(0.4, Math.max(0, w / Math.max(1, netWorth()) - 1) * 0.2);
  return Math.round(w * prem / 1e5) * 1e5;
}
export function acquireRival(id) {
  const S = W.S, k = S.rivals.findIndex(r => r.id === id);
  if (k < 0) return false;
  const rv = S.rivals[k], info = rivalInfo(id), price = takeoverPrice(rv);
  if (S.cash < price) return fail(`Taking over ${info.name} costs ${money(price)} — borrow or save up first.`);
  spend(price, 'capex');
  // Their cash comes with them.
  earn(Math.max(0, rv.cash), 'disposal');
  // Every deposit they held becomes yours; offices open where needed.
  let slots = 0;
  for (const [cid, deps] of Object.entries(S.deps)) deps.forEach(d => d.slots.forEach(sl => {
    if (sl.o !== id) return;
    if (!S.sites[cid]) openSite(cid, true);
    const site = S.sites[cid];
    Object.assign(sl, { o: 'P', pl: 0 });
    if (site.sell[d.g] == null) site.sell[d.g] = !site.fac.some(f => GOODS[f.g].inputs[d.g]);
    markSeen(site, d.g);
    slots++;
  }));
  // Their product lines keep running as subsidiaries that earn a margin in their markets.
  S.subs ||= [];
  for (const l of rv.lines) S.subs.push({ ...l, from: id, inv: BUILD_COST[GOODS[l.g].tier] });
  S.rivals.splice(k, 1);
  S.offers = S.offers.filter(o => o.rid !== id);
  S.acquired = (S.acquired || 0) + 1;
  news(`${S.name} completes a ${money(price)} takeover of ${info.name}, gaining ${slots} resource sites and ${rv.lines.length} product lines.`);
  W.hooks.toast(`🤝 ${info.name} is now part of ${S.name}`, 'good');
  W.hooks.changed('map'); W.hooks.changed('ghosts');
  return true;
}
export function rivalSlots(rv) {
  const out = [];
  for (const [cid, deps] of Object.entries(W.S.deps)) deps.forEach((d, di) => d.slots.forEach((s, si) => { if (s.o === rv.id) out.push({ cid, di, si, g: d.g, lvl: s.lvl, rich: d.rich }); }));
  return out;
}
// Rivals stop expanding once they hold this many deposits, or once few free slots remain in the world.
const RIVAL_SLOT_CAP = 22, RIVAL_FREE_FLOOR = 0.4;
function rivalBuyDeposit(rv, initial = false) {
  const S = W.S, info = rivalInfo(rv.id), home = CITY[info.hq].region;
  if (!initial) {
    let total = 0, free = 0;
    for (const deps of Object.values(S.deps)) for (const d of deps) for (const sl of d.slots) { total++; if (!sl.o) free++; }
    if (free / total < RIVAL_FREE_FLOOR || rivalSlots(rv).length >= RIVAL_SLOT_CAP) return false;
  }
  const cands = [];
  for (const c of CITIES) S.deps[c.id].forEach((d, di) => {
    const free = d.slots.findIndex(s => !s.o);
    if (free < 0) return;
    let w = d.rich * GOODS[d.g].price * (info.pref.includes(d.g) ? 4 : 1) * (c.region === home ? (initial ? 6 : 1.6) : 1);
    if (c.id === S.hq) w *= 0.3; // a little courtesy towards the player's home turf
    else if (S.sites[c.id]) w *= 0.5;
    cands.push({ c, di, si: free, w });
  });
  if (!cands.length) return false;
  let r = rnd() * cands.reduce((a, x) => a + x.w, 0), ch = cands[0];
  for (const x of cands) { r -= x.w; if (r <= 0) { ch = x; break; } }
  const cost = extractorCost(ch.c.id);
  if (!initial && rv.cash < cost) return false;
  rv.cash -= cost; rv.invested += cost;
  Object.assign(S.deps[ch.c.id][ch.di].slots[ch.si], { o: rv.id, lvl: 1, inv: cost });
  if (!initial) {
    const g = GOODS[S.deps[ch.c.id][ch.di].g];
    news(`${info.name} opens a ${g.name} operation in ${ch.c.name}.`, rv.id);
    if (S.sites[ch.c.id]) W.hooks.toast(`${info.name} just claimed ${g.name} in ${ch.c.name}`, 'warn');
    W.hooks.changed('map'); W.hooks.changed('ghosts');
  }
  return true;
}
function rivalsTick() {
  const S = W.S, D = DIFFICULTY[S.difficulty] || DIFFICULTY.tycoon;
  for (const rv of S.rivals) {
    let inc = 0;
    for (const s of rivalSlots(rv)) {
      const region = CITY[s.cid].region, q = s.rich * lvlMult(s.lvl);
      inc += q * price(s.g, region) * 0.32 - UPKEEP[0] * CITY[s.cid].wage * lvlUpkeep(s.lvl) * 0.6;
      S.mkt[region][s.g] += q * 0.5;
    }
    for (const l of rv.lines) {
      inc += l.rate * price(l.g, l.r) * 0.16 - UPKEEP[GOODS[l.g].tier] * 0.6;
      S.mkt[l.r][l.g] += l.rate;
    }
    rv.cash += inc * D.rival;
    if (S.day % Math.round(900 / D.rival) === 0 && rv.tech < 4) rv.tech++;
    if (S.day < rv.next) continue;
    rv.next = S.day + Math.round((14 + rnd() * 26) / D.rival);
    const info = rivalInfo(rv.id), roll = rnd();
    if (roll < 0.5 && rv.cash > 1.5e6) { rivalBuyDeposit(rv); continue; }
    if (roll < 0.85) {
      const opts = GOOD_IDS.filter(g => GOODS[g].tier >= 1 && GOODS[g].tier <= rv.tech);
      const prefd = opts.filter(g => info.pref.includes(g));
      const g = prefd.length && rnd() < 0.7 ? pick(prefd) : pick(opts);
      const cost = BUILD_COST[GOODS[g].tier];
      if (rv.cash < cost * 1.2) continue;
      // At the cap, a rival retires its weakest line only to move up the value chain.
      if (rv.lines.length >= 10) {
        let lo = 0;
        rv.lines.forEach((l, k) => { if (l.rate * price(l.g, l.r) < rv.lines[lo].rate * price(rv.lines[lo].g, rv.lines[lo].r)) lo = k; });
        if (GOODS[rv.lines[lo].g].tier >= GOODS[g].tier) continue;
        rv.lines.splice(lo, 1);
      }
      // Sell where the realised price is best today, so rivals spread out instead of piling into one market.
      const r = REG.map(x => ({ x, p: price(g, x) * (0.85 + rnd() * 0.3) })).sort((a, b) => b.p - a.p)[0].x;
      rv.cash -= cost; rv.invested += cost;
      rv.lines.push({ g, r, rate: TIER_OUTPUT[GOODS[g].tier] / GOODS[g].price * (0.7 + rnd() * 0.9) });
      if (GOODS[g].tier >= 3) news(`${info.name} starts producing ${GOODS[g].name} — expect pressure on ${REGIONS[r].name} prices.`, rv.id);
      continue;
    }
    // Upgrade an existing operation.
    const own = rivalSlots(rv).filter(s => s.lvl < MAX_LEVEL);
    if (own.length) {
      const s = pick(own), cost = upgradeCost(extractorCost(s.cid), s.lvl);
      if (rv.cash > cost * 1.5) { const sl = S.deps[s.cid][s.di].slots[s.si]; rv.cash -= cost; rv.invested += cost; sl.lvl++; sl.inv = (sl.inv || 0) + cost; }
    }
  }
  // Occasional hostile bid for one of the player's operations.
  if (S.day > 200 && rnd() < 1 / 220) {
    const mine = [];
    for (const [cid, deps] of Object.entries(S.deps)) deps.forEach((d, di) => d.slots.forEach((s, si) => { if (s.o === 'P') mine.push({ cid, di, si }); }));
    const rv = pick(S.rivals.filter(r => r.cash > 3e6));
    if (mine.length && rv) {
      // Bids are based on replacement value, below what a buy-out costs, so selling and buying back never pays.
      const m = pick(mine);
      const offer = Math.round(buyoutCost(m.cid, m.di, m.si) * (0.6 + rnd() * 0.35) / 1e4) * 1e4;
      if (rv.cash > offer) {
        const o = { id: Math.random().toString(36).slice(2, 8), rid: rv.id, ...m, amount: offer, until: S.day + 20 };
        S.offers.push(o);
        W.hooks.offer(o);
      }
    }
  }
}
export function answerOffer(id, accept) {
  const S = W.S, k = S.offers.findIndex(o => o.id === id);
  if (k < 0) return;
  const o = S.offers[k]; S.offers.splice(k, 1);
  const slot = S.deps[o.cid][o.di].slots[o.si], rv = S.rivals.find(r => r.id === o.rid);
  if (!accept || slot.o !== 'P' || !rv || rv.cash < o.amount) return;
  rv.cash -= o.amount; rv.invested += o.amount;
  earn(o.amount, 'disposal');
  Object.assign(slot, { o: rv.id, inv: o.amount });
  news(`${S.name} sells its ${GOODS[S.deps[o.cid][o.di].g].name} operation in ${CITY[o.cid].name} to ${rivalName(rv)} for ${money(o.amount)}.`);
  W.hooks.changed('map'); W.hooks.changed('ghosts');
}

// ---------- World events ----------
const EVENTS = [
  { id: 'suez', w: 1, run: d => { block('suez', 18 + rnd() * 14, d); return 'A mega-ship has wedged itself across the Suez Canal. Europe–Asia shipping must go round the Cape.'; } },
  { id: 'panama', w: 1, run: d => { block('panama', 25 + rnd() * 20, d); return 'Drought drains Gatún Lake — the Panama Canal closes to heavy traffic.'; } },
  { id: 'hormuz', w: 0.8, run: d => { block('hormuz', 10 + rnd() * 8, d); effect(d, 'price', 40, 1.35, { goods: ['crude', 'gas', 'petrol', 'jet_fuel'] }); return 'Tensions close the Strait of Hormuz. Gulf tankers are trapped and energy prices spike.'; } },
  { id: 'oil', w: 1.2, run: d => { effect(d, 'price', 60, 1.4, { goods: ['crude', 'petrol', 'jet_fuel', 'plastics'] }); return 'OPEC+ slashes output — oil and refined products jump 40%.'; } },
  { id: 'chips', w: 1, run: d => { effect(d, 'price', 90, 1.35, { goods: ['processors', 'memory', 'wafers', 'smartphones', 'laptops', 'cars', 'servers'] }); return 'Global chip shortage! Semiconductors and everything containing them command a premium.'; } },
  { id: 'typhoon', w: 1, run: d => { const r = pick(['EA', 'SEA']); effect(d, 'output', 10, 0.5, { region: r }); return `Super typhoon hits ${REGIONS[r].name} — plants there run at half speed for 10 days.`; } },
  { id: 'tariff', w: 1, run: d => { const r = pick(REG); effect(d, 'tariff', 120, 0.8, { region: r }); return `${REGIONS[r].name} slaps a 20% tariff on imports — sales there earn 20% less for four months.`; } },
  { id: 'boom', w: 1.2, run: d => { const r = pick(REG); effect(d, 'price', 90, 1.3, { region: r, goods: GOOD_IDS.filter(g => GOODS[g].tier >= 3) }); return `Tech boom in ${REGIONS[r].name}: high-tech goods sell for 30% more there.`; } },
  { id: 'housing', w: 1, run: d => { effect(d, 'price', 90, 1.3, { goods: ['steel', 'steel_beams', 'lumber', 'furniture', 'glass'] }); return 'Construction boom worldwide — steel, timber products and glass rally.'; } },
  { id: 'winter', w: 0.8, run: d => { effect(d, 'price', 45, 1.5, { goods: ['gas'], region: 'EU' }); return 'Bitter European winter — natural gas in Europe up 50%.'; } },
  { id: 'ev', w: 0.8, run: d => { const r = pick(['EU', 'NA', 'EA']); effect(d, 'price', 120, 1.3, { region: r, goods: ['cars', 'batteries', 'lithium', 'cobalt', 'motors'] }); return `EV subsidies in ${REGIONS[r].name} — cars and battery materials up 30% there.`; } },
  { id: 'strike', w: 0.8, run: d => { const mine = [...new Set(Object.keys(W.S.sites).map(c => CITY[c].region))]; const r = pick(mine.length ? mine : REG); effect(d, 'output', 15, 0.6, { region: r }); return `General strike in ${REGIONS[r].name} — output down 40% for 15 days.`; } },
  { id: 'defence', w: 0.9, run: d => { const r = pick(['EU', 'ME', 'NA', 'SAS', 'EA']); effect(d, 'price', 120, 1.45, { region: r, goods: ['ammunition', 'drones', 'missiles', 'armoured_vehicles', 'fighter_jets', 'warships'] }); return `Rearmament drive in ${REGIONS[r].name} — defence goods sell for 45% more there.`; } },
  { id: 'drought', w: 0.9, run: d => { const r = pick(REG); effect(d, 'farm', 40, 0.55, { region: r }); effect(d, 'price', 60, 1.3, { goods: ['wheat', 'soybeans', 'flour', 'meat', 'food', 'coffee', 'cocoa', 'sugarcane'] }); return `Severe drought in ${REGIONS[r].name}: farm output there drops 45% and food prices climb worldwide.`; } },
  { id: 'harvest', w: 0.9, run: d => { effect(d, 'price', 60, 0.75, { goods: ['wheat', 'soybeans', 'sugarcane', 'cotton', 'flour', 'animal_feed'] }); return 'Bumper harvests everywhere — grain, soy, sugar and cotton prices fall 25%.'; } },
  { id: 'ai', w: 0.8, run: d => { effect(d, 'price', 100, 1.4, { goods: ['servers', 'processors', 'memory', 'software', 'ai_models', 'smr'] }); return 'AI investment frenzy — servers, chips, software and data-centre power up 40%.'; } },
  { id: 'nuclear', w: 0.6, run: d => { effect(d, 'price', 120, 1.35, { goods: ['uranium', 'nuclear_fuel', 'smr'] }); return 'Nuclear renaissance — governments sign up for reactors. Uranium and fuel up 35%.'; } },
  { id: 'shipping', w: 0.7, run: d => { effect(d, 'price', 90, 1.35, { goods: ['cargo_ships', 'steel_beams', 'engines'] }); return 'Container shipping boom — shipyards are booked solid.'; } },
  { id: 'glut', w: 1, run: d => { const g = pick(GOOD_IDS.filter(x => GOODS[x].tier <= 1)); effect(d, 'price', 50, 0.7, { goods: [g] }); return `Global glut of ${GOODS[g].name} — prices down 30%.`; } }
];
function effect(d, type, days, mult, o = {}) { W.S.fx.push({ type, until: d + Math.round(days), mult, ...o }); }
function block(ch, days, d) { Sea.setBlocked(ch, true); W.S.fx.push({ type: 'block', channel: ch, until: d + Math.round(days) }); }
function fireEvent() {
  const S = W.S;
  const live = new Set(S.fx.filter(f => f.type === 'block').map(f => f.channel));
  const pool = EVENTS.filter(e => !live.has(e.id));
  let r = rnd() * pool.reduce((a, e) => a + e.w, 0), ev = pool[0];
  for (const e of pool) { r -= e.w; if (r <= 0) { ev = e; break; } }
  const msg = ev.run(S.day);
  news(msg, 'event');
  W.hooks.toast('📰 ' + msg, 'event');
  W.hooks.changed('map');
}
export function news(text, who = 'you') {
  const S = W.S;
  S.news.unshift({ d: S.day, text, who });
  if (S.news.length > 80) S.news.pop();
  W.hooks.news();
}

// ---------- Goals ----------
const countMine = () => Object.values(W.S.deps).reduce((a, ds) => a + ds.reduce((b, d) => b + d.slots.filter(s => s.o === 'P').length, 0), 0);
export const regionsCount = () => new Set(Object.keys(W.S.sites).map(c => CITY[c].region)).size;
const madeTier = t => Object.entries(W.S.made).some(([g, q]) => q >= 1 && GOODS[g].tier >= t);
export const rank = () => { const w = netWorth(); return 1 + W.S.rivals.filter(r => rivalWorth(r) > w).length; };
export const GOALS = [
  { id: 'ext', name: 'Break ground', desc: 'Build your first extractor on a resource deposit.', reward: 250e3, test: () => countMine() >= 1 },
  { id: 'sale', name: 'First invoice', desc: 'Sell $250k worth of goods.', reward: 150e3, test: () => W.S.stats.sales >= 250e3 },
  { id: 'fac', name: 'Value added', desc: 'Build a processing plant.', reward: 300e3, test: () => Object.values(W.S.sites).some(s => s.fac.length) },
  { id: 'fleet', name: 'Going global', desc: 'Put a ship or plane on a route.', reward: 400e3, test: () => W.S.veh.some(v => v.a && v.b && v.trips > 0) },
  { id: 'res', name: 'R&D department', desc: 'Complete a research project.', reward: 300e3, test: () => W.S.res.done.length >= 2 },
  { id: 'reg3', name: 'Multinational', desc: 'Operate sites in 3 world regions.', reward: 1e6, test: () => regionsCount() >= 3 },
  { id: 't2', name: 'Up the value chain', desc: 'Produce any tier-2 good.', reward: 1e6, test: () => madeTier(2) },
  { id: 'farm', name: 'Farm to fork', desc: 'Produce 5,000 Meat, Chocolate, Seafood or Roasted Coffee.', reward: 1.5e6, test: () => ['meat', 'chocolate', 'seafood', 'coffee_roast'].reduce((a, g) => a + (W.S.made[g] || 0), 0) >= 5000 },
  { id: 'energy', name: 'Power player', desc: 'Produce 500 Solar Panels, Wind Turbines or Nuclear Fuel Rods.', reward: 3e6, test: () => ['solar_panels', 'wind_turbines', 'nuclear_fuel'].reduce((a, g) => a + (W.S.made[g] || 0), 0) >= 500 },
  { id: 'motor', name: 'Motor city', desc: 'Produce 500 cars, trucks or tractors.', reward: 4e6, test: () => ['petrol_cars', 'trucks', 'tractors', 'cars'].reduce((a, g) => a + (W.S.made[g] || 0), 0) >= 500 },
  { id: 'yard', name: 'Shipbuilder', desc: 'Commission a ship or airliner you built into your own fleet.', reward: 3e6, test: () => W.S.veh.some(v => v.comm) },
  { id: 'w25', name: 'Mid-cap', desc: 'Reach $25M net worth.', reward: 2e6, test: () => netWorth() >= 25e6 },
  { id: 'chips', name: 'Silicon power', desc: 'Produce 1,000 Processors.', reward: 5e6, test: () => (W.S.made.processors || 0) >= 1000 },
  { id: 'reg6', name: 'Sun never sets', desc: 'Operate in 6 world regions.', reward: 5e6, test: () => regionsCount() >= 6 },
  { id: 'euv', name: 'The most complex machine on Earth', desc: 'Build an EUV lithography machine.', reward: 8e6, test: () => (W.S.made.euv || 0) >= 1 },
  { id: 'w100', name: 'Large-cap', desc: 'Reach $100M net worth.', reward: 5e6, test: () => netWorth() >= 100e6 },
  { id: 'cars', name: 'Gigafactory', desc: 'Produce 100 Electric Cars.', reward: 6e6, test: () => (W.S.made.cars || 0) >= 100 },
  { id: 'air', name: 'Wings', desc: 'Build an Airliner.', reward: 10e6, test: () => (W.S.made.airliners || 0) >= 1 },
  { id: 'mna', name: 'Corporate raider', desc: 'Take over a rival company.', reward: 5e6, test: () => (W.S.acquired || 0) >= 1 },
  { id: 'top', name: 'Market leader', desc: 'Stay #1 on the leaderboard by net worth for 60 days.', reward: 10e6, test: () => W.S.day > 180 && (W.S.leadDays || 0) >= 60 },
  { id: 'navy', name: 'Arsenal of democracy', desc: 'Build a Warship or Fighter Jet.', reward: 12e6, test: () => (W.S.made.warships || 0) + (W.S.made.fighter_jets || 0) >= 1 },
  { id: 'space', name: 'Liftoff', desc: 'Build a Launch Rocket.', reward: 15e6, test: () => (W.S.made.rockets || 0) >= 1 },
  { id: 'sw', name: 'Software is eating the world', desc: 'Produce 10,000 Software licences.', reward: 15e6, test: () => (W.S.made.software || 0) >= 10000 },
  { id: 'qc', name: 'Quantum supremacy', desc: 'Build a Quantum Computer.', reward: 25e6, test: () => (W.S.made.quantum || 0) >= 1 },
  { id: 'agi', name: 'Superintelligence', desc: 'Train an AI Model.', reward: 50e6, test: () => (W.S.made.ai_models || 0) >= 1 },
  { id: 'w1b', name: 'Global megacorp', desc: 'Reach $1 billion net worth — you win.', reward: 0, win: true, test: () => netWorth() >= 1e9 }
];
function checkGoals() {
  const S = W.S;
  for (const g of GOALS) {
    if (S.goals[g.id] != null || !g.test()) continue;
    S.goals[g.id] = S.day;
    if (g.reward) earn(g.reward, 'grant');
    W.hooks.goal(g);
    if (g.win && !S.won) { S.won = true; W.hooks.end('win'); }
  }
}

// ---------- Daily tick ----------
// Smoothed daily figures for per-operation profit (≈ 30-day average).
const EMA = 2 / 31;
const ema = (prev, x) => (prev == null ? x : prev + (x - prev) * EMA);
function produce(cid, site) {
  const S = W.S, c = CITY[cid], outM = fxMult('output', null, c.region);
  // Extractors leave 20% of the warehouse free so deliveries can still land.
  let free = storeCap(site) - storeUsed(site), freeX = storeCap(site) * 0.8 - storeUsed(site);
  S.deps[cid].forEach(dep => dep.slots.forEach(sl => {
    if (sl.o !== 'P') return;
    const up = UPKEEP[0] * c.wage * lvlUpkeep(sl.lvl);
    spend(up, 'upkeep');
    let want = dep.rich * lvlMult(sl.lvl) * outM, fertCost = 0;
    sl.fert = false;
    if (GOODS[dep.g].agri) {
      want *= fxMult('farm', null, c.region);
      // Fertiliser is only spread when the extra crop is worth more than the fertiliser, and never below its keep level.
      const need = want * FERTILISER_USE, spare = (site.inv.fertiliser || 0) - (site.keep.fertiliser || 0);
      const pays = FERTILISER_BOOST * sellPrice(dep.g, c.region) > FERTILISER_USE * sellPrice('fertiliser', c.region);
      if (research('agri') && pays && spare >= need) {
        add(site, 'fertiliser', -need); free += need; freeX += need;
        fertCost = need * sellPrice('fertiliser', c.region);
        want *= 1 + FERTILISER_BOOST; sl.fert = true;
      }
    }
    const q = Math.max(0, Math.min(want, freeX));
    sl.st = q < want * 0.98 ? 'full' : 'ok';
    sl.last = q; sl.age = (sl.age || 0) + 1;
    sl.pl = ema(sl.pl, q * sellPrice(dep.g, c.region) - up - fertCost);
    if (q > 0) { add(site, dep.g, q); free -= q; freeX -= q; S.made[dep.g] = (S.made[dep.g] || 0) + q; }
  }));
  for (const f of site.fac) {
    const G = GOODS[f.g], up = UPKEEP[G.tier] * c.wage * lvlUpkeep(f.lvl);
    spend(up, 'upkeep');
    const cyc = plantRate(cid, f.g, f.lvl) * outM;
    f.acc = Math.min(f.acc + cyc, cyc + 1);
    let n = Math.floor(f.acc), miss = null, need = 0;
    for (const [i, q] of Object.entries(G.inputs)) {
      need += q;
      const can = Math.floor((site.inv[i] || 0) / q + 1e-9);
      if (can < n) { n = can; miss = i; }
    }
    const net = (G.digital ? 0 : G.out) - need;
    if (net > 0 && n * net > free) { n = Math.max(0, Math.floor(free / net)); miss = '__full'; }
    let inVal = 0;
    if (n > 0) {
      for (const [i, q] of Object.entries(G.inputs)) { add(site, i, -q * n); inVal += q * n * sellPrice(i, c.region); }
      add(site, f.g, G.out * n); free -= net * n;
      S.made[f.g] = (S.made[f.g] || 0) + G.out * n;
    }
    // Value added at local market prices: output value − what the inputs would have sold for − upkeep.
    f.last = G.out * n; f.age = (f.age || 0) + 1;
    f.pl = ema(f.pl, G.out * n * sellPrice(f.g, c.region) - inVal - up);
    f.acc -= n;
    f.util = f.util * 0.6 + 0.4 * Math.min(1, cyc > 0 ? n / cyc : 0);
    f.miss = n < cyc - 1 || n === 0 ? miss : null;
  }
}
// Units of a good that vehicles loading it at this site have first claim on, so auto-sell doesn't empty the dock.
function reservedFor(cid, g) {
  let r = 0;
  for (const v of W.S.veh) {
    const l = v.a === cid ? v.la : v.b === cid ? v.lb : null;
    if (l && l.includes(g)) r += VEHICLES[v.t].cap / l.length;
  }
  return r;
}
function dailyTick() {
  const S = W.S, d = S.day;
  // Effects end.
  const ended = S.fx.filter(f => f.until <= d);
  if (ended.length) {
    S.fx = S.fx.filter(f => f.until > d);
    for (const f of ended) if (f.type === 'block') { Sea.setBlocked(f.channel, false); news(`The ${{ suez: 'Suez Canal', panama: 'Panama Canal', hormuz: 'Strait of Hormuz' }[f.channel]} has reopened.`, 'event'); W.hooks.changed('map'); }
    for (const v of S.veh) if (v.st === 'stuck') v.st = 'dock';
  }
  for (const g of GOOD_IDS) S.drift[g] = clamp(S.drift[g] * (1 + (rnd() - 0.5) * 0.03) + (1 - S.drift[g]) * 0.02, 0.8, 1.25);
  for (const [cid, site] of Object.entries(S.sites)) produce(cid, site);
  for (const v of S.veh) {
    const up = VEHICLES[v.t].upkeep;
    spend(up, 'logistics');
    v.costD = ema(v.costD, up + (v.fuelT || 0));
    v.moveD = ema(v.moveD, v.moveT || 0);
    v.fuelT = 0; v.moveT = 0;
  }
  for (const [cid, site] of Object.entries(S.sites)) for (const [g, on] of Object.entries(site.sell)) {
    if (!on) continue;
    const q = Math.floor((site.inv[g] || 0) - (site.keep[g] || 0) - reservedFor(cid, g));
    if (q > 0) sell(cid, g, q);
  }
  for (const r of REG) { const m = S.mkt[r]; for (const g of GOOD_IDS) m[g] *= 0.96; }
  rivalsTick();
  for (const l of S.subs || []) {
    l.pl = l.rate * price(l.g, l.r) * 0.16 - UPKEEP[GOODS[l.g].tier] * 0.6;
    S.today.subsidiaries = (S.today.subsidiaries || 0) + l.pl; S.cash += l.pl;
    S.mkt[l.r][l.g] += l.rate;
  }
  if (S.res.cur) {
    S.res.prog += researchSpeed();
    const r = RESEARCH_BY[S.res.cur];
    if (S.res.prog >= r.days) {
      S.res.done.push(r.id); S.res.cur = null; S.res.prog = 0;
      W.hooks.toast(`🧪 Research complete: ${r.name}`, 'good');
      news(`${S.name} completes ${r.name} research.`);
    }
  }
  if (S.loan > 0) spend(S.loan * loanRate() / 365, 'interest');
  S.offers = S.offers.filter(o => o.until > d);
  if (d >= S.nextEvent) { fireEvent(); S.nextEvent = d + 55 + Math.floor(rnd() * 80); }
  // Change in the book value of stock (non-cash): production counts when it's made, not only when it's sold.
  const inv = stockValue();
  if (S.lastInv != null) S.today.stock = (S.today.stock || 0) + inv - S.lastInv;
  S.lastInv = inv;
  S.ledger.push(S.today); if (S.ledger.length > LEDGER_DAYS) S.ledger.shift(); S.today = {};
  if (d % 7 === 0) { S.hist.push(histPoint()); if (S.hist.length > 520) S.hist.shift(); }
  S.leadDays = rank() === 1 ? (S.leadDays || 0) + 1 : 0;
  checkGoals();
  // Insolvency: 45 days overdrawn and the administrators arrive.
  if (S.cash < 0) {
    S.overdrawn++;
    if (S.overdrawn === 1) W.hooks.toast('⚠️ You are overdrawn. Borrow, sell or cut costs — 45 days until administration.', 'bad');
    if (S.overdrawn >= 45 && !S.over) { S.over = true; W.hooks.end('bankrupt'); }
  } else S.overdrawn = 0;
}

// Advance the world by dd days (fractional).
export function step(dd) {
  const S = W.S;
  if (!S || S.over) return;
  let left = dd;
  while (left > 1e-9) {
    const h = Math.min(left, 0.2, S.day + 1 - S.t);
    S.t += h; left -= h;
    for (const v of S.veh) updateVehicle(v, h);
    if (S.t >= S.day + 1 - 1e-9) { S.t = S.day + 1; S.day++; dailyTick(); }
  }
}

export const money = n => {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  let out;
  // Pick the unit after rounding, so 999,999 reads $1.00M rather than $1000k.
  if (a >= 999.5e6) { const v = a / 1e9; out = `${v.toFixed(v >= 9.995 ? 1 : 2)}B`; }
  else if (a >= 999.5e3) { const v = a / 1e6; out = `${v.toFixed(v >= 99.95 ? 0 : v >= 9.995 ? 1 : 2)}M`; }
  else if (a >= 999.5) { const v = a / 1e3; out = `${v.toFixed(v >= 99.95 ? 0 : 1)}k`; }
  else out = `${Math.round(a)}`;
  return `${n < 0 && /[1-9]/.test(out) ? '−' : ''}$${out}`;
};
