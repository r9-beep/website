// Static game data: goods, recipes, real-world sites, research, vehicles, rivals.

// ---------- Goods ----------
// Raw goods carry a hand-set base price; everything else is priced from its recipe.
// [id, name, icon, price, sector, agri?]
const RAW = [
  ['timber', 'Timber', '🌲', 40, 'forestry'], ['iron_ore', 'Iron Ore', '🪨', 55, 'mining'], ['coal', 'Coal', '⚫', 45, 'mining'],
  ['crude', 'Crude Oil', '🛢️', 80, 'oil'], ['gas', 'Natural Gas', '🔥', 50, 'oil'], ['copper_ore', 'Copper Ore', '🟤', 90, 'mining'],
  ['bauxite', 'Bauxite', '🟫', 40, 'mining'], ['silica', 'Quartz Sand', '🏜️', 30, 'mining'], ['rare_earths', 'Rare Earths', '💠', 250, 'mining'],
  ['lithium', 'Lithium', '⚗️', 260, 'mining'], ['cobalt', 'Cobalt', '🔷', 300, 'mining'], ['gold', 'Gold', '🥇', 900, 'mining'],
  ['uranium', 'Uranium', '☢️', 600, 'energy'], ['neon', 'Neon Gas', '💡', 300, 'oil'], ['helium', 'Helium', '🎈', 450, 'oil'],
  ['wheat', 'Wheat', '🌾', 30, 'farming', true], ['cotton', 'Cotton', '☁️', 60, 'farming', true], ['rubber', 'Natural Rubber', '🌿', 70, 'farming', true],
  ['soybeans', 'Soybeans', '🌱', 35, 'farming', true], ['cattle', 'Cattle', '🐄', 120, 'farming', true], ['sugarcane', 'Sugarcane', '🎋', 20, 'farming', true],
  ['coffee', 'Coffee Beans', '☕', 150, 'farming', true], ['cocoa', 'Cocoa', '🌰', 160, 'farming', true], ['palm_oil', 'Palm Oil', '🌴', 60, 'farming', true],
  ['fish', 'Fish', '🐟', 80, 'marine']
];

