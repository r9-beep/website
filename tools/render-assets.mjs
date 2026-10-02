// Renders every image asset from the live 3D models, plus the brochure PDF.
// Requires Playwright (npm i -D playwright) and Python 3 with Pillow (pip install pillow).
// Usage: node tools/render-assets.mjs [--pdf]   (run `node tools/build.mjs` first; --pdf re-prints only the brochure)
import http from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLEET } from '../assets/js/data/fleet.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, '.render-tmp');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });
await mkdir(join(ROOT, 'assets/img/fleet'), { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function shot(path, out, w, h, { transparent = false, wait = 0, css = '', scale = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  page.on('pageerror', e => console.error('  pageerror', path, e.message));
  await page.goto(BASE + path, { waitUntil: 'load' });
  if (css) await page.addStyleTag({ content: css });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(wait + 400);
  await page.screenshot({ path: join(TMP, out), omitBackground: transparent, timeout: 180000 });
  await page.close();
  console.log('  ✓', out);
}

const pdfOnly = process.argv.includes('--pdf');
if (!pdfOnly) {
console.log('Rendering aircraft…');
for (const a of FLEET) {
  await shot(`tools/render.html?id=${a.id}&view=34&bg=transparent&margin=1.0&lights=0.4`, `${a.id}-34.png`, 1920, 1080, { transparent: true });
  await shot(`tools/render.html?id=${a.id}&view=side&bg=transparent&margin=1.0&lights=0.3&fov=20`, `${a.id}-side.png`, 1920, 600, { transparent: true });
  await shot(`tools/og.html?id=${a.id}`, `${a.id}-og.png`, 1200, 630);
}

console.log('Rendering hero frames…');
const hideOverlays = '[data-hero-layer],.hero-shade,.site-nav,.story,.story-progress,.curtain,.skip-link{display:none!important} body::after{display:none!important}';
await shot('index.html', 'hero-dusk.png', 1920, 1080, { wait: 5000, css: hideOverlays });
await shot('index.html', 'og.png', 1200, 630, { wait: 5500, css: '.curtain,.scroll-cue,.hud{display:none!important}' });

console.log('Rendering icons…');
for (const [size, name, pad] of [[32, 'favicon.png', 0], [180, 'apple-touch-icon.png', 0.14], [192, 'icon-192.png', 0.12], [512, 'icon-512.png', 0.12]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = await readFile(join(ROOT, 'favicon.svg'), 'utf8');
  await page.setContent(`<body style="margin:0;background:${pad ? '#0A0E1A' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px"><div style="width:${size * (1 - pad * 2)}px;height:${size * (1 - pad * 2)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await page.screenshot({ path: join(TMP, name), omitBackground: !pad });
  await page.close();
  console.log('  ✓', name);
}

console.log('Optimising…');
execFileSync('python3', [join(ROOT, 'tools/optimise-images.py'), TMP, ROOT], { stdio: 'inherit' });
}

// The brochure uses the optimised images, so it is printed last.
console.log('Printing brochure PDF…');
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(BASE + 'brochure/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.pdf({ path: join(ROOT, 'assets/BAC-Fleet-Brochure.pdf'), printBackground: true, preferCSSPageSize: true });
  await page.close();
  console.log('  ✓ assets/BAC-Fleet-Brochure.pdf');
}


await browser.close();
server.close();
await rm(TMP, { recursive: true, force: true });
console.log('Done.');
