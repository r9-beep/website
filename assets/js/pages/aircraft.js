// Aircraft page: studio viewer with hotspots.
import { FLEET_BY_ID } from '../data/fleet.js';
import { webglAvailable } from '../lib/stage.js';

const id = document.querySelector('[data-aircraft]')?.dataset.aircraft;
const spec = FLEET_BY_ID[id];
const host = document.querySelector('[data-viewer]');
const root = document.body.dataset.root || '';

if (spec && host) {
  if (webglAvailable()) {
    import('../lib/viewer.js').then(async ({ createViewer }) => {
      const viewer = await createViewer(host, { initial: id, hotspots: spec.hotspots, label: `Interactive 3D model of the ${spec.name}` });
      host.querySelector('[data-loading]').classList.add('done');
      document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
        const t = b.dataset.tool;
        if (t === 'reset') { viewer.reset(); return; }
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        if (t === 'rotate') viewer.setAutoRotate(on);
        if (t === 'gear') viewer.setGear(on);
        if (t === 'night') viewer.setNight(on);
        if (t === 'xray') viewer.setXray(on);
      }));
      document.querySelectorAll('[data-hotspot]').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.hotspot;
        const active = b.getAttribute('aria-pressed') === 'true';
        viewer.focusHotspot(active ? -1 : i);
        if (!active) host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
    }).catch(err => console.error(err));
  } else {
    host.querySelector('[data-loading]').innerHTML = `<div class="viewer-fallback"><img src="${root}assets/img/fleet/${id}-34.webp" alt="${spec.name}"></div>`;
  }
}
