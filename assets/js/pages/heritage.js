// Heritage: timeline progress line follows the scroll.
const tl = document.querySelector('[data-vtl]');
const bar = document.querySelector('[data-vprogress]');
if (tl && bar) {
  const update = () => {
    const r = tl.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (window.innerHeight * 0.6 - r.top) / r.height));
    bar.style.height = `${p * 100}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
