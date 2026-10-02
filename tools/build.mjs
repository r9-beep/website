// Static site generator for the BAC website.
// Usage: node tools/build.mjs
//   - wraps every src/pages/**/*.html body in the shared layout (head, nav, footer)
//   - generates one page per aircraft from src/templates/aircraft.html + assets/js/data/fleet.js
//   - writes sitemap.xml
// Output is plain static HTML at the repository root, ready for GitHub Pages.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLEET, AIRPORTS, gcDistance, blockTime, fmt } from '../assets/js/data/fleet.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Change this if you publish under a custom domain or a different repository name.
export const SITE = {
  name: 'British Aircraft Corporation',
  short: 'BAC',
  url: 'https://r9-beep.github.io/website/',
  description: 'British Aircraft Corporation designs and builds the next generation of British airliners — from the 1-11NXT narrow-body to the 19,000 km 4-44ULR.',
  year: new Date().getFullYear()
};

const NAV = [
  { key: 'fleet', label: 'Fleet', href: 'fleet/' },
  { key: 'engineering', label: 'Engineering', href: 'engineering/' },
  { key: 'range', label: 'Range', href: 'range/' },
  { key: 'heritage', label: 'Heritage', href: 'heritage/' },
  { key: 'news', label: 'Newsroom', href: 'news/' },
  { key: 'careers', label: 'Careers', href: 'careers/' }
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const roundel = (cls = 'roundel', size = 42) => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="20" fill="none" stroke="#C8102E" stroke-width="1.5"/><circle cx="21" cy="21" r="13" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="21" cy="21" r="6" fill="#C8102E"/><path d="M1 21 L15 18 L15 24 Z" fill="#C8102E" opacity="0.6"/><path d="M41 21 L27 18 L27 24 Z" fill="#C8102E" opacity="0.6"/></svg>`;

function navHtml(root, active) {
  const fleetMenu = FLEET.map(a => `
            <a class="mega-item" href="${root}fleet/${a.id}.html">
              <img src="${root}assets/img/fleet/${a.id}-34.webp" alt="" loading="lazy" width="320" height="180">
              <span class="mega-name">${esc(a.name)}</span>
              <span class="mega-role">${esc(a.role.split('·')[0].trim())}</span>
            </a>`).join('');
  const links = NAV.map(n => {
    const cur = n.key === active ? ' aria-current="page"' : '';
    if (n.key === 'fleet') {
      return `<li class="has-mega"><a href="${root}${n.href}"${cur}>${n.label}</a>
          <div class="mega" role="group" aria-label="Fleet">
            <div class="mega-inner">${fleetMenu}
            </div>
          </div>
        </li>`;
    }
    return `<li><a href="${root}${n.href}"${cur}>${n.label}</a></li>`;
  }).join('\n        ');
  return `<header class="site-nav" data-nav>
  <a class="nav-logo" href="${root}" aria-label="British Aircraft Corporation — home">
    ${roundel('nav-roundel')}
    <span class="nav-wordmark">British Aircraft Corporation<span>Est. 2024 · Bristol, England</span></span>
  </a>
  <nav aria-label="Primary">
    <ul class="nav-links">
        ${links}
    </ul>
  </nav>
  <a href="${root}contact/" class="nav-cta"${active === 'contact' ? ' aria-current="page"' : ''}>Order enquiry</a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu"><span></span><span></span></button>
</header>
<div class="mobile-menu" id="mobile-menu" hidden>
  <nav aria-label="Mobile">
    <ol>
      <li><a href="${root}">Home</a></li>
      ${NAV.map(n => `<li><a href="${root}${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('\n      ')}
      <li><a href="${root}contact/">Order enquiry</a></li>
    </ol>
  </nav>
  <p class="mobile-menu-foot">Filton · Broughton · Derby</p>
</div>`;
}

function footerHtml(root) {
  return `<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand-col">
      <a class="footer-brand" href="${root}">${roundel('footer-roundel', 36)}<span>British Aircraft Corporation</span></a>
      <p class="footer-tagline">Building the aircraft that carry Britain's ambition to every corner of the world.</p>
      <form class="newsletter" data-newsletter novalidate>
        <label for="nl-email" class="label-mono">Programme updates</label>
        <div class="newsletter-row">
          <input id="nl-email" type="email" name="email" placeholder="you@airline.com" autocomplete="email" required>
          <button type="submit" aria-label="Subscribe">→</button>
        </div>
        <p class="newsletter-msg" role="status" aria-live="polite"></p>
      </form>
    </div>
    <div class="footer-links">
      <div class="footer-col">
        <h2 class="footer-col-title">Fleet</h2>
        <ul>
          ${FLEET.map(a => `<li><a href="${root}fleet/${a.id}.html">${esc(a.name)}</a></li>`).join('\n          ')}
        </ul>
      </div>
      <div class="footer-col">
        <h2 class="footer-col-title">Company</h2>
        <ul>
          <li><a href="${root}engineering/">Engineering</a></li>
          <li><a href="${root}heritage/">Heritage</a></li>
          <li><a href="${root}news/">Newsroom</a></li>
          <li><a href="${root}careers/">Careers</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h2 class="footer-col-title">Orders</h2>
        <ul>
          <li><a href="${root}contact/">Fleet enquiry</a></li>
          <li><a href="${root}contact/?type=leasing">Leasing</a></li>
          <li><a href="${root}contact/?type=support">MRO &amp; support</a></li>
          <li><a href="${root}range/">Range explorer</a></li>
          <li><a href="${root}assets/BAC-Fleet-Brochure.pdf" download>Fleet brochure (PDF)</a></li>
        </ul>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <p class="footer-copy">© ${SITE.year} British Aircraft Corporation Ltd. Registered in England &amp; Wales. Bristol, England.</p>
    <p class="footer-copy">A design concept. All aircraft specifications provisional and subject to change without notice.</p>
    <a class="to-top" href="#top" aria-label="Back to top">↑</a>
  </div>
</footer>`;
}

function layout({ meta, body, root, path }) {
  const title = meta.title ? `${meta.title} — ${SITE.name}` : `${SITE.name} — Britain builds the world's finest aircraft`;
  const desc = meta.description || SITE.description;
  const url = SITE.url + path.replace(/index\.html$/, '');
  const ogImage = SITE.url + (meta.ogImage || 'assets/img/og.jpg');
  const scripts = (meta.scripts || []).map(s => `<script type="module" src="${root}assets/js/${s}"></script>`).join('\n');
  const basePath = new URL(SITE.url).pathname;
  const baseTag = meta.is404
    ? `<script>(function(){var b=${JSON.stringify(basePath)};if(location.pathname.indexOf(b)!==0)b='/';document.write('<base href="'+b+'">');})();</script>\n`
    : '';
  const preload = (meta.preload || []).map(p => p.as === 'script'
    ? `<link rel="modulepreload" href="${root}${p.href}">`
    : `<link rel="preload" href="${root}${p.href}" as="${p.as}"${p.type ? ` type="${p.type}"` : ''}${p.as === 'fetch' || p.as === 'font' ? ' crossorigin' : ''}>`).join('\n');
  return `<!doctype html>
<html lang="en-GB" id="top">
<head>
${baseTag}<meta charset="utf-8">
<script>document.documentElement.classList.add('js');try{if(sessionStorage.getItem('bac-transition')){sessionStorage.removeItem('bac-transition');document.documentElement.classList.add('is-entering');}}catch(e){}</script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0A0E1A">
<meta name="color-scheme" content="dark">
${meta.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(meta.ogTitle || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}favicon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${root}assets/img/apple-touch-icon.png">
<link rel="manifest" href="${root}site.webmanifest">
<link rel="preload" href="${root}assets/fonts/cormorant-garamond-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${root}assets/fonts/inter-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
${preload}
${meta.nav === 'home' ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: SITE.name, alternateName: SITE.short, url: SITE.url, logo: SITE.url + 'assets/img/icon-512.png', description: SITE.description, foundingDate: '2024', address: { '@type': 'PostalAddress', addressLocality: 'Bristol', addressCountry: 'GB' } })}</script>` : ''}
<link rel="stylesheet" href="${root}assets/css/fonts.css">
<link rel="stylesheet" href="${root}assets/css/main.css">
${(meta.styles || []).map(h => `<link rel="stylesheet" href="${root}${h}">`).join('\n')}
<script type="module" src="${root}assets/js/site.js"></script>
${scripts}
</head>
<body class="${meta.bodyClass || ''}" data-root="${root}">
<a class="skip-link" href="#main">Skip to content</a>
<div class="curtain" aria-hidden="true"><span>${roundel('curtain-roundel', 56)}</span></div>
${navHtml(root, meta.nav)}
<main id="main">
${body.trim()}
</main>
${meta.noFooter ? '' : footerHtml(root)}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Aircraft page helpers                                               */
/* ------------------------------------------------------------------ */

function seatMap(a) {
  const classes = a.cabin.classes;
  const pitchScale = 0.42; // px per inch of pitch
  const seatW = { Business: 15, 'Premium Economy': 11, Economy: 9.2 };
  const seatH = { Business: 15, 'Premium Economy': 11.5, Economy: 10 };
  const color = { Business: '#C9A84C', 'Premium Economy': '#F0EDE6', Economy: '#7F8CA6' };
  const maxAbreast = Math.max(...classes.map(c => c.layout.split('-').reduce((s, n) => s + +n, 0)));
  const aisle = 10;
  const groupsMax = Math.max(...classes.map(c => c.layout.split('-').length));
  const cabinH = maxAbreast * 11.2 + (groupsMax - 1) * aisle + 24;
  let x = 70; // after the flight deck
  const parts = [];
  const H = cabinH;
  classes.forEach((c, ci) => {
    const groups = c.layout.split('-').map(Number);
    const abreast = groups.reduce((s, n) => s + n, 0);
    const sw = seatW[c.name] || 9, sh = seatH[c.name] || 10;
    const rowLen = c.pitch * pitchScale;
    const totalW = abreast * (sh + 1.2) + (groups.length - 1) * aisle;
    // galley block before each class
    parts.push(`<rect x="${x}" y="${H / 2 - 18}" width="12" height="36" rx="2" fill="#262d40"/>`);
    x += 22;
    for (let r = 0; r < c.rows; r++) {
      let y = (H - totalW) / 2;
      groups.forEach((g, gi) => {
        for (let k = 0; k < g; k++) {
          parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sw}" height="${sh}" rx="2.5" fill="${color[c.name] || '#7F8CA6'}"/>`);
          y += sh + 1.2;
        }
        if (gi < groups.length - 1) y += aisle;
      });
      x += Math.max(rowLen, sw + 3);
    }
    x += 8;
  });
  x += 30;
  const W = x + 40;
  const r = H / 2;
  const outline = `<path d="M ${r * 1.6} 2 L ${W - r} 2 Q ${W} 2 ${W} ${r} Q ${W} ${H - 2} ${W - r} ${H - 2} L ${r * 1.6} ${H - 2} Q 2 ${H - 2} 2 ${r} Q 2 2 ${r * 1.6} 2 Z" fill="#0d1222" stroke="rgba(255,255,255,0.14)"/>`;
  const legend = classes.map(c => {
    const seats = c.rows * c.layout.split('-').reduce((s, n) => s + +n, 0);
    return `<li><span class="swatch" style="background:${color[c.name]}"></span>${esc(c.name)} <b>${seats}</b> <small>${c.layout} · ${c.pitch}" pitch</small></li>`;
  }).join('');
  const total = classes.reduce((s, c) => s + c.rows * c.layout.split('-').reduce((t, n) => t + +n, 0), 0);
  return {
    svg: `<svg class="seatmap" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img" aria-label="${esc(a.name)} cabin seat map, ${total} seats">${outline}<g transform="translate(${W.toFixed(0)},0) scale(-1,1)">${parts.join('')}</g></svg>`,
    legend, total
  };
}

function aircraftVars(a, i) {
  const s = a.specs;
  const prev = FLEET[(i + FLEET.length - 1) % FLEET.length], next = FLEET[(i + 1) % FLEET.length];
  const sm = seatMap(a);
  const specRows = [
    ['Dimensions', [['Length', `${s.lengthM} m`], ['Wingspan', `${s.spanM} m`], ['Height', `${s.heightM} m`], ['Cabin width', `${s.cabinWidthM.toFixed(2)} m`]]],
    ['Performance', [['Range', `${fmt(s.rangeKm)} km`], ['Cruise speed', `${s.cruiseKmh} km/h (Mach ${s.mach.toFixed(2)})`], ['Service ceiling', `${fmt(s.ceilingFt)} ft`], ['Max endurance', `${s.enduranceH} h`]]],
    ['Capacity', [['Max seats', fmt(s.seats)], ['Typical seats', `${fmt(s.typicalSeats)}`], ['Max payload', `${fmt(s.payloadKg)} kg`], ['MTOW', `${fmt(s.mtowKg)} kg`]]],
    ['Powerplant', [['Engines', `${s.engines} × UHBR turbofan`], ['Thrust', `${s.engines} × ${s.thrustKn} kN`], ['Mounting', a.geo.engines.mount === 'rear' ? 'Rear fuselage' : 'Underwing'], ['Entry into service', `${a.eis}`]]]
  ].map(([h, rows]) => `<div class="spec-group reveal"><h3 class="label-mono">${h}</h3><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div>`).join('');
  const routes = a.routes.map(([o, d]) => {
    const A = AIRPORTS[o], B = AIRPORTS[d];
    const km = Math.round(gcDistance(A, B));
    const pct = Math.min(100, km / s.rangeKm * 100);
    return `<tr><td><span class="iata">${o}</span> ${esc(A.city)}</td><td class="route-arrow" aria-hidden="true">→</td><td><span class="iata">${d}</span> ${esc(B.city)}</td><td class="num">${fmt(km)} km</td><td class="num">${blockTime(km, s.cruiseKmh)}</td><td class="bar-cell"><span class="bar" style="--w:${pct.toFixed(1)}%"></span><span class="sr-only">${pct.toFixed(0)}% of range</span></td></tr>`;
  }).join('');
  return {
    id: a.id, code: a.code, name: esc(a.name), title: esc(a.title), role: esc(a.role), subtitle: esc(a.subtitle),
    tagline: esc(a.tagline), desc: esc(a.desc), tag: esc(a.tag), tagClass: a.tagClass,
    reg: a.reg, eis: a.eis,
    designator: esc(a.code.replace('ULR', ' ULR')),
    keySpecs: a.keySpecs.map(k => {
      const n = parseFloat(k.val.replace(/,/g, ''));
      return `<div class="kspec reveal"><div class="kspec-val"><span data-count="${n}" data-format="${k.val.includes(',') ? 'comma' : ''}">${k.val}</span><span class="kspec-unit">${k.unit}</span></div><div class="kspec-key">${k.key}</div></div>`;
    }).join(''),
    features: a.features.map(f => `<li>${esc(f)}</li>`).join(''),
    specGroups: specRows,
    seatSvg: sm.svg, seatLegend: sm.legend, seatTotal: sm.total, cabinLabel: esc(a.cabin.label),
    cabinExtra: a.cabin.extra ? `<p class="cabin-extra">${esc(a.cabin.extra)}</p>` : '',
    routes,
    hotspotList: a.hotspots.map((h, k) => `<li><button type="button" class="hotspot-item" data-hotspot="${k}"><span class="hs-num">${String(k + 1).padStart(2, '0')}</span><span><b>${esc(h.title)}</b><small>${esc(h.text)}</small></span></button></li>`).join(''),
    prevId: prev.id, prevName: esc(prev.name), prevRole: esc(prev.role),
    nextId: next.id, nextName: esc(next.name), nextRole: esc(next.role),
    rangeKm: fmt(s.rangeKm), seats: s.seats
  };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

function walk(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.html') ? [p] : []);
  });
}