// [id, name, icon, inputs, outQty, plant, sector]
const MADE = [
  // Tier 1
  ['lumber', 'Lumber', '🪵', { timber: 3 }, 2, 'Sawmill', 'forestry'],
  ['paper', 'Paper', '📄', { timber: 2 }, 1, 'Paper Mill', 'forestry'],
  ['steel', 'Steel', '⛓️', { iron_ore: 2, coal: 1 }, 1, 'Steelworks', 'metals'],
  ['aluminium', 'Aluminium', '🔘', { bauxite: 3, gas: 1 }, 1, 'Smelter', 'metals'],
  ['copper', 'Refined Copper', '🟠', { copper_ore: 2, coal: 1 }, 1, 'Smelter', 'metals'],
  ['petrol', 'Petrol', '⛽', { crude: 3 }, 2, 'Refinery', 'oil'],
  ['diesel', 'Diesel', '🫗', { crude: 3 }, 2, 'Refinery', 'oil'],
  ['jet_fuel', 'Jet Fuel', '♨️', { crude: 2 }, 1, 'Refinery', 'oil'],
  ['lubricants', 'Lubricants', '💧', { crude: 2 }, 1, 'Refinery', 'oil'],
  ['lng', 'LNG', '❄️', { gas: 3 }, 2, 'LNG Terminal', 'energy'],
  ['plastics', 'Plastics', '🧴', { crude: 1, gas: 1 }, 1, 'Cracker', 'chemicals'],
  ['fertiliser', 'Fertiliser', '🧪', { gas: 2 }, 1, 'Ammonia Plant', 'chemicals'],
  ['glass', 'Glass', '🪟', { silica: 2, gas: 1 }, 1, 'Glassworks', 'materials'],
  ['polysilicon', 'Polysilicon', '🔳', { silica: 3, coal: 1 }, 1, 'Polysilicon Plant', 'electronics'],
  ['textiles', 'Textiles', '🧵', { cotton: 2 }, 1, 'Textile Mill', 'consumer'],
  ['flour', 'Flour', '🥣', { wheat: 2 }, 1, 'Flour Mill', 'food'],
  ['animal_feed', 'Animal Feed', '🌽', { soybeans: 2 }, 1, 'Feed Mill', 'food'],
  ['sugar', 'Sugar', '🍬', { sugarcane: 4 }, 1, 'Sugar Refinery', 'food'],
  ['seafood', 'Frozen Seafood', '🦐', { fish: 2 }, 1, 'Fish Processing', 'marine'],
  ['coffee_roast', 'Roasted Coffee', '🫖', { coffee: 2 }, 1, 'Roastery', 'food'],
  ['biofuel', 'Biodiesel', '🌻', { palm_oil: 2 }, 1, 'Biorefinery', 'energy'],
  ['nuclear_fuel', 'Nuclear Fuel Rods', '⚡', { uranium: 2 }, 1, 'Fuel Fabrication', 'energy'],
  // Tier 2
  ['furniture', 'Furniture', '🪑', { lumber: 3, textiles: 1 }, 1, 'Furniture Workshop', 'consumer'],
  ['steel_beams', 'Steel Beams', '🏗️', { steel: 2 }, 1, 'Rolling Mill', 'metals'],
  ['copper_wire', 'Copper Wire', '➰', { copper: 1, plastics: 1 }, 2, 'Wire Works', 'electronics'],
  ['wafers', 'Silicon Wafers', '💿', { polysilicon: 2 }, 1, 'Crystal Plant', 'electronics'],
  ['pcb', 'Circuit Boards', '🟩', { copper: 1, plastics: 1, glass: 1 }, 1, 'PCB Plant', 'electronics'],
  ['batteries', 'Battery Cells', '🔋', { lithium: 2, cobalt: 1, aluminium: 1 }, 1, 'Gigafactory', 'energy'],
  ['tyres', 'Tyres', '🛞', { rubber: 2, steel: 1 }, 1, 'Tyre Plant', 'automotive'],
  ['engines', 'Combustion Engines', '⚙️', { steel: 3, aluminium: 2, lubricants: 1 }, 1, 'Engine Plant', 'automotive'],
  ['clothing', 'Clothing', '👕', { textiles: 2 }, 1, 'Garment Factory', 'consumer'],
  ['food', 'Packaged Food', '🍱', { flour: 2, plastics: 1 }, 2, 'Food Plant', 'food'],
  ['meat', 'Meat', '🥩', { cattle: 1, animal_feed: 1 }, 2, 'Meatpacking Plant', 'food'],
  ['chocolate', 'Chocolate', '🍫', { cocoa: 2, sugar: 1 }, 1, 'Confectionery', 'food'],
  ['optics', 'Precision Optics', '🔍', { glass: 3 }, 1, 'Optics Lab', 'electronics'],
  ['solar_panels', 'Solar Panels', '☀️', { polysilicon: 2, glass: 2, aluminium: 1 }, 1, 'Solar Plant', 'energy'],
  ['ammunition', 'Ammunition', '💥', { steel: 2, copper: 1, fertiliser: 1 }, 4, 'Munitions Works', 'defence'],
  ['auto_parts', 'Auto Parts', '🔧', { steel: 2, aluminium: 1, plastics: 1 }, 1, 'Parts Plant', 'automotive'],
  // Tier 3
  ['lasers', 'Lasers', '🔦', { neon: 1, optics: 1, copper_wire: 1 }, 1, 'Photonics Lab', 'electronics'],
  ['motors', 'Electric Motors', '🌀', { copper_wire: 2, steel: 1, rare_earths: 1 }, 1, 'Motor Works', 'electronics'],
  ['processors', 'Processors', '🧠', { wafers: 2, copper_wire: 2, gold: 1 }, 6, 'Chip Fab', 'electronics'],
  ['memory', 'Memory Chips', '💾', { wafers: 1, plastics: 1 }, 2, 'Chip Fab', 'electronics'],
  ['jet_engines', 'Jet Engines', '💨', { aluminium: 6, steel: 4, pcb: 2 }, 1, 'Engine Works', 'aerospace'],
  ['petrol_cars', 'Petrol Cars', '🚙', { engines: 1, auto_parts: 3, tyres: 4, glass: 2, steel: 4 }, 1, 'Car Plant', 'automotive'],
  ['trucks', 'Trucks', '🚚', { engines: 2, auto_parts: 6, tyres: 6, steel_beams: 2 }, 1, 'Truck Plant', 'automotive'],
  ['tractors', 'Tractors', '🚜', { engines: 1, steel: 6, tyres: 4 }, 1, 'Tractor Works', 'farming'],
  ['cargo_ships', 'Cargo Ships', '🛳️', { steel_beams: 40, engines: 4, pcb: 4 }, 1, 'Shipyard', 'marine'],
  // Tier 4
  ['euv', 'EUV Lithography Machine', '🔬', { lasers: 6, optics: 10, motors: 4, pcb: 6, steel_beams: 10 }, 1, 'Lithography Works', 'electronics'],
  ['smartphones', 'Smartphones', '📱', { processors: 1, memory: 1, batteries: 1, glass: 1, pcb: 1 }, 1, 'Device Assembly', 'electronics'],
  ['laptops', 'Laptops', '💻', { processors: 1, memory: 2, batteries: 2, pcb: 1, aluminium: 1 }, 1, 'Device Assembly', 'electronics'],
  ['servers', 'Servers', '🗄️', { processors: 4, memory: 8, pcb: 2, steel: 1 }, 1, 'Server Plant', 'electronics'],
  ['cars', 'Electric Cars', '🚗', { auto_parts: 4, batteries: 6, motors: 2, tyres: 4, glass: 2, processors: 1 }, 1, 'EV Plant', 'automotive'],
  ['wind_turbines', 'Wind Turbines', '🌬️', { steel_beams: 6, motors: 2, plastics: 6 }, 1, 'Turbine Works', 'energy'],
  ['smr', 'Small Modular Reactor', '🏭', { steel_beams: 30, nuclear_fuel: 20, pcb: 10, motors: 6 }, 1, 'Reactor Works', 'energy'],
  ['offshore_rigs', 'Offshore Rigs', '🗼', { steel_beams: 40, motors: 6, pcb: 6, engines: 4 }, 1, 'Rig Yard', 'oil'],
  ['airliners', 'Airliners', '✈️', { jet_engines: 2, aluminium: 30, processors: 6, plastics: 10, textiles: 10 }, 1, 'Aircraft Plant', 'aerospace'],
  ['helicopters', 'Helicopters', '🚁', { jet_engines: 1, aluminium: 8, processors: 2, motors: 2 }, 1, 'Rotorcraft Plant', 'aerospace'],
  ['satellites', 'Satellites', '🛰️', { processors: 6, batteries: 4, optics: 4, aluminium: 8, lasers: 2 }, 1, 'Space Systems', 'aerospace'],
  ['rockets', 'Launch Rockets', '🚀', { aluminium: 30, processors: 8, motors: 6, jet_fuel: 40 }, 1, 'Rocket Factory', 'aerospace'],
  ['drones', 'Drones', '🛸', { processors: 2, batteries: 2, motors: 4, plastics: 2, optics: 1 }, 1, 'Drone Works', 'defence'],
  ['missiles', 'Missiles', '☄️', { processors: 2, optics: 1, jet_fuel: 4, aluminium: 2 }, 1, 'Missile Plant', 'defence'],
  ['armoured_vehicles', 'Armoured Vehicles', '🛡️', { steel_beams: 8, engines: 2, tyres: 6, processors: 2 }, 1, 'Armour Works', 'defence'],
  ['fighter_jets', 'Fighter Jets', '🛩️', { jet_engines: 2, aluminium: 15, processors: 10, lasers: 2, optics: 4 }, 1, 'Combat Aircraft Plant', 'defence'],
  ['warships', 'Warships', '⚓', { steel_beams: 60, engines: 6, processors: 10, lasers: 4 }, 1, 'Naval Yard', 'defence'],
  ['quantum', 'Quantum Computers', '⚛️', { processors: 20, lasers: 8, optics: 8, helium: 12, motors: 4, gold: 6 }, 1, 'Quantum Lab', 'electronics'],
  // Tier 5–6: software is digital — no warehouse space, can’t be shipped, sold where it’s made.
  ['software', 'Enterprise Software', '🖥️', { laptops: 1, servers: 1 }, 30, 'Software Studio', 'software'],
  ['ai_models', 'AI Models', '🤖', { servers: 6, software: 20, processors: 30 }, 1, 'AI Lab', 'software']
];

