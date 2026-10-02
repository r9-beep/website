// Engineering page: turbofan cutaway + UK sites map interaction.
import { webglAvailable } from '../lib/stage.js';

const host = document.querySelector('[data-engine]');
const slider = document.querySelector('[data-spool]');
const out = document.getElementById('spool-out');
if (host && webglAvailable()) {
  import('../lib/engine.js').then(({ createEngine }) => {
    const eng = createEngine(host, { power: slider ? slider.value / 100 : 0.65 });
    slider && slider.addEventListener('input', () => {
      eng.setPower(slider.value / 100);
      out.textContent = `${slider.value}% N1`;
    });
  }).catch(err => console.error(err));
} else if (host) {
  host.innerHTML = '<p style="position:absolute;right:2rem;bottom:8rem;color:var(--titanium)">The interactive engine needs WebGL.</p>';
}

// Link the site list with the map
const items = document.querySelectorAll('.site-list li');
const sites = document.querySelectorAll('.uk-map .site');
items.forEach(li => {
  const on = v => {
    items.forEach(x => x.classList.toggle('on', v && x === li));
    sites.forEach(s => s.style.opacity = v && s.dataset.site !== li.dataset.site ? '0.35' : '1');
  };
  li.addEventListener('mouseenter', () => on(true));
  li.addEventListener('mouseleave', () => on(false));
});
