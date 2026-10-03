// Fleet page: 3D hangar with aircraft tabs and viewer tools.
import { FLEET_BY_ID, fmt } from '../data/fleet.js';
import { webglAvailable } from '../lib/stage.js';

const host = document.querySelector('[data-viewer]');
const tabs = [...document.querySelectorAll('.hangar-tab')];
const panel = document.querySelector('[data-panel]');
const root = document.body.dataset.root || '';
let current = location.hash && FLEET_BY_ID[location.hash.slice(1)] ? location.hash.slice(1) : '4-44ulr';
let viewer = null;

function fillPanel(id) {
  const a = FLEET_BY_ID[id];
  panel.classList.add('swap');
  setTimeout(() => {
    panel.querySelector('[data-p-code]').textContent = `${a.code} · ${a.reg}`;
    panel.querySelector('[data-p-name]').textContent = a.name;
    panel.querySelector('[data-p-role]').textContent = a.role;
    panel.querySelector('[data-p-specs]').innerHTML = [
      ['Max seats', fmt(a.specs.seats), ''], ['Range', fmt(a.specs.rangeKm), 'km'],
      ['Length', a.specs.lengthM, 'm'], ['Wingspan', a.specs.spanM, 'm'],
      ['Engines', a.specs.engines, `× ${a.specs.thrustKn} kN`], ['Entry into service', a.eis, '']
    ].map(([k, v, u]) => `<div><dt>${k}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`).join('');
    const link = panel.querySelector('[data-p-link]');
    link.href = `${root}fleet/${a.id}.html`;
    link.firstChild.textContent = `Explore the ${a.code} `;
    panel.classList.remove('swap');
  }, 250);
}

function select(id, focus = false) {
  current = id;
  tabs.forEach(t => {
    const on = t.dataset.id === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  fillPanel(id);
  history.replaceState(null, '', `#${id}`);
  if (viewer) {
    const lu = document.querySelector('[data-tool="lineup"]');
    if (lu.getAttribute('aria-pressed') === 'true') { lu.setAttribute('aria-pressed', 'false'); }
    viewer.load(id);
  }
}

tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t.dataset.id));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length].dataset.id, true); }
  });
});

fillPanel(current);
tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.id === current)));

if (webglAvailable()) {
  import('../lib/viewer.js').then(async ({ createViewer }) => {
    viewer = await createViewer(host, { initial: current, shiftX: 0.13, label: 'Interactive 3D model of the selected BAC aircraft' });
    host.querySelector('[data-loading]').classList.add('done');
    document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      const t = b.dataset.tool;
      if (t === 'rotate') viewer.setAutoRotate(on);
      if (t === 'gear') viewer.setGear(on);
        if (t === 'flaps') viewer.setFlaps(on);
      if (t === 'night') viewer.setNight(on);
      if (t === 'xray') viewer.setXray(on);
      if (t === 'lineup') viewer.setLineup(on);
    }));
  }).catch(err => { console.error(err); });
} else {
  host.querySelector('[data-loading]').innerHTML = `<div class="viewer-fallback"><img src="${root}assets/img/fleet/${current}-34.webp" alt=""></div>`;
}