export const SECTORS = {
  mining: 'Mining', oil: 'Oil & Gas', energy: 'Energy', farming: 'Farming', food: 'Food', forestry: 'Forestry', marine: 'Marine',
  metals: 'Metals', chemicals: 'Chemicals', materials: 'Materials', consumer: 'Consumer', electronics: 'Electronics',
  automotive: 'Automotive', aerospace: 'Aerospace', defence: 'Defence', software: 'Software'
};

const MARKUP = [1, 1.6, 1.6, 1.7, 1.8, 1.9, 2];

export const GOODS = {};
for (const [id, name, icon, price, sector, agri] of RAW) GOODS[id] = { id, name, icon, tier: 0, price, raw: true, sector, agri: !!agri };
for (const [id, name, icon, inputs, out, family, sector] of MADE) {
  let tier = 0, cost = 0;
  for (const [g, q] of Object.entries(inputs)) { tier = Math.max(tier, GOODS[g].tier); cost += GOODS[g].price * q; }
  tier += 1;
  const price = Math.round(cost * MARKUP[tier] / out);
  GOODS[id] = { id, name, icon, tier, price, inputs, out, family, sector, digital: sector === 'software' };
}
export const GOOD_IDS = Object.keys(GOODS);

// Market depth: how many units a region absorbs per day before prices sag noticeably.
export const depth = g => Math.max(1.5, 7000 / Math.pow(GOODS[g].price, 0.62)) * (GOODS[g].digital ? 4 : 1);

// Plant throughput: the $ value of output a level-1 plant makes per day, by tier.
export const TIER_OUTPUT = [0, 14000, 40000, 120000, 300000, 600000, 1200000];
export const cyclesPerDay = g => TIER_OUTPUT[GOODS[g].tier] / (GOODS[g].price * GOODS[g].out);

// Build & running costs ($) by tier (0 = extractor).
export const BUILD_COST = [450000, 900000, 2400000, 7000000, 18000000, 30000000, 60000000];
export const UPKEEP = [500, 1000, 2500, 6000, 15000, 30000, 60000];
// Some plants need capital equipment delivered to the site before they can be built.
export const EQUIPMENT = {
  processors: { euv: 3 }, memory: { euv: 2 }, quantum: { euv: 2 }, euv: { steel_beams: 40 },
  airliners: { steel_beams: 60 }, cars: { steel_beams: 30 }, petrol_cars: { steel_beams: 20 }, trucks: { steel_beams: 20 },
  cargo_ships: { steel_beams: 80 }, warships: { steel_beams: 80 }, offshore_rigs: { steel_beams: 60 }, smr: { steel_beams: 50 },
  rockets: { steel_beams: 40 }, fighter_jets: { steel_beams: 40 },
  software: { laptops: 50 }, ai_models: { servers: 100, quantum: 1 }
};
// Finished goods that can be put into service as part of your own fleet.
export const COMMISSION = { cargo_ships: 'bulker', airliners: 'widebody' };
// Fertiliser on site lifts every farm extractor there.
export const FERTILISER_BOOST = 0.35, FERTILISER_USE = 0.08;
export const OFFICE_COST = 300000;
export const STORE_CAP = 6000; // units per warehouse level

// ---------- Regions ----------
const DEF = ['ammunition', 'drones', 'missiles', 'armoured_vehicles', 'fighter_jets', 'warships'];
const def = m => Object.fromEntries(DEF.map(g => [g, m]));
export const REGIONS = {
  NA: { name: 'North America', mult: { petrol: 1.15, cars: 1.15, petrol_cars: 1.1, trucks: 1.2, servers: 1.2, laptops: 1.1, quantum: 1.2, food: 1.1, crude: 0.95, coffee_roast: 1.2, chocolate: 1.15, meat: 1.05, software: 1.3, ai_models: 1.35, rockets: 1.3, ...def(1.15) } },
  SA: { name: 'South America', mult: { copper_ore: 0.85, lithium: 0.85, iron_ore: 0.85, smartphones: 1.15, cars: 1.1, fertiliser: 1.25, tractors: 1.3, soybeans: 0.85, coffee: 0.85, sugarcane: 0.85, cattle: 0.85, diesel: 1.15 } },
  EU: { name: 'Europe', mult: { petrol: 1.3, diesel: 1.3, gas: 1.3, lng: 1.35, crude: 1.15, cars: 1.1, airliners: 1.1, clothing: 1.15, furniture: 1.15, euv: 1.1, coffee: 1.15, coffee_roast: 1.25, chocolate: 1.25, wind_turbines: 1.3, solar_panels: 1.15, nuclear_fuel: 1.2, software: 1.15, ...def(1.2) } },
  ME: { name: 'Middle East', mult: { crude: 0.75, gas: 0.7, petrol: 0.7, diesel: 0.7, food: 1.3, meat: 1.35, sugar: 1.15, steel_beams: 1.3, airliners: 1.25, cars: 1.1, solar_panels: 1.3, smr: 1.2, helicopters: 1.2, ...def(1.4) } },
  AF: { name: 'Africa', mult: { food: 1.3, fertiliser: 1.3, smartphones: 1.2, petrol: 1.1, diesel: 1.2, gold: 0.9, copper_ore: 0.85, cobalt: 0.85, cocoa: 0.85, trucks: 1.25, tractors: 1.3, solar_panels: 1.25, meat: 1.15 } },
  RU: { name: 'Russia & Central Asia', mult: { crude: 0.85, gas: 0.75, timber: 0.85, fish: 0.9, smartphones: 1.15, processors: 1.25, coffee_roast: 1.15, ...def(1.15) } },
  SAS: { name: 'South Asia', mult: { crude: 1.2, petrol: 1.15, diesel: 1.15, smartphones: 1.2, steel: 1.15, cotton: 0.85, food: 1.1, tractors: 1.3, lng: 1.2, software: 0.8, ...def(1.25) } },
  EA: { name: 'East Asia', mult: { iron_ore: 1.2, coal: 1.1, crude: 1.2, gas: 1.25, lng: 1.4, copper_ore: 1.2, lithium: 1.2, cobalt: 1.25, rare_earths: 0.8, euv: 1.3, wafers: 1.15, quantum: 1.1, meat: 1.3, soybeans: 1.3, seafood: 1.25, nuclear_fuel: 1.25, uranium: 1.2, ai_models: 1.2, cargo_ships: 1.1 } },
  SEA: { name: 'Southeast Asia', mult: { rubber: 0.85, palm_oil: 0.8, petrol: 1.1, food: 1.1, smartphones: 1.1, pcb: 1.1, seafood: 1.15, biofuel: 0.9 } },
  OC: { name: 'Oceania', mult: { iron_ore: 0.8, coal: 0.85, lithium: 0.85, uranium: 0.85, cattle: 0.9, cars: 1.15, petrol: 1.15, diesel: 1.2, trucks: 1.2, warships: 1.3 } }
};

