# MNC Simulator

A browser strategy game: found a multinational company on a **to-scale world map**, claim real-world resources, build plants across 16 industries and ship everything around the globe by sea and air — from timber all the way to quantum computers.

No build step, no dependencies — plain HTML and JavaScript modules, ready for GitHub Pages.

## Play

- **Online:** turn on GitHub Pages for this branch (Settings → Pages → source: this branch, root). The game is the site’s home page.
- **Locally:** run `npm run serve` (or any static server) and open http://localhost:8080. It must be served — opening `index.html` straight from disk blocks the JS modules.

## What’s in it

- **Real world, real distances.** Natural Earth country outlines on an equirectangular map with a km scale bar. Ships path-find through real water on a 0.5° grid — Suez, Panama, Gibraltar, Hormuz, Malacca and the rest are carved in — so Southampton → Shanghai is ~19,200 km via Suez and ~24,500 km round the Cape when the canal is blocked. Aircraft fly great circles.
- **68 real cities and their resources:** Ghawar oil, Pilbara iron ore, Atacama copper and lithium, Congo cobalt, Spruce Pine quartz, Odesa neon, Qatari helium, Olympic Dam uranium, Bayan Obo rare earths… plus local industry bonuses (Port Talbot steel, Hsinchu chips, Veldhoven EUV, Ulsan shipyards, Bengaluru software, Bristol and Toulouse aerospace).
- **92 products in 16 industries:** mining, oil & gas, energy, farming, food, forestry, marine, metals, chemicals, materials, consumer, electronics, automotive, aerospace, defence and software.
  - Farms run 35% harder with fertiliser on site.
  - Cargo ships and airliners you build can be commissioned into your own fleet.
  - Chip fabs need EUV machines delivered before they can be built.
  - Software is digital — no warehouse space, no shipping.
- **Logistics:** six ship and aircraft types on two-stop routes with per-stop loading lists, fuel and running costs.
- **Markets:** ten regions with their own prices; selling a lot pushes the local price down, buying pushes it up.
- **Six AI rivals** claim deposits, build plants, flood markets and make offers for your operations — buy them out if you can afford it.
- **Research tree** (28 projects), **25 goals** with cash rewards, and **world events**: canal blockages, oil shocks, chip shortages, droughts, rearmament drives, tariffs and booms.
- Win at **$1B net worth**; spend 45 days overdrawn and the administrators take over. Saves to the browser.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell and styles |
| `game.js` | Map rendering, panels, input |
| `sim.js` | Economy, production, vehicles, rivals, events, goals |
| `data.js` | Goods, recipes, cities, research, vehicles, rivals |
| `sea.js` | Sea routing (A* on the land mask) and great-circle flights |
| `world.js` | Country outlines (Natural Earth 1:50m via world-atlas) |
| `land-mask.js` | 0.5° land/sea bitmask used for routing |