function parse(src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) return { meta: {}, body: src };
  return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
}

function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
}

const written = [];
function emit(outPath, meta, body) {
  const depth = outPath.split('/').length - 1;
  const root = meta.is404 ? '' : '../'.repeat(depth);
  const html = layout({ meta, body: fill(body, { root, year: SITE.year, fleetCount: FLEET.length }), root, path: outPath });
  const abs = join(ROOT, outPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, html);
  written.push({ path: outPath, meta });
}

// Shared fragments available to pages as {{fleetCards}}, {{compareTable}} etc.
function fragments(root) {
  const fleetCards = FLEET.map(a => `
    <a class="fleet-card${a.flagship ? ' featured' : ''} reveal" href="${root}fleet/${a.id}.html" data-tilt>
      <span class="fleet-designator" aria-hidden="true">${esc(a.code.replace('ULR', ' ULR'))}</span>
      <img class="fleet-img" src="${root}assets/img/fleet/${a.id}-34.webp" alt="${esc(a.name)} rendered in BAC livery" loading="lazy" width="1280" height="720">
      <span class="fleet-card-body">
        <span class="fleet-name-row"><span class="fleet-name">${esc(a.name)}</span><span class="fleet-tag ${a.tagClass}">${esc(a.tag)}</span></span>
        <span class="fleet-role">${esc(a.role)}</span>
        <span class="fleet-specs">
          <span><b>${fmt(a.specs.seats)}</b><small>Max seats</small></span>
          <span><b>${fmt(a.specs.rangeKm)}<i>km</i></b><small>Range</small></span>
          ${a.flagship ? `<span><b>${a.specs.enduranceH}<i>h</i></b><small>Max flight time</small></span><span><b>${a.specs.engines}</b><small>Engines</small></span>` : ''}
        </span>
        <span class="fleet-more">Explore <span aria-hidden="true">→</span></span>
      </span>
    </a>`).join('');
  const maxRange = Math.max(...FLEET.map(a => a.specs.rangeKm));
  const maxSeats = Math.max(...FLEET.map(a => a.specs.seats));
  const maxLen = Math.max(...FLEET.map(a => a.specs.lengthM));
  const bars = (key, max, unit, f = fmt) => FLEET.map(a => `<li><span class="cbar-name">${esc(a.name)}</span><span class="cbar-track"><span class="cbar" style="--w:${(a.specs[key] / max * 100).toFixed(1)}%"></span></span><span class="cbar-val">${f(a.specs[key])}${unit}</span></li>`).join('');
  const compareBars = `
    <div class="compare-col reveal"><h3 class="label-mono">Range</h3><ul class="cbars">${bars('rangeKm', maxRange, ' km')}</ul></div>
    <div class="compare-col reveal"><h3 class="label-mono">Max seats</h3><ul class="cbars">${bars('seats', maxSeats, '')}</ul></div>
    <div class="compare-col reveal"><h3 class="label-mono">Length</h3><ul class="cbars">${bars('lengthM', maxLen, ' m', v => v)}</ul></div>`;
  const rows = [
    ['Role', a => esc(a.role.split('·')[0].trim())],
    ['Max seats', a => fmt(a.specs.seats)],
    ['Typical seats', a => fmt(a.specs.typicalSeats)],
    ['Range', a => `${fmt(a.specs.rangeKm)} km`],
    ['Cruise', a => `Mach ${a.specs.mach.toFixed(2)}`],
    ['Length', a => `${a.specs.lengthM} m`],
    ['Wingspan', a => `${a.specs.spanM} m`],
    ['Height', a => `${a.specs.heightM} m`],
    ['MTOW', a => `${fmt(a.specs.mtowKg)} kg`],
    ['Engines', a => `${a.specs.engines} × ${a.specs.thrustKn} kN`],
    ['Cabin width', a => `${a.specs.cabinWidthM.toFixed(2)} m`],
    ['Entry into service', a => a.eis]
  ];
  const compareTable = `<div class="table-wrap reveal"><table class="compare-table">
      <thead><tr><th scope="col"><span class="sr-only">Specification</span></th>${FLEET.map(a => `<th scope="col"><a href="${root}fleet/${a.id}.html">${esc(a.name)}</a></th>`).join('')}</tr></thead>
      <tbody>${rows.map(([k, f]) => `<tr><th scope="row">${k}</th>${FLEET.map(a => `<td>${f(a)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  const hangarTabs = FLEET.map((a, i) => `<button type="button" role="tab" class="hangar-tab" id="tab-${a.id}" data-id="${a.id}" aria-selected="${a.flagship ? 'true' : 'false'}" tabindex="${a.flagship ? 0 : -1}"><img src="${root}assets/img/fleet/${a.id}-side.webp" alt="" width="640" height="200" loading="lazy"><span>${esc(a.code)}</span></button>`).join('');
  const brochureSheets = FLEET.map((a, i) => `
  <section class="sheet sheet-ac${a.flagship ? ' flagship' : ''}">
    <div class="sheet-num">${String(i + 2).padStart(2, '0')}</div>
    <div class="sheet-ac-head">
      <span class="section-label">${esc(a.role)}</span>
      <h2>${esc(a.name)}</h2>
      <p class="sheet-tag">${esc(a.tagline)}</p>
    </div>
    <img class="sheet-img" src="${root}assets/img/fleet/${a.id}-34.webp" alt="${esc(a.name)}">
    <img class="sheet-side" src="${root}assets/img/fleet/${a.id}-side.webp" alt="">
    <div class="sheet-specs">
      ${[['Max seats', fmt(a.specs.seats)], ['Typical seats', fmt(a.specs.typicalSeats)], ['Range', fmt(a.specs.rangeKm) + ' km'], ['Cruise', 'Mach ' + a.specs.mach.toFixed(2)], ['Length', a.specs.lengthM + ' m'], ['Wingspan', a.specs.spanM + ' m'], ['MTOW', fmt(a.specs.mtowKg) + ' kg'], ['Engines', a.specs.engines + ' × ' + a.specs.thrustKn + ' kN'], ['Entry into service', a.eis]].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </div>
    <ul class="sheet-features">${a.features.slice(0, 6).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  </section>`).join('');
  return { fleetCards, compareBars, compareTable, hangarTabs, brochureSheets };
}

// 1) regular pages
for (const file of walk(join(ROOT, 'src/pages'))) {
  const rel = relative(join(ROOT, 'src/pages'), file).split('\\').join('/');
  const { meta, body } = parse(readFileSync(file, 'utf8'));
  const out = meta.out || rel;
  const depth = out.split('/').length - 1;
  const root = meta.is404 ? '' : '../'.repeat(depth);
  emit(out, meta, fill(body, fragments(root)));
}

// 2) aircraft pages
const tpl = parse(readFileSync(join(ROOT, 'src/templates/aircraft.html'), 'utf8'));
FLEET.forEach((a, i) => {
  const v = aircraftVars(a, i);
  const meta = {
    ...tpl.meta,
    title: a.name,
    description: `${a.name}: ${a.tagline} ${fmt(a.specs.seats)} seats, ${fmt(a.specs.rangeKm)} km range. Explore it in 3D.`,
    ogImage: `assets/img/fleet/${a.id}-og.jpg`,
    bodyClass: `page-aircraft${a.flagship ? ' is-flagship' : ''}`
  };
  emit(`fleet/${a.id}.html`, meta, fill(fill(tpl.body, v), fragments('../')));
});

// 3) sitemap
const urls = written.filter(w => !w.meta.noindex && !w.meta.is404).map(w => SITE.url + w.path.replace(/index\.html$/, ''));
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}sitemap.xml\n`);

console.log(`Built ${written.length} pages:\n` + written.map(w => '  ' + w.path).join('\n'));
void posix;
