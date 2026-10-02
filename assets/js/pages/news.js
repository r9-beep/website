// Newsroom: category filters and deep links that open the matching release.
const items = [...document.querySelectorAll('.news-item')];
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  items.forEach(it => { it.hidden = f !== 'all' && it.dataset.cat !== f; });
}));
function openHash() {
  const el = location.hash && document.getElementById(location.hash.slice(1));
  if (el && el.tagName === 'DETAILS') { el.open = true; el.classList.add('in'); setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }
}
window.addEventListener('hashchange', openHash);
openHash();
