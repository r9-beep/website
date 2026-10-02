// Site-wide behaviour: navigation, menus, reveals, counters, tilt, page transitions.
const html = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Navigation ---------- */
const nav = document.querySelector('[data-nav]');
if (nav) {
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 40);
    const goingDown = y > lastY && y > 300;
    if (!html.classList.contains('nav-open')) nav.classList.toggle('hidden', goingDown && !nav.matches(':focus-within'));
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('mobile-menu');
if (toggle && menu) {
  const setOpen = open => {
    html.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) { menu.hidden = false; menu.querySelector('a')?.focus({ preventScroll: true }); }
    else setTimeout(() => { if (!html.classList.contains('nav-open')) menu.hidden = true; }, 700);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setOpen(!html.classList.contains('nav-open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && html.classList.contains('nav-open')) { setOpen(false); toggle.focus(); } });
  menu.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
}

/* ---------- Reveal on scroll ---------- */
const revealIO = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.reveal, .reveal-mask, .split-line, [data-reveal], .h-timeline, .cbars, .routes-table, .v-item').forEach((el, i) => {
  if (el.closest('.reveal-group')) {
    const idx = [...el.parentElement.children].indexOf(el);
    el.style.setProperty('--d', `${Math.min(idx, 8) * 0.08}s`);
  }
  revealIO.observe(el);
});

/* ---------- Counters ---------- */
function animateCount(el) {
  const target = parseFloat(el.dataset.count);
  if (isNaN(target)) return;
  const dec = +(el.dataset.decimals || 0);
  const comma = el.dataset.format === 'comma' || target >= 10000;
  const fmt = v => {
    const s = v.toFixed(dec);
    return comma ? Number(s).toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s;
  };
  if (reduced) { el.textContent = fmt(target); return; }
  const dur = 1800, t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 4);
    el.textContent = fmt(target * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const countIO = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { animateCount(e.target); countIO.unobserve(e.target); } });
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach(el => countIO.observe(el));

/* ---------- Tilt cards ---------- */
if (!reduced && window.matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      card.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
  });
}

/* ---------- Page transitions ---------- */
requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('is-entering')));
window.addEventListener('pageshow', e => { if (e.persisted) html.classList.remove('is-leaving', 'is-entering'); });
if (!reduced) {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    if (/\.(pdf|png|jpe?g|svg|zip)$/i.test(url.pathname)) return;
    e.preventDefault();
    try { sessionStorage.setItem('bac-transition', '1'); } catch {}
    html.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, 520);
  });
}

/* ---------- Newsletter (static demo — no data leaves the browser) ---------- */
document.querySelectorAll('[data-newsletter]').forEach(form => {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = form.querySelector('input[type=email]');
    const msg = form.querySelector('.newsletter-msg');
    if (!input.value || !input.checkValidity()) { msg.textContent = 'Please enter a valid email address.'; input.focus(); return; }
    msg.textContent = 'Thank you — you’re on the list for programme updates.';
    input.value = '';
  });
});

/* ---------- Toast ---------- */
export function toast(text, ms = 2600) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), ms);
}

/* ---------- Footer year ---------- */
document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
