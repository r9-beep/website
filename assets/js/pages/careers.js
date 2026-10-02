// Careers: discipline filter.
const jobs = [...document.querySelectorAll('.job')];
const empty = document.querySelector('[data-empty]');
document.querySelectorAll('[data-disc]').forEach(b => b.addEventListener('click', () => {
  const d = b.dataset.disc;
  document.querySelectorAll('[data-disc]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  let n = 0;
  jobs.forEach(j => { const show = d === 'all' || j.dataset.d === d; j.hidden = !show; if (show) n++; });
  empty.hidden = n > 0;
}));
