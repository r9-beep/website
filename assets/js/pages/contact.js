// Contact form: preselect from URL, validate, then submit.
// To receive enquiries, set data-endpoint on the <form> (e.g. a Formspree URL) — see README.
const form = document.querySelector('[data-enquiry]');
const success = document.querySelector('[data-success]');
if (form) {
  const q = new URLSearchParams(location.search);
  const type = form.querySelector('#type');
  if (q.get('type') && [...type.options].some(o => o.value === q.get('type'))) type.value = q.get('type');
  if (q.get('aircraft')) form.querySelectorAll('input[name=aircraft]').forEach(c => { c.checked = c.value === q.get('aircraft'); });
  const roleField = form.querySelector('[data-role-field]');
  if (q.get('role')) form.querySelector('#role').value = q.get('role');

  const sync = () => {
    const t = type.value;
    form.querySelectorAll('[data-order-only]').forEach(el => { el.hidden = !(t === 'order' || t === 'leasing'); });
    form.querySelector('[data-aircraft-field]').hidden = !['order', 'leasing', 'support'].includes(t);
    roleField.hidden = t !== 'careers';
  };
  type.addEventListener('change', sync);
  sync();

  const setErr = (k, msg) => {
    const p = form.querySelector(`[data-err="${k}"]`);
    if (p) p.textContent = msg || '';
    const input = form.querySelector(`[name="${k}"]`);
    if (input) { input.classList.toggle('is-invalid', !!msg); input.setAttribute('aria-invalid', String(!!msg)); }
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    let ok = true;
    const name = (data.get('name') || '').trim(), email = (data.get('email') || '').trim(), msg = (data.get('message') || '').trim();
    setErr('name', name ? '' : 'Please tell us your name.'); ok = ok && !!name;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    setErr('email', emailOk ? '' : 'Please enter a valid email address.'); ok = ok && emailOk;
    setErr('message', msg.length >= 10 ? '' : 'A sentence or two helps us route your enquiry.'); ok = ok && msg.length >= 10;
    const consent = !!data.get('consent');
    setErr('consent', consent ? '' : 'Please confirm we may contact you.'); ok = ok && consent;
    if (!ok) { form.querySelector('.is-invalid')?.focus(); return; }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.firstChild.textContent = 'Sending… ';
    let sent = false;
    if (form.dataset.endpoint) {
      try {
        const res = await fetch(form.dataset.endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        sent = res.ok;
      } catch { sent = false; }
      if (!sent) { btn.disabled = false; btn.firstChild.textContent = 'Send enquiry '; setErr('consent', 'Something went wrong sending your enquiry — please try again.'); return; }
    }
    form.hidden = true;
    success.classList.add('on');
    if (!form.dataset.endpoint) success.querySelector('[data-success-msg]').textContent = `Thanks, ${name.split(' ')[0]}. This is a demo site, so nothing was sent — but the real thing would have reached our team.`;
    success.focus();
  });
}
