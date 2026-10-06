# British Aircraft Corporation — website

A multi-page, fully static website for the (fictional) revived **British Aircraft Corporation**, built to be hosted free on **GitHub Pages**.

Every aircraft you see is a real-time 3D model generated in code — no downloaded models, no build step needed to host it.

**What the models do:** section-lofted wings and tail with real hinged **flaps, slats, ailerons, elevators and rudder** (they deploy and run a control check in the hangar), an **undercarriage that retracts and extends** with doors and oleo struts, scimitar-bladed turbofans with spinner swirls, guide vanes and visible turbines, and a livery painted into four matching layers (colour, cabin-light glow, panel-line normal map, roughness/metalness). In the hangar they're lit by a softbox studio with **ambient occlusion, bloom and self-shadowing**; the viewer measures its own frame rate and steps quality down on slower machines (add `?hq` to a page URL to force full quality).

**Live (once Pages is switched on):** https://r9-beep.github.io/website/

## What's inside

| Page | Highlights |
| --- | --- |
| **Home** (`/`) | Scroll-driven 3D flight of the 4-44ULR above the clouds — dusk turns to night as you scroll, contrails, nav/strobe lights, glowing cabin windows. Fleet cards, programme ticker, mini 3D globe. |
| **Fleet** (`/fleet/`) | 3D hangar: switch aircraft, orbit/zoom, retract/extend the gear, deploy flaps and slats, night mode (bloom on every light and window), X-ray mode, and a to-scale line-up of all five. Animated comparison bars and full spec table. |
| **Aircraft** (`/fleet/<id>.html`) | One page per aircraft: 3D viewer with clickable hotspots, key specs, generated cabin seat map, spec sheet, sample missions with real great-circle distances. |
| **Engineering** (`/engineering/`) | Interactive cutaway turbofan (fan, booster, HP compressor, combustor, turbines) with a spool-up slider, manufacturing map of the UK, sustainability roadmap. |
| **Range** (`/range/`) | Dotted 3D globe (Natural Earth data). Pick an aircraft and a hub to see its range ring, reachable cities and animated great-circle routes; route checker. |
| **Heritage** (`/heritage/`) | Scroll-tracked timeline from Filton 1910 to the 4-44ULR, plus One-Eleven "then & now". |
| **Newsroom**, **Careers**, **Contact** | Filterable press releases + media kit, filterable job board, validated order-enquiry form and FAQ. |
| **MNC Simulator** (`/mnc/`) | A standalone strategy game on a to-scale Natural Earth world map: found a multinational, claim real-world resource deposits (Ghawar oil, Pilbara iron ore, Atacama lithium, Spruce Pine quartz…), build plants across 16 industries from timber and farming to defence, aerospace, software and quantum computers, and run ships along real sea lanes (Suez, Panama, the straits) and aircraft on great circles. Six AI rivals compete for deposits and markets; world events close canals and move prices. Saves to the browser. |
| **404** | A holding-pattern radar animation. |
| **Brochure** | `assets/BAC-Fleet-Brochure.pdf` — an 8-page A4 PDF generated from `/brochure/`. |

Everything is responsive, keyboard accessible, respects `prefers-reduced-motion`, pauses 3D when off-screen, and falls back to rendered images where WebGL isn't available.

## Launch it on GitHub Pages

1. Push this repository to GitHub (already done if you're reading this on GitHub).
2. On GitHub open **Settings → Pages**.
3. Under **Build and deployment → Source** choose **Deploy from a branch**.
4. Pick the branch that holds these files (e.g. `main`) and the **`/ (root)`** folder, then **Save**.
5. After a minute or two the site is live at `https://<your-username>.github.io/<repo-name>/`.

No build or Actions workflow is needed — the generated HTML is committed. `.nojekyll` tells Pages to serve the files as-is.

> **Different URL?** If you rename the repo or use a custom domain, change `SITE.url` at the top of `tools/build.mjs` and run `node tools/build.mjs`. That updates canonical/share links, the sitemap and the 404 page's base path.

## Preview locally

ES modules need a web server (opening `index.html` from disk won't work):

```bash
npx http-server -c-1 .      # then open http://localhost:8080
# or
python3 -m http.server 8080
```

## Editing content

The HTML at the repo root is **generated**. Edit the sources, then rebuild:

```bash
node tools/build.mjs
```

- `src/pages/**` — page bodies (a small JSON header sets title, description, scripts).
- `src/templates/aircraft.html` — the template for all five aircraft pages.
- `assets/js/data/fleet.js` — **single source of truth** for every aircraft: specs, descriptions, features, cabin layouts, hotspots, sample routes and the 3D geometry parameters (length, span, sweep, engines, winglets…). Change a number here and the 3D model, pages, tables and globe all follow.
- `assets/css/main.css` — the design system.
- `tools/build.mjs` — shared head, navigation and footer.

### Regenerating images and the PDF brochure

Card images, share images, icons, the hero still and the brochure are rendered from the live 3D models:

```bash
npm i -D playwright && npx playwright install chromium
pip install pillow
node tools/build.mjs && node tools/render-assets.mjs        # everything
node tools/render-assets.mjs --pdf                          # just the brochure
```

### Making the enquiry form send email

GitHub Pages can't run server code, so the form runs in demo mode by default (it validates and thanks the visitor, but sends nothing). To receive enquiries, create a free form endpoint (e.g. [Formspree](https://formspree.io)), then add it to the form in `src/pages/contact/index.html`:

```html
<form class="form" data-enquiry data-endpoint="https://formspree.io/f/your-id" novalidate>
```

and rebuild.

## Project structure

```
index.html, fleet/, engineering/, range/, heritage/, news/, careers/, contact/, brochure/, 404.html   ← generated pages
assets/
  css/        main.css, fonts.css, brochure.css
  fonts/      self-hosted Cormorant Garamond, Inter, IBM Plex Mono (woff2)
  img/        rendered fleet images, share images, icons
  js/
    data/     fleet.js (aircraft + airports), land-mask.js (globe land data)
    lib/      aircraft.js (procedural airliner), sky.js, globe.js, viewer.js, post.js, engine.js, stage.js
    pages/    one script per page
    vendor/   three.js (bundled, with OrbitControls etc.)
src/          page sources + aircraft template
tools/        build.mjs, render-assets.mjs, render.html, og.html, optimise-images.py
```

## Credits

- 3D: [three.js](https://threejs.org) r186 (MIT), bundled in `assets/js/vendor/three.js`.
- Fonts: Cormorant Garamond, Inter, IBM Plex Mono — SIL Open Font License, via Fontsource.
- Map data: [Natural Earth](https://www.naturalearthdata.com) (public domain) via `world-atlas`.

*British Aircraft Corporation (2024) is a design concept. Aircraft, people, customers and programme milestones from 2024 onwards are fictional; historic references are to the original BAC (1960–1977) and its predecessors. All specifications provisional.*