// ---------- Cities ----------
// deposits: [good, slots, richness/day at level 1]. bonus: production multipliers.
// port: [lat, lon] for inland cities whose freight leaves from a coast.
const C = (id, name, country, region, lat, lon, o = {}) => ({ id, name, country, region, lat, lon, wage: 1, land: 1, deposits: [], bonus: {}, ...o });
export const CITIES = [
  // Europe
  C('london', 'London', 'United Kingdom', 'EU', 51.507, -0.128, { wage: 1.5, land: 1.6, hq: true, note: 'Finance capital — research runs 15% faster from a London HQ.', bonus: { research: 1.15, software: 1.2 }, port: [51.45, 0.9] }),
  C('porttalbot', 'Port Talbot', 'United Kingdom', 'EU', 51.59, -3.79, { wage: 1.2, land: 0.9, deposits: [['coal', 3, 40]], bonus: { steel: 1.35, steel_beams: 1.3 }, note: 'Historic Welsh steelworks.' }),
  C('teesside', 'Teesside', 'United Kingdom', 'EU', 54.58, -1.2, { wage: 1.15, land: 0.85, deposits: [['iron_ore', 2, 35], ['gas', 1, 30]], bonus: { steel: 1.2, plastics: 1.25, fertiliser: 1.2, wind_turbines: 1.25 } }),
  C('aberdeen', 'Aberdeen', 'United Kingdom', 'EU', 57.15, -2.09, { wage: 1.3, land: 1.0, deposits: [['crude', 3, 40], ['gas', 2, 40], ['fish', 2, 50]], bonus: { offshore_rigs: 1.35, wind_turbines: 1.15 }, note: 'North Sea oil, gas and fishing.' }),
  C('bristol', 'Bristol', 'United Kingdom', 'EU', 51.45, -2.59, { wage: 1.35, land: 1.1, hq: true, bonus: { jet_engines: 1.35, airliners: 1.25, satellites: 1.15, helicopters: 1.2, fighter_jets: 1.2 }, note: 'Filton aerospace cluster.', port: [51.5, -2.75] }),
  C('barrow', 'Barrow-in-Furness', 'United Kingdom', 'EU', 54.11, -3.23, { wage: 1.2, land: 0.8, bonus: { warships: 1.45, cargo_ships: 1.15, smr: 1.2 }, note: 'Britain’s submarine yard.' }),
  C('rotterdam', 'Rotterdam', 'Netherlands', 'EU', 51.92, 4.48, { wage: 1.35, land: 1.2, hq: true, bonus: { petrol: 1.3, diesel: 1.3, jet_fuel: 1.3, plastics: 1.2, lubricants: 1.25 }, note: 'Europe’s largest port and refining hub.', port: [51.98, 4.05] }),
  C('veldhoven', 'Veldhoven', 'Netherlands', 'EU', 51.42, 5.4, { wage: 1.5, land: 1.3, bonus: { euv: 1.6, lasers: 1.25, optics: 1.15 }, note: 'Home of the world’s EUV lithography know-how.', port: [51.98, 4.05] }),
  C('hamburg', 'Hamburg', 'Germany', 'EU', 53.55, 9.99, { wage: 1.45, land: 1.2, hq: true, bonus: { cars: 1.25, petrol_cars: 1.3, engines: 1.3, trucks: 1.2, auto_parts: 1.3, optics: 1.3, motors: 1.2, armoured_vehicles: 1.2 }, note: 'German engineering — cars, optics, machinery.', port: [53.9, 8.7] }),
  C('toulouse', 'Toulouse', 'France', 'EU', 43.6, 1.44, { wage: 1.4, land: 1.1, bonus: { airliners: 1.45, satellites: 1.3, jet_engines: 1.1, helicopters: 1.3, rockets: 1.2 }, note: 'European aerospace capital.', port: [45.6, -1.25] }),
  C('lulea', 'Luleå', 'Sweden', 'EU', 65.58, 22.15, { wage: 1.3, land: 0.7, deposits: [['iron_ore', 3, 55], ['timber', 3, 60]], bonus: { steel: 1.15, paper: 1.3, lumber: 1.2 } }),
  C('stavanger', 'Stavanger', 'Norway', 'EU', 58.97, 5.73, { wage: 1.6, land: 1.1, deposits: [['crude', 3, 45], ['gas', 3, 55], ['fish', 3, 70]], bonus: { aluminium: 1.2, offshore_rigs: 1.3, seafood: 1.3 } }),
  C('odesa', 'Odesa', 'Ukraine', 'EU', 46.48, 30.73, { wage: 0.55, land: 0.5, deposits: [['neon', 2, 22], ['wheat', 3, 80]], bonus: { flour: 1.2, drones: 1.3 }, note: 'Breadbasket — and once half the world’s chip-grade neon.' }),
  // Russia
  C('novorossiysk', 'Novorossiysk', 'Russia', 'RU', 44.72, 37.77, { wage: 0.6, land: 0.6, deposits: [['crude', 3, 45], ['wheat', 2, 70]] }),
  C('murmansk', 'Murmansk', 'Russia', 'RU', 68.97, 33.08, { wage: 0.7, land: 0.5, deposits: [['gas', 3, 60], ['rare_earths', 1, 15], ['fish', 2, 55]], bonus: { lng: 1.25 } }),
  C('vladivostok', 'Vladivostok', 'Russia', 'RU', 43.12, 131.9, { wage: 0.65, land: 0.5, deposits: [['timber', 4, 70], ['coal', 2, 50], ['fish', 2, 55]] }),
  // Middle East
  C('dammam', 'Dammam', 'Saudi Arabia', 'ME', 26.43, 50.1, { wage: 0.9, land: 0.8, hq: true, deposits: [['crude', 4, 75], ['gas', 2, 50]], bonus: { petrol: 1.15, diesel: 1.15, plastics: 1.25, solar_panels: 1.15 }, note: 'Ghawar — the world’s largest oil field.' }),
  C('abudhabi', 'Abu Dhabi', 'United Arab Emirates', 'ME', 24.45, 54.38, { wage: 1.0, land: 0.9, deposits: [['crude', 3, 60]], bonus: { aluminium: 1.35, missiles: 1.15 } }),
  C('dubai', 'Dubai', 'United Arab Emirates', 'ME', 25.2, 55.27, { wage: 1.0, land: 1.2, hq: true, bonus: { research: 1.05 }, note: 'Free-zone trade hub — an HQ here makes offices and vehicles 20% cheaper.' }),
  C('doha', 'Doha', 'Qatar', 'ME', 25.29, 51.53, { wage: 1.0, land: 0.9, deposits: [['gas', 4, 85], ['helium', 2, 14]], bonus: { fertiliser: 1.25, lng: 1.4 }, note: 'North Field gas — and a quarter of world helium.' }),
  C('kuwait', 'Kuwait City', 'Kuwait', 'ME', 29.37, 47.98, { wage: 0.95, land: 0.8, deposits: [['crude', 3, 65]] }),
  C('basra', 'Basra', 'Iraq', 'ME', 30.5, 47.8, { wage: 0.5, land: 0.5, deposits: [['crude', 3, 60]], port: [29.8, 48.75] }),
  C('telaviv', 'Tel Aviv', 'Israel', 'ME', 32.08, 34.78, { wage: 1.5, land: 1.4, hq: true, bonus: { software: 1.35, drones: 1.4, missiles: 1.3, lasers: 1.15, research: 1.1 }, note: 'Start-up nation — software and defence tech.' }),
  // Africa
  C('lagos', 'Lagos', 'Nigeria', 'AF', 6.45, 3.4, { wage: 0.4, land: 0.6, hq: true, deposits: [['crude', 3, 45], ['cotton', 2, 40]] }),
  C('luanda', 'Luanda', 'Angola', 'AF', -8.84, 13.23, { wage: 0.45, land: 0.5, deposits: [['crude', 3, 55], ['fish', 2, 45]], bonus: { diesel: 1.1 } }),
  C('abidjan', 'Abidjan', 'Côte d\'Ivoire', 'AF', 5.32, -4.03, { wage: 0.35, land: 0.5, deposits: [['cocoa', 4, 40], ['palm_oil', 2, 45], ['coffee', 2, 25]], bonus: { chocolate: 1.15 }, note: 'Grows 40% of the world’s cocoa.' }),
  C('johannesburg', 'Johannesburg', 'South Africa', 'AF', -26.2, 28.04, { wage: 0.6, land: 0.6, deposits: [['gold', 3, 12], ['coal', 3, 55]], port: [-29.87, 31.05] }),
  C('walvisbay', 'Walvis Bay', 'Namibia', 'AF', -22.96, 14.5, { wage: 0.5, land: 0.4, deposits: [['uranium', 3, 12], ['fish', 2, 55]] }),
  C('lubumbashi', 'Lubumbashi', 'Dem. Rep. Congo', 'AF', -11.66, 27.48, { wage: 0.3, land: 0.4, deposits: [['copper_ore', 3, 50], ['cobalt', 3, 22]], port: [-6.82, 39.3], note: 'Copperbelt — 70% of the world’s cobalt.' }),
  C('conakry', 'Conakry', 'Guinea', 'AF', 9.6, -13.7, { wage: 0.3, land: 0.4, deposits: [['bauxite', 4, 70]] }),
  C('accra', 'Accra', 'Ghana', 'AF', 5.6, -0.19, { wage: 0.4, land: 0.5, deposits: [['gold', 2, 9], ['timber', 2, 40], ['cocoa', 2, 30]] }),
  C('alexandria', 'Alexandria', 'Egypt', 'AF', 31.2, 29.9, { wage: 0.4, land: 0.5, deposits: [['cotton', 3, 55], ['gas', 2, 40], ['sugarcane', 2, 70]], bonus: { textiles: 1.25 } }),
  // South Asia
  C('mumbai', 'Mumbai', 'India', 'SAS', 19.07, 72.88, { wage: 0.45, land: 0.9, hq: true, deposits: [['cotton', 3, 60], ['sugarcane', 2, 80]], bonus: { textiles: 1.3, clothing: 1.2, petrol: 1.1, diesel: 1.15, tractors: 1.25 } }),
  C('bangalore', 'Bengaluru', 'India', 'SAS', 12.97, 77.59, { wage: 0.55, land: 0.8, hq: true, bonus: { software: 1.55, ai_models: 1.15, satellites: 1.15, research: 1.1 }, note: 'India’s Silicon Valley — cheap, brilliant engineers.', port: [13.08, 80.35] }),
  C('chennai', 'Chennai', 'India', 'SAS', 13.08, 80.27, { wage: 0.45, land: 0.7, deposits: [['silica', 2, 50]], bonus: { cars: 1.15, petrol_cars: 1.2, auto_parts: 1.2, trucks: 1.15 } }),
  C('chittagong', 'Chittagong', 'Bangladesh', 'SAS', 22.33, 91.83, { wage: 0.3, land: 0.4, bonus: { clothing: 1.45, textiles: 1.15 } }),
  // East Asia
  C('shanghai', 'Shanghai', 'China', 'EA', 31.23, 121.47, { wage: 0.8, land: 1.1, hq: true, bonus: { steel: 1.15, pcb: 1.2, batteries: 1.2, cargo_ships: 1.3, solar_panels: 1.4, research: 1.05 } }),
  C('shenzhen', 'Shenzhen', 'China', 'EA', 22.54, 114.06, { wage: 0.75, land: 1.0, bonus: { smartphones: 1.45, laptops: 1.35, pcb: 1.3, batteries: 1.15, drones: 1.45 }, note: 'Electronics assembly capital of the world.' }),
  C('baotou', 'Baotou', 'China', 'EA', 40.65, 109.84, { wage: 0.55, land: 0.5, deposits: [['rare_earths', 4, 30], ['coal', 3, 60]], bonus: { motors: 1.2, wind_turbines: 1.2 }, port: [38.98, 117.85], note: 'Bayan Obo — most of the world’s rare earths.' }),
  C('hsinchu', 'Hsinchu', 'Taiwan', 'EA', 24.8, 120.97, { wage: 1.0, land: 1.3, hq: true, bonus: { processors: 1.6, wafers: 1.3, memory: 1.15 }, note: 'Leading-edge foundries.' }),
  C('incheon', 'Incheon', 'South Korea', 'EA', 37.46, 126.7, { wage: 1.1, land: 1.2, bonus: { memory: 1.6, smartphones: 1.25, batteries: 1.25 } }),
  C('ulsan', 'Ulsan', 'South Korea', 'EA', 35.54, 129.31, { wage: 1.1, land: 1.0, bonus: { cars: 1.3, petrol_cars: 1.25, petrol: 1.2, steel_beams: 1.2, cargo_ships: 1.55, warships: 1.2, offshore_rigs: 1.2 }, note: 'The world’s biggest shipyard.' }),
  C('tokyo', 'Tokyo', 'Japan', 'EA', 35.68, 139.76, { wage: 1.4, land: 1.6, hq: true, deposits: [['fish', 2, 45]], bonus: { optics: 1.45, lasers: 1.3, motors: 1.35, cars: 1.15, petrol_cars: 1.2, engines: 1.2, quantum: 1.15, seafood: 1.2 } }),
  // Southeast Asia
  C('singapore', 'Singapore', 'Singapore', 'SEA', 1.29, 103.85, { wage: 1.3, land: 1.5, hq: true, bonus: { petrol: 1.25, diesel: 1.25, jet_fuel: 1.25, lubricants: 1.2, wafers: 1.15, offshore_rigs: 1.2, research: 1.05 } }),
  C('portklang', 'Port Klang', 'Malaysia', 'SEA', 3.0, 101.4, { wage: 0.6, land: 0.6, deposits: [['rubber', 3, 55], ['palm_oil', 3, 65], ['gas', 2, 40]], bonus: { tyres: 1.2, memory: 1.1, biofuel: 1.25 } }),
  C('jakarta', 'Jakarta', 'Indonesia', 'SEA', -6.2, 106.85, { wage: 0.45, land: 0.6, deposits: [['coal', 3, 65], ['palm_oil', 2, 55], ['coffee', 2, 30], ['timber', 2, 50]], bonus: { biofuel: 1.2 } }),
  C('hcmc', 'Ho Chi Minh City', 'Vietnam', 'SEA', 10.78, 106.7, { wage: 0.4, land: 0.5, deposits: [['coffee', 3, 40], ['rubber', 2, 40], ['fish', 2, 50]], bonus: { clothing: 1.2, smartphones: 1.15, coffee_roast: 1.2 }, port: [10.4, 107.0] }),
  C('bangkok', 'Bangkok', 'Thailand', 'SEA', 13.75, 100.5, { wage: 0.55, land: 0.7, deposits: [['rubber', 3, 60], ['sugarcane', 2, 70]], bonus: { cars: 1.15, petrol_cars: 1.2, trucks: 1.2, auto_parts: 1.2, food: 1.2 }, port: [13.3, 100.7] }),
  // Oceania
  C('porthedland', 'Port Hedland', 'Australia', 'OC', -20.31, 118.58, { wage: 1.4, land: 0.6, deposits: [['iron_ore', 5, 95], ['lithium', 2, 25]], note: 'The Pilbara iron ore machine.' }),
  C('newcastle', 'Newcastle NSW', 'Australia', 'OC', -32.93, 151.78, { wage: 1.4, land: 0.7, deposits: [['coal', 4, 80], ['cattle', 2, 35]] }),
  C('perth', 'Perth', 'Australia', 'OC', -31.95, 115.86, { wage: 1.45, land: 0.9, hq: true, deposits: [['lithium', 3, 35], ['gas', 3, 55], ['rare_earths', 2, 18], ['gold', 2, 9], ['wheat', 2, 70]], bonus: { lng: 1.2 } }),
  C('adelaide', 'Adelaide', 'Australia', 'OC', -34.93, 138.6, { wage: 1.35, land: 0.8, deposits: [['uranium', 3, 15], ['copper_ore', 2, 40]], bonus: { warships: 1.25, nuclear_fuel: 1.15 }, port: [-34.8, 138.3], note: 'Olympic Dam — the largest uranium deposit on Earth.' }),
  C('weipa', 'Weipa', 'Australia', 'OC', -12.63, 141.87, { wage: 1.3, land: 0.5, deposits: [['bauxite', 4, 75]] }),
  // North America
  C('houston', 'Houston', 'United States of America', 'NA', 29.76, -95.37, { wage: 1.5, land: 1.0, hq: true, deposits: [['crude', 4, 55], ['gas', 3, 60], ['helium', 1, 10], ['cattle', 2, 35]], bonus: { petrol: 1.2, diesel: 1.2, plastics: 1.3, fertiliser: 1.15, lng: 1.2, offshore_rigs: 1.25, rockets: 1.15 }, port: [29.7, -95.0] }),
  C('neworleans', 'New Orleans', 'United States of America', 'NA', 29.95, -90.07, { wage: 1.3, land: 0.8, deposits: [['soybeans', 4, 95], ['sugarcane', 2, 60], ['fish', 2, 45]], bonus: { animal_feed: 1.2 }, note: 'Mississippi grain gateway.', port: [29.0, -89.3] }),
  C('newyork', 'New York', 'United States of America', 'NA', 40.71, -74.0, { wage: 1.8, land: 1.8, hq: true, bonus: { research: 1.1, software: 1.2 }, note: 'Wall Street — loans for a New York HQ cost 2% less.' }),
  C('norfolk', 'Norfolk', 'United States of America', 'NA', 36.85, -76.29, { wage: 1.4, land: 1.0, bonus: { warships: 1.4, ammunition: 1.2, armoured_vehicles: 1.15 }, note: 'Home of the world’s largest naval base.' }),
  C('sanjose', 'San Jose', 'United States of America', 'NA', 37.34, -121.89, { wage: 2.0, land: 1.9, hq: true, bonus: { processors: 1.3, quantum: 1.5, servers: 1.3, software: 1.4, ai_models: 1.5, research: 1.2 }, note: 'Silicon Valley.', port: [37.8, -122.4] }),
  C('seattle', 'Seattle', 'United States of America', 'NA', 47.6, -122.33, { wage: 1.7, land: 1.3, deposits: [['timber', 3, 55], ['fish', 2, 50]], bonus: { airliners: 1.35, servers: 1.15, software: 1.3, jet_engines: 1.1 } }),
  C('wilmington', 'Wilmington NC', 'United States of America', 'NA', 34.22, -77.94, { wage: 1.3, land: 0.8, deposits: [['silica', 3, 70]], bonus: { polysilicon: 1.2 }, note: 'Spruce Pine high-purity quartz — every chip starts here.' }),
  C('losangeles', 'Los Angeles', 'United States of America', 'NA', 33.74, -118.27, { wage: 1.7, land: 1.6, deposits: [['rare_earths', 1, 16]], bonus: { satellites: 1.35, rockets: 1.45, cars: 1.1, fighter_jets: 1.2, drones: 1.15 } }),
  C('vancouver', 'Vancouver', 'Canada', 'NA', 49.28, -123.12, { wage: 1.4, land: 1.1, deposits: [['timber', 4, 75], ['wheat', 3, 70], ['coal', 2, 45]], bonus: { lumber: 1.25 } }),
  C('calgary', 'Calgary', 'Canada', 'NA', 51.05, -114.07, { wage: 1.4, land: 0.8, deposits: [['crude', 3, 60], ['gas', 2, 50], ['cattle', 3, 45], ['uranium', 1, 10]], bonus: { meat: 1.2 }, port: [49.3, -123.25], note: 'Oil sands and cattle country. Freight rides the rails to Vancouver.' }),
  // South America
  C('antofagasta', 'Antofagasta', 'Chile', 'SA', -23.65, -70.4, { wage: 0.8, land: 0.6, hq: true, deposits: [['copper_ore', 5, 75], ['lithium', 3, 35]], bonus: { copper: 1.25 }, note: 'Atacama copper and lithium brine.' }),
  C('callao', 'Lima', 'Peru', 'SA', -12.05, -77.15, { wage: 0.6, land: 0.6, deposits: [['copper_ore', 3, 55], ['gold', 2, 9], ['fish', 3, 80]], bonus: { seafood: 1.2 } }),
  C('vitoria', 'Vitória', 'Brazil', 'SA', -20.3, -40.3, { wage: 0.6, land: 0.6, deposits: [['iron_ore', 4, 85], ['coffee', 2, 35]], bonus: { steel: 1.15 } }),
  C('santos', 'São Paulo', 'Brazil', 'SA', -23.55, -46.63, { wage: 0.7, land: 0.9, hq: true, deposits: [['coffee', 3, 45], ['sugarcane', 4, 110], ['soybeans', 2, 70]], bonus: { cars: 1.15, petrol_cars: 1.15, food: 1.2, airliners: 1.15, sugar: 1.25, biofuel: 1.2 }, port: [-23.98, -46.3] }),
  C('manaus', 'Manaus', 'Brazil', 'SA', -3.12, -60.02, { wage: 0.5, land: 0.4, deposits: [['timber', 4, 85], ['rubber', 2, 45]], port: [-0.6, -48.4], note: 'Freight floats 1,500 km down the Amazon.' }),
  C('maracaibo', 'Maracaibo', 'Venezuela', 'SA', 10.65, -71.6, { wage: 0.4, land: 0.4, deposits: [['crude', 4, 55]], port: [11.3, -71.4] }),
  C('buenosaires', 'Buenos Aires', 'Argentina', 'SA', -34.6, -58.38, { wage: 0.65, land: 0.7, deposits: [['wheat', 4, 90], ['soybeans', 3, 85], ['cattle', 3, 50], ['lithium', 2, 30]], bonus: { flour: 1.15, food: 1.15, meat: 1.3, animal_feed: 1.15 }, port: [-34.75, -57.9] })
];
export const CITY = Object.fromEntries(CITIES.map(c => [c.id, c]));

