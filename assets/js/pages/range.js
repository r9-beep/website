// Range Explorer page controller.
import { FLEET, FLEET_BY_ID, AIRPORTS, gcDistance, blockTime, fmt } from '../data/fleet.js';
import { webglAvailable } from '../lib/stage.js';

const q = new URLSearchParams(location.search);
let aircraftId = FLEET_BY_ID[q.get('aircraft')] ? q.get('aircraft') : '4-44ulr';
let hubCode = AIRPORTS[q.get('hub')] ? q.get('hub') : 'LHR';

const seg = document.querySelector('[data-aircraft-seg]');
const hubSel = document.querySelector('[data-hub]');
const list = document.querySelector('[data-dest]');
const reachEl = document.querySelector('[data-reach]');
const rangeEl = document.querySelector('[data-range]');
const rcTo = document.querySelector('[data-rc-to]');
const rcOut = document.querySelector('[data-rc-out]');
const ro = { name: document.querySelector('[data-ro-name]'), km: document.querySelector('[data-ro-km]'), hub: document.querySelector('[data-ro-hub]') };

const codes = Object.keys(AIRPORTS).sort((a, b) => AIRPORTS[a].city.localeCompare(AIRPORTS[b].city));
const hubs = codes.filter(c => AIRPORTS[c].hub);
hubSel.innerHTML = `<optgroup label="Major hubs">${hubs.map(c => `<option value="${c}">${AIRPORTS[c].city} (${c})</option>`).join('')}</optgroup>` +
  `<optgroup label="All airports">${codes.filter(c => !AIRPORTS[c].hub).map(c => `<option value="${c}">${AIRPORTS[c].city} ${AIRPORTS[c].name !== AIRPORTS[c].city ? '— ' + AIRPORTS[c].name : ''} (${c})</option>`).join('')}</optgroup>`;
hubSel.value = hubCode;

seg.innerHTML = FLEET.map(a => `<button type="button" data-id="${a.id}" aria-pressed="${a.id === aircraftId}" title="${a.name}">${a.code.replace('NXT', '')}</button>`).join('');

let globe = null;
const host = document.querySelector('[data-globe]');
if (webglAvailable()) {
  import('../lib/globe.js').then(({ createGlobe }) => {
    globe = createGlobe(host, { interactive: true, autoRotate: true, labels: true, label: 'Interactive 3D globe showing nonstop range' });
    globe.setAircraft(aircraftId);
    globe.setHub(hubCode, true);
  });
} else {
  host.innerHTML = '<p style="position:absolute;right:2rem;top:50%;color:var(--titanium);max-width:24ch">The 3D globe needs WebGL. The destination list still works.</p>';
}

function render() {
  const a = FLEET_BY_ID[aircraftId];
  const hub = AIRPORTS[hubCode];
  const rows = codes.filter(c => c !== hubCode && AIRPORTS[c].city !== hub.city).map(c => ({ c, km: Math.round(gcDistance(hub, AIRPORTS[c])) })).sort((x, y) => x.km - y.km);
  const reach = rows.filter(r => r.km <= a.specs.rangeKm).length;
  reachEl.textContent = `${reach}/${rows.length}`;
  rangeEl.textContent = fmt(a.specs.rangeKm);
  ro.name.textContent = a.name;
  ro.km.textContent = `${fmt(a.specs.rangeKm)} km`;
  ro.hub.textContent = `from ${hub.city}${hub.name !== hub.city ? ' ' + hub.name : ''}`;
  list.innerHTML = rows.map(r => {
    const ok = r.km <= a.specs.rangeKm;
    return `<li class="${ok ? '' : 'out'}" data-code="${r.c}" tabindex="0"><span class="iata">${r.c}</span><span>${AIRPORTS[r.c].city} <span class="${ok ? 'ok' : 'no'}" aria-label="${ok ? 'reachable' : 'out of range'}">${ok ? '✓' : '✕'}</span></span><span class="km">${fmt(r.km)} km${ok ? ' · ' + blockTime(r.km, a.specs.cruiseKmh) : ''}</span></li>`;
  }).join('');
  rcTo.innerHTML = `<option value="">Choose a destination…</option>` + codes.filter(c => c !== hubCode).map(c => `<option value="${c}">${AIRPORTS[c].city} (${c})</option>`).join('');
  rcOut.textContent = '';
  const url = new URL(location.href);
  url.searchParams.set('aircraft', aircraftId); url.searchParams.set('hub', hubCode);
  history.replaceState(null, '', url);
}

function checkRoute(to) {
  if (!to) { rcOut.textContent = ''; globe && globe.setRoutes([]); return; }
  const km = Math.round(gcDistance(AIRPORTS[hubCode], AIRPORTS[to]));
  const can = FLEET.filter(a => a.specs.rangeKm >= km);
  rcOut.innerHTML = `<b style="font-family:var(--mono);color:var(--gold)">${hubCode} → ${to}</b> · ${fmt(km)} km<br>` +
    (can.length ? `Nonstop with: ${can.map(a => `<a href="../fleet/${a.id}.html" style="color:var(--ivory)">${a.name}</a>`).join(', ')}` : 'Beyond every aircraft in the fleet — one stop required.');
  globe && globe.setRoutes([{ from: hubCode, to }]);
  globe && globe.focus(to);
}

seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  aircraftId = b.dataset.id;
  seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render(); globe && globe.setAircraft(aircraftId);
});
hubSel.addEventListener('change', () => { hubCode = hubSel.value; render(); globe && globe.setHub(hubCode); });
rcTo.addEventListener('change', () => checkRoute(rcTo.value));
const pick = li => { if (!li) return; rcTo.value = li.dataset.code; checkRoute(li.dataset.code); list.querySelectorAll('li').forEach(x => x.classList.toggle('on', x === li)); };
list.addEventListener('click', e => pick(e.target.closest('li')));
list.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target.closest('li')); } });

// Longest-route table
const tb = document.querySelector('[data-longest] tbody');
if (tb) {
  const lhr = AIRPORTS.LHR;
  tb.innerHTML = FLEET.map(a => {
    const rs = Object.keys(AIRPORTS).filter(c => AIRPORTS[c].city !== 'London').map(c => ({ c, km: Math.round(gcDistance(lhr, AIRPORTS[c])) })).filter(r => r.km <= a.specs.rangeKm).sort((x, y) => y.km - x.km);
    const best = rs[0];
    return `<tr><th scope="row"><a href="../fleet/${a.id}.html" style="text-decoration:none">${a.name}</a></th><td>${fmt(a.specs.rangeKm)} km</td><td>LHR → ${best.c} · ${AIRPORTS[best.c].city}</td><td>${fmt(best.km)} km</td><td>${blockTime(best.km, a.specs.cruiseKmh)}</td><td>${rs.length} of ${Object.keys(AIRPORTS).length - 2}</td></tr>`;
  }).join('');
}

render();