// ---------- Research ----------
export const RESEARCH = [
  { id: 'basic', name: 'Heavy Industry', cost: 0, days: 0, req: [], unlocks: ['lumber', 'paper', 'steel', 'petrol', 'diesel', 'copper', 'glass', 'textiles', 'flour'] },
  { id: 'agri', name: 'Agribusiness', cost: 700000, days: 18, req: ['basic'], unlocks: ['animal_feed', 'sugar', 'seafood', 'coffee_roast', 'meat', 'chocolate'], effect: 'Farms with fertiliser on site produce 35% more.' },
  { id: 'petrochem', name: 'Petrochemicals', cost: 1200000, days: 25, req: ['basic'], unlocks: ['plastics', 'fertiliser', 'jet_fuel', 'lubricants', 'lng'] },
  { id: 'consumer', name: 'Consumer Goods', cost: 900000, days: 20, req: ['petrochem'], unlocks: ['furniture', 'clothing', 'food'] },
  { id: 'metallurgy', name: 'Advanced Metallurgy', cost: 1800000, days: 35, req: ['basic'], unlocks: ['aluminium', 'steel_beams'] },
  { id: 'automotive', name: 'Automotive', cost: 5000000, days: 55, req: ['metallurgy', 'petrochem'], unlocks: ['auto_parts', 'tyres', 'engines', 'petrol_cars', 'trucks', 'tractors'] },
  { id: 'munitions', name: 'Munitions', cost: 3000000, days: 40, req: ['metallurgy', 'petrochem'], unlocks: ['ammunition'] },
  { id: 'electronics', name: 'Electronics', cost: 4000000, days: 50, req: ['petrochem'], unlocks: ['copper_wire', 'pcb', 'polysilicon', 'wafers'] },
  { id: 'shipbuilding', name: 'Shipbuilding', cost: 7000000, days: 70, req: ['automotive', 'electronics'], unlocks: ['cargo_ships'], effect: 'Commission ships you build straight into your fleet.' },
  { id: 'renewables', name: 'Clean Energy', cost: 6000000, days: 60, req: ['metallurgy', 'electronics'], unlocks: ['solar_panels', 'biofuel', 'wind_turbines'] },
  { id: 'energy', name: 'Energy Storage', cost: 6000000, days: 60, req: ['metallurgy', 'electronics'], unlocks: ['batteries', 'motors'] },
  { id: 'nuclear', name: 'Nuclear Power', cost: 14000000, days: 90, req: ['energy'], unlocks: ['nuclear_fuel', 'smr'] },
  { id: 'offshore', name: 'Offshore Engineering', cost: 10000000, days: 80, req: ['shipbuilding', 'energy'], unlocks: ['offshore_rigs'] },
  { id: 'optics', name: 'Photonics', cost: 7000000, days: 65, req: ['electronics'], unlocks: ['optics', 'lasers'] },
  { id: 'semis', name: 'Semiconductors', cost: 16000000, days: 90, req: ['electronics'], unlocks: ['processors', 'memory'] },
  { id: 'litho', name: 'EUV Lithography', cost: 28000000, days: 120, req: ['optics', 'semis'], unlocks: ['euv'] },
  { id: 'aero', name: 'Aerospace', cost: 30000000, days: 110, req: ['metallurgy', 'semis'], unlocks: ['jet_engines', 'airliners', 'helicopters', 'satellites'] },
  { id: 'space', name: 'Spaceflight', cost: 45000000, days: 140, req: ['aero', 'energy'], unlocks: ['rockets'] },
  { id: 'defence', name: 'Defence Systems', cost: 35000000, days: 120, req: ['aero', 'optics', 'munitions'], unlocks: ['drones', 'missiles', 'armoured_vehicles', 'fighter_jets', 'warships'] },
  { id: 'devices', name: 'Consumer Electronics', cost: 24000000, days: 90, req: ['semis', 'energy'], unlocks: ['smartphones', 'laptops', 'servers'] },
  { id: 'ev', name: 'Electric Vehicles', cost: 26000000, days: 100, req: ['automotive', 'semis', 'energy'], unlocks: ['cars'] },
  { id: 'software', name: 'Software Engineering', cost: 30000000, days: 100, req: ['devices'], unlocks: ['software'], effect: 'Software is digital: no storage, no shipping, sold where it’s made.' },
  { id: 'quantum', name: 'Quantum Computing', cost: 90000000, days: 180, req: ['litho', 'devices'], unlocks: ['quantum'] },
  { id: 'ai', name: 'Artificial Intelligence', cost: 150000000, days: 200, req: ['software', 'quantum'], unlocks: ['ai_models'] },
  { id: 'log1', name: 'Logistics I', cost: 2500000, days: 30, req: [], unlocks: [], vehicles: ['bulker', 'widebody'] },
  { id: 'log2', name: 'Logistics II', cost: 12000000, days: 80, req: ['log1'], unlocks: [], vehicles: ['ulcv', 'heavylift'] },
  { id: 'automation', name: 'Automation', cost: 8000000, days: 70, req: ['electronics'], unlocks: [], effect: 'All plants run 15% faster.' },
  { id: 'warehousing', name: 'Smart Warehousing', cost: 3000000, days: 40, req: ['log1'], unlocks: [], effect: 'Warehouse capacity doubled.' }
];
export const RESEARCH_BY = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

// ---------- Vehicles ----------
// speed in km/h; cap in units; fuel in $/km.
export const VEHICLES = {
  feeder: { name: 'Coastal Feeder', kind: 'ship', cap: 500, speed: 28, cost: 1200000, upkeep: 1200, fuel: 2.2 },
  bulker: { name: 'Panamax Bulker', kind: 'ship', cap: 2000, speed: 32, cost: 4200000, upkeep: 3500, fuel: 5.5 },
  ulcv: { name: 'Ultra Large Carrier', kind: 'ship', cap: 7000, speed: 37, cost: 13000000, upkeep: 9000, fuel: 12 },
  turboprop: { name: 'Turboprop Freighter', kind: 'plane', cap: 25, speed: 520, cost: 2200000, upkeep: 2500, fuel: 3 },
  widebody: { name: 'Widebody Freighter', kind: 'plane', cap: 110, speed: 880, cost: 9000000, upkeep: 7500, fuel: 9 },
  heavylift: { name: 'Heavy-Lift Jet', kind: 'plane', cap: 260, speed: 800, cost: 19000000, upkeep: 15000, fuel: 16 }
};

// ---------- Rivals ----------
export const RIVALS = [
  { id: 'r1', name: 'Meridian Petroleum', color: '#ef7d45', hq: 'houston', pref: ['crude', 'gas', 'petrol', 'diesel', 'plastics', 'lng', 'offshore_rigs'] },
  { id: 'r2', name: 'Jade Dragon Holdings', color: '#e3c04a', hq: 'shanghai', pref: ['rare_earths', 'coal', 'iron_ore', 'steel', 'batteries', 'smartphones', 'cargo_ships', 'solar_panels'] },
  { id: 'r3', name: 'Nordhavn Group', color: '#53c0d6', hq: 'stavanger', pref: ['gas', 'crude', 'fish', 'timber', 'aluminium', 'seafood', 'wind_turbines'] },
  { id: 'r4', name: 'Andes Agro-Mineral', color: '#a98bf0', hq: 'antofagasta', pref: ['copper_ore', 'lithium', 'gold', 'soybeans', 'cattle', 'coffee', 'meat'] },
  { id: 'r5', name: 'Kestrel Systems', color: '#6fd08a', hq: 'hsinchu', pref: ['silica', 'neon', 'wafers', 'processors', 'memory', 'servers', 'software', 'drones'] },
  { id: 'r6', name: 'Valkyrie Aerospace & Defence', color: '#e46bb0', hq: 'losangeles', pref: ['aluminium', 'jet_engines', 'missiles', 'fighter_jets', 'rockets', 'satellites', 'uranium'] }
];

export const COLORS = ['#ff4d6d', '#3d8bff', '#ff9b3d', '#f4f4f4', '#b6f03c', '#00e0c6'];
