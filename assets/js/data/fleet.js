// Single source of truth for the BAC fleet.
// Used by the 3D builder, every page script and the static page generator (tools/build.mjs).

export const FLEET = [
  {
    id: '1-11nxt',
    code: '1-11NXT',
    name: 'BAC 1-11NXT',
    title: '1-11 NXT',
    tag: 'New entry',
    tagClass: 'new',
    role: 'Narrow-body · Short to medium haul',
    subtitle: 'Narrow-body · Short to medium haul · 737-700 and A319 replacement',
    tagline: 'The spiritual successor to the jet that defined British short-haul.',
    reg: 'G-BNXT',
    accent: 'union',
    eis: 2028,
    specs: {
      seats: 189, typicalSeats: 162, rangeKm: 5400, cruiseKmh: 830, mach: 0.78,
      payloadKg: 12500, lengthM: 39.6, spanM: 35.8, heightM: 11.4, mtowKg: 79000,
      engines: 2, thrustKn: 120, cabinWidthM: 3.70, ceilingFt: 41000, enduranceH: 7
    },
    keySpecs: [
      { val: '189', unit: '', key: 'Max seats' },
      { val: '5,400', unit: 'km', key: 'Range' },
      { val: '830', unit: 'km/h', key: 'Cruise speed' },
      { val: '12,500', unit: 'kg', key: 'Max payload' }
    ],
    desc: 'The BAC 1-11NXT is the spiritual successor to the original BAC One-Eleven that defined British short-haul aviation in the 1960s. Rebuilt from the ground up with an entirely new composite fuselage, ultra-high-bypass LEAP-class engines mounted high on the rear fuselage, and a 45% reduction in fuel burn versus the aircraft it replaces — the ageing Boeing 737-700 and A319. The 1-11NXT brings British engineering back to short-haul routes with a seat-mile cost that redefines the economics of regional narrow-body operation.',
    features: [
      'Extended range versus the original One-Eleven by 340%',
      'Composite fuselage — 18% lighter than aluminium equivalent',
      'SAF-100 compatible from entry into service',
      'Fully fly-by-wire with advanced envelope protection',
      'New wide cabin — 18-inch seats standard in economy',
      'Lower cabin altitude — 6,000 ft equivalent',
      'MTOW growth variant available for longer routes',
      'Compatible with existing 737 ground infrastructure'
    ],
    cabin: {
      label: 'Typical two-class layout',
      classes: [
        { name: 'Business', layout: '2-2', rows: 3, pitch: 36 },
        { name: 'Economy', layout: '3-3', rows: 25, pitch: 30 }
      ]
    },
    hotspots: [
      { anchor: 'cockpit', title: 'Single-pilot-ready flight deck', text: 'Side-stick fly-by-wire with full envelope protection and a flight deck architected for reduced-crew operations.' },
      { anchor: 'engine', title: 'Rear-mounted UHBR engines', text: 'Two ultra-high-bypass turbofans mounted high on the tail cone — a clean wing, a quieter cabin and a nod to the original One-Eleven.' },
      { anchor: 'fin', title: 'T-tail', text: 'The horizontal stabiliser rides clear of engine efflux at the top of the fin — classic One-Eleven DNA.' },
      { anchor: 'wing', title: 'Natural laminar-flow wing', text: 'A clean, engine-free wing delivers laminar flow over 40% of the upper surface.' },
      { anchor: 'cabin', title: '3.7 m cabin', text: 'The widest single-aisle cross-section in its class: 18-inch economy seats and generous overhead bins.' }
    ],
    routes: [['LHR', 'ATH'], ['LGW', 'TFS'], ['MAN', 'IST'], ['EDI', 'LHR'], ['BRS', 'FAO']],
    geo: {
      length: 39.6, diameter: 3.95, heightScale: 1.0, noseLen: 1.65, tailLen: 3.1,
      wing: { span: 35.8, rootLE: 0.47, rootChord: 6.6, tipChord: 1.45, sweep: 25, dihedral: 5.5, kink: 0.33, y: -0.42, winglet: 'blended', wingletH: 2.0 },
      engines: { mount: 'rear', count: 2, diameter: 2.15, length: 4.9, x: 0.79 },
      tail: { type: 'T', finHeight: 6.8, finRootChord: 6.6, finTipChord: 3.6, finSweep: 42, finRoot: 0.83, hstabSpan: 12.6, hstabRootChord: 3.6, hstabTipChord: 1.4, hstabSweep: 30, hstabDihedral: -2 },
      doors: [0.115, 0.83], overwing: [0.45, 0.485], windowPitch: 0.53, gearHeight: 2.2, bogie: 2
    }
  },
  {
    id: '2-22',
    code: '2-22',
    name: 'BAC 2-22',
    title: '2-22',
    tag: '757 replacement',
    tagClass: '',
    role: 'Medium narrow-body · 757 replacement',
    subtitle: 'Medium narrow-body · The definitive 757 replacement',
    tagline: 'The aircraft the industry has been waiting two decades for.',
    reg: 'G-BTWO',
    accent: 'union',
    eis: 2029,
    specs: {
      seats: 240, typicalSeats: 202, rangeKm: 7200, cruiseKmh: 850, mach: 0.80,
      payloadKg: 18600, lengthM: 47.3, spanM: 41.2, heightM: 13.6, mtowKg: 116000,
      engines: 2, thrustKn: 165, cabinWidthM: 3.70, ceilingFt: 42000, enduranceH: 9
    },
    keySpecs: [
      { val: '240', unit: '', key: 'Max seats' },
      { val: '7,200', unit: 'km', key: 'Range' },
      { val: '850', unit: 'km/h', key: 'Cruise speed' },
      { val: '18,600', unit: 'kg', key: 'Max payload' }
    ],
    desc: 'The aircraft the industry has been waiting two decades for. The BAC 2-22 fills the gap between the A321XLR and the A330neo that no manufacturer has properly addressed since Boeing retired the 757. Larger than any A321 variant, smaller and more efficient than the A330, the 2-22 is purpose-built for thin transatlantic routes, high-capacity domestic trunk routes, and medium-haul point-to-point flying that widebodies can\'t economically serve. It is the aircraft that makes routes like London Heathrow to Boston economically viable with a single narrow-body.',
    features: [
      'True 757 replacement — same versatility, modern economics',
      'Single-aisle cabin, 6-abreast, 19-inch minimum seat width',
      'Extended lower-deck cargo holds for belly freight revenue',
      'Overwing exits enabling a 240-seat high-density configuration',
      'Common maintenance training with the 1-11NXT',
      'ETOPS-240 certified from entry into service',
      'Advanced winglet design reducing drag by 8.4%',
      'Optional lie-flat business cabin for premium routes'
    ],
    cabin: {
      label: 'Typical transatlantic layout',
      classes: [
        { name: 'Business', layout: '2-2', rows: 4, pitch: 60 },
        { name: 'Economy', layout: '3-3', rows: 31, pitch: 31 }
      ]
    },
    hotspots: [
      { anchor: 'cockpit', title: 'Common flight deck', text: 'Shared cockpit philosophy with the 1-11NXT — one training pipeline for two aircraft.' },
      { anchor: 'engine', title: 'Underwing UHBR turbofans', text: 'Two 165 kN ultra-high-bypass engines on tall, close-coupled pylons.' },
      { anchor: 'winglet', title: 'Blended winglets', text: 'Upswept blended tips cut induced drag by 8.4% on long thin routes.' },
      { anchor: 'cabin', title: 'Overwing exits', text: 'Four overwing exits unlock a 240-seat certified maximum.' },
      { anchor: 'wing', title: 'Long-span wing', text: 'A 41 m span wing gives transatlantic legs with hot-and-high performance.' }
    ],
    routes: [['LHR', 'BOS'], ['LGW', 'JFK'], ['MAN', 'YYZ'], ['EDI', 'EWR'], ['LHR', 'DXB']],
    geo: {
      length: 47.3, diameter: 3.95, heightScale: 1.02, noseLen: 1.65, tailLen: 3.0,
      wing: { span: 41.2, rootLE: 0.38, rootChord: 7.6, tipChord: 1.55, sweep: 26, dihedral: 6, kink: 0.34, y: -0.48, winglet: 'blended', wingletH: 2.4 },
      engines: { mount: 'wing', count: 2, diameter: 2.55, length: 5.2, stations: [0.34] },
      tail: { type: 'conventional', finHeight: 7.6, finRootChord: 8.0, finTipChord: 2.7, finSweep: 40, finRoot: 0.80, hstabSpan: 15.6, hstabRootChord: 4.6, hstabTipChord: 1.5, hstabSweep: 33, hstabDihedral: 6 },
      doors: [0.10, 0.31, 0.86], overwing: [0.47, 0.50], windowPitch: 0.53, gearHeight: 2.6, bogie: 2
    }
  },
  {
    id: '3-33',
    code: '3-33',
    name: 'BAC 3-33',
    title: '3-33 Wideboy',
    tag: 'Twin aisle',
    tagClass: '',
    role: 'Wideboy widebody · 767-400ER class',
    subtitle: 'Widebody · 767-400ER equivalent · Twin aisle',
    tagline: 'Generous of cabin. Cheeky of positioning.',
    reg: 'G-WIDE',
    accent: 'union',
    eis: 2030,
    specs: {
      seats: 310, typicalSeats: 260, rangeKm: 12000, cruiseKmh: 905, mach: 0.85,
      payloadKg: 28400, lengthM: 58.8, spanM: 56.4, heightM: 16.9, mtowKg: 218000,
      engines: 2, thrustKn: 300, cabinWidthM: 5.45, ceilingFt: 43000, enduranceH: 14
    },
    keySpecs: [
      { val: '310', unit: '', key: 'Max seats' },
      { val: '12,000', unit: 'km', key: 'Range' },
      { val: '905', unit: 'km/h', key: 'Cruise speed' },
      { val: '28,400', unit: 'kg', key: 'Max payload' }
    ],
    desc: 'The BAC 3-33 Wideboy occupies the most commercially compelling gap in the current widebody market — the space between the A321XLR\'s maximum range and the A330\'s minimum economics. With a 2-4-2 cabin in economy and full lie-flat business capability, the 3-33 serves medium-to-long haul routes with a capacity and cost structure that makes point-to-point flying commercially compelling at load factors that would terrify a 777 operator. Its nickname, the Wideboy, reflects both its generous cabin width and its somewhat cheeky positioning against the established order.',
    features: [
      '2-4-2 economy seating — no middle-of-five seats',
      'Full lie-flat business class capability at 2-2-2',
      'Twin-aisle boarding — 25% faster turnaround versus narrow-body',
      'Nose-to-tail composite airframe — lightest in class',
      'Advanced load management for mixed cargo-passenger ops',
      'ETOPS-330 rated — reaches anywhere from anywhere',
      'Shared type rating with BAC 4-44 — one endorsement, two aircraft',
      'Lower-deck lounge available as an optional configuration'
    ],
    cabin: {
      label: 'Typical two-class layout',
      classes: [
        { name: 'Business', layout: '2-2-2', rows: 6, pitch: 72 },
        { name: 'Economy', layout: '2-4-2', rows: 28, pitch: 32 }
      ]
    },
    hotspots: [
      { anchor: 'cabin', title: '2-4-2 economy', text: 'Eight-abreast in a 5.45 m cabin: nobody is more than one seat from an aisle.' },
      { anchor: 'engine', title: '300 kN turbofans', text: 'Two high-thrust UHBR engines with acoustic liners tuned for night-curfew airports.' },
      { anchor: 'winglet', title: 'Raked wingtips', text: 'Raked tips extend effective span without increasing the gate box.' },
      { anchor: 'cockpit', title: 'Common type rating', text: 'Pilots fly the 3-33 and 4-44 on a single type rating.' },
      { anchor: 'fin', title: 'Composite empennage', text: 'One-piece co-cured fin and stabilisers from British composite lines.' }
    ],
    routes: [['LHR', 'ORD'], ['MAN', 'JFK'], ['LHR', 'DEL'], ['LGW', 'CPT'], ['LHR', 'SFO']],
    geo: {
      length: 58.8, diameter: 5.65, heightScale: 1.03, noseLen: 1.7, tailLen: 3.0,
      wing: { span: 56.4, rootLE: 0.37, rootChord: 10.2, tipChord: 1.9, sweep: 31, dihedral: 6, kink: 0.33, y: -0.5, winglet: 'raked', wingletH: 3.4 },
      engines: { mount: 'wing', count: 2, diameter: 3.35, length: 6.2, stations: [0.33] },
      tail: { type: 'conventional', finHeight: 9.4, finRootChord: 10.4, finTipChord: 3.2, finSweep: 41, finRoot: 0.81, hstabSpan: 20.4, hstabRootChord: 5.6, hstabTipChord: 1.8, hstabSweep: 34, hstabDihedral: 6 },
      doors: [0.10, 0.28, 0.56, 0.84], overwing: [], windowPitch: 0.56, gearHeight: 3.2, bogie: 4
    }
  },
  {
    id: '4-44',
    code: '4-44',
    name: 'BAC 4-44',
    title: '4-44',
    tag: 'Twin engine',
    tagClass: '',
    role: 'Long-range widebody · A350 class · Twin engine',
    subtitle: 'Long-range widebody · A350 class · Twin engine',
    tagline: 'The long-haul backbone of the BAC family.',
    reg: 'G-BFOR',
    accent: 'gold',
    eis: 2030,
    specs: {
      seats: 369, typicalSeats: 323, rangeKm: 15500, cruiseKmh: 912, mach: 0.85,
      payloadKg: 45800, lengthM: 70.9, spanM: 64.8, heightM: 17.2, mtowKg: 319000,
      engines: 2, thrustKn: 430, cabinWidthM: 5.61, ceilingFt: 43100, enduranceH: 18
    },
    keySpecs: [
      { val: '369', unit: '', key: 'Max seats' },
      { val: '15,500', unit: 'km', key: 'Range' },
      { val: '912', unit: 'km/h', key: 'Cruise speed' },
      { val: '2', unit: 'engines', key: 'Powerplant' }
    ],
    desc: 'The BAC 4-44 is the long-haul backbone of the BAC family — a twin-engine widebody that competes directly with the Airbus A350-900 and Boeing 777X, but built with a distinctly British philosophy: maximum efficiency, minimum complexity, and an interior that makes a 15-hour sector feel shorter than it is. Two massive ultra-high-bypass turbofans deliver the economics airlines actually want, while ETOPS-370 certification means the 4-44 can serve virtually any route pair on earth. This is the aircraft that makes BAC\'s commercial case — the one airlines will actually order in volume.',
    features: [
      'Twin UHBR turbofans — 18:1 bypass ratio, 25% better fuel burn than the previous generation',
      'ETOPS-370 certified — reaches anywhere from anywhere',
      '3-3-3 economy, 2-2-2 premium economy, 1-2-1 business',
      'Panoramic cabin windows — 30% larger than the previous generation',
      'Advanced humidity management — 4,000 ft equivalent cabin altitude',
      'Lower-deck crew rest compartments for long-haul routing',
      'Shared type rating with the BAC 3-33 Wideboy — one training programme',
      'SAF-100 compatible from day one of service'
    ],
    cabin: {
      label: 'Typical three-class layout',
      classes: [
        { name: 'Business', layout: '1-2-1', rows: 11, pitch: 78 },
        { name: 'Premium Economy', layout: '2-2-2', rows: 6, pitch: 38 },
        { name: 'Economy', layout: '3-3-3', rows: 27, pitch: 31 }
      ]
    },
    hotspots: [
      { anchor: 'engine', title: '18:1 bypass ratio', text: 'Two of the largest turbofans ever hung on a twin — 25% better fuel burn than the generation before.' },
      { anchor: 'cockpit', title: 'Signature mask', text: 'The dark wraparound flight-deck mask is the 4-44 family\'s visual signature.' },
      { anchor: 'winglet', title: 'Curved sharklets', text: 'Large curved wingtips sweep up and back for maximum span efficiency.' },
      { anchor: 'cabin', title: 'Panoramic windows', text: 'Windows 30% larger than the previous generation and a 4,000 ft cabin altitude.' },
      { anchor: 'fin', title: 'ETOPS-370', text: 'Certified to fly up to 370 minutes from the nearest diversion airport.' }
    ],
    routes: [['LHR', 'SIN'], ['LHR', 'LAX'], ['LHR', 'HKG'], ['MAN', 'NRT'], ['LHR', 'GRU']],
    geo: {
      length: 70.9, diameter: 6.0, heightScale: 1.03, noseLen: 1.8, tailLen: 3.05,
      wing: { span: 64.8, rootLE: 0.36, rootChord: 11.4, tipChord: 2.2, sweep: 32, dihedral: 5.5, kink: 0.32, y: -0.5, winglet: 'sharklet', wingletH: 3.6 },
      engines: { mount: 'wing', count: 2, diameter: 4.1, length: 7.4, stations: [0.31] },
      tail: { type: 'conventional', finHeight: 10.4, finRootChord: 12.0, finTipChord: 3.4, finSweep: 40, finRoot: 0.82, hstabSpan: 22.4, hstabRootChord: 6.4, hstabTipChord: 2.0, hstabSweep: 34, hstabDihedral: 6 },
      doors: [0.105, 0.27, 0.56, 0.86], overwing: [], windowPitch: 0.6, gearHeight: 3.4, bogie: 4, mask: true
    }
  },
  {
    id: '4-44ulr',
    code: '4-44ULR',
    name: 'BAC 4-44ULR',
    title: '4-44 ULR',
    tag: 'Flagship',
    tagClass: 'flagship',
    role: 'Ultra-long-range widebody · Flagship',
    subtitle: 'Ultra-long-range · The world\'s furthest-flying commercial aircraft · Flagship',
    tagline: 'Where in the world can you not fly nonstop? Nowhere.',
    reg: 'G-ULRA',
    accent: 'gold',
    eis: 2032,
    flagship: true,
    specs: {
      seats: 380, typicalSeats: 232, rangeKm: 19000, cruiseKmh: 915, mach: 0.86,
      payloadKg: 41200, lengthM: 73.4, spanM: 64.8, heightM: 17.4, mtowKg: 352000,
      engines: 4, thrustKn: 225, cabinWidthM: 5.61, ceilingFt: 43100, enduranceH: 21
    },
    keySpecs: [
      { val: '380', unit: '', key: 'Max seats' },
      { val: '19,000', unit: 'km', key: 'Range' },
      { val: '21', unit: 'h', key: 'Max endurance' },
      { val: '4', unit: 'engines', key: 'Powerplant' }
    ],
    desc: 'The BAC 4-44ULR exists to settle one question: where in the world can you not fly nonstop? The answer, with the ULR, is nowhere. London to Sydney. London to Perth. London to Auckland. Anywhere to anywhere. The ULR is built on the 4-44 airframe but with an entirely revised fuel system, a dedicated rear auxiliary tank architecture, and an interior designed specifically for the physiological demands of a 20-hour flight. This is not a converted long-range aircraft. It was designed from the outset to fly further than anything commercially certificated — and to do it comfortably.',
    features: [
      'Certified range: 19,000 km — London to Sydney nonstop',
      'Four engines — ETOPS irrelevant, redundancy absolute',
      'Rear auxiliary fuel tank — 127,000 litre total capacity',
      'Circadian rhythm cabin lighting across all 21 time zones',
      'Premium-only configuration option for ultra-premium ops',
      'Dedicated wellness zone — stretch, light therapy, rest pods',
      'Real-time route optimisation using stratospheric wind data',
      'First aircraft certified for 21-hour scheduled operations'
    ],
    cabin: {
      label: 'Typical ultra-long-range layout',
      classes: [
        { name: 'Business', layout: '1-2-1', rows: 12, pitch: 80 },
        { name: 'Premium Economy', layout: '2-3-2', rows: 7, pitch: 40 },
        { name: 'Economy', layout: '3-3-3', rows: 15, pitch: 33 }
      ],
      extra: 'Wellness zone · stretch area · light-therapy bar between Premium and Economy'
    },
    hotspots: [
      { anchor: 'engine', title: 'Four engines', text: 'Four 225 kN turbofans. ETOPS becomes irrelevant; redundancy becomes absolute.' },
      { anchor: 'cabin', title: 'Wellness zone', text: 'A dedicated stretch and light-therapy area designed for the physiology of a 20-hour flight.' },
      { anchor: 'tail', title: 'Rear auxiliary tank', text: 'A dedicated rear tank brings total fuel capacity to 127,000 litres.' },
      { anchor: 'cockpit', title: 'Augmented crew rest', text: 'Two flight crew rest bunks and a dedicated cabin crew rest above the main deck.' },
      { anchor: 'winglet', title: 'Gold sharklets', text: 'Flagship livery: the only BAC aircraft to wear gold on its wingtips.' }
    ],
    routes: [['LHR', 'SYD'], ['LHR', 'AKL'], ['LHR', 'PER'], ['LHR', 'MEL'], ['JFK', 'SIN']],
    geo: {
      length: 73.4, diameter: 6.0, heightScale: 1.03, noseLen: 1.8, tailLen: 3.05,
      wing: { span: 64.8, rootLE: 0.37, rootChord: 11.6, tipChord: 2.2, sweep: 33, dihedral: 5.5, kink: 0.32, y: -0.5, winglet: 'sharklet', wingletH: 3.6 },
      engines: { mount: 'wing', count: 4, diameter: 3.0, length: 5.8, stations: [0.27, 0.53] },
      tail: { type: 'conventional', finHeight: 10.6, finRootChord: 12.4, finTipChord: 3.4, finSweep: 40, finRoot: 0.82, hstabSpan: 22.8, hstabRootChord: 6.6, hstabTipChord: 2.0, hstabSweep: 34, hstabDihedral: 6 },
      doors: [0.10, 0.26, 0.55, 0.86], overwing: [], windowPitch: 0.6, gearHeight: 3.4, bogie: 6, mask: true
    }
  }
];

export const FLEET_BY_ID = Object.fromEntries(FLEET.map(a => [a.id, a]));

// Airports used by the range explorer and sample-mission tables.
export const AIRPORTS = {
  LHR: { city: 'London', name: 'Heathrow', lat: 51.47, lon: -0.454, hub: true },
  LGW: { city: 'London', name: 'Gatwick', lat: 51.153, lon: -0.182 },
  MAN: { city: 'Manchester', name: 'Manchester', lat: 53.354, lon: -2.275, hub: true },
  EDI: { city: 'Edinburgh', name: 'Edinburgh', lat: 55.95, lon: -3.372 },
  BRS: { city: 'Bristol', name: 'Bristol', lat: 51.383, lon: -2.719 },
  JFK: { city: 'New York', name: 'JFK', lat: 40.641, lon: -73.778, hub: true },
  EWR: { city: 'Newark', name: 'Newark', lat: 40.69, lon: -74.174 },
  BOS: { city: 'Boston', name: 'Logan', lat: 42.366, lon: -71.01 },
  YYZ: { city: 'Toronto', name: 'Pearson', lat: 43.678, lon: -79.625 },
  ORD: { city: 'Chicago', name: "O'Hare", lat: 41.974, lon: -87.907 },
  LAX: { city: 'Los Angeles', name: 'LAX', lat: 33.942, lon: -118.408, hub: true },
  SFO: { city: 'San Francisco', name: 'SFO', lat: 37.621, lon: -122.379 },
  YVR: { city: 'Vancouver', name: 'Vancouver', lat: 49.195, lon: -123.18 },
  MEX: { city: 'Mexico City', name: 'Benito Juárez', lat: 19.436, lon: -99.072 },
  GRU: { city: 'São Paulo', name: 'Guarulhos', lat: -23.435, lon: -46.473 },
  EZE: { city: 'Buenos Aires', name: 'Ezeiza', lat: -34.822, lon: -58.536 },
  SCL: { city: 'Santiago', name: 'Arturo Merino Benítez', lat: -33.393, lon: -70.786 },
  BOG: { city: 'Bogotá', name: 'El Dorado', lat: 4.702, lon: -74.147 },
  HNL: { city: 'Honolulu', name: 'Honolulu', lat: 21.319, lon: -157.922 },
  ANC: { city: 'Anchorage', name: 'Anchorage', lat: 61.174, lon: -149.998 },
  KEF: { city: 'Reykjavík', name: 'Keflavík', lat: 63.985, lon: -22.605 },
  CDG: { city: 'Paris', name: 'Charles de Gaulle', lat: 49.01, lon: 2.548 },
  MAD: { city: 'Madrid', name: 'Barajas', lat: 40.472, lon: -3.561 },
  FAO: { city: 'Faro', name: 'Faro', lat: 37.014, lon: -7.966 },
  TFS: { city: 'Tenerife', name: 'Tenerife South', lat: 28.044, lon: -16.573 },
  ATH: { city: 'Athens', name: 'Athens', lat: 37.936, lon: 23.947 },
  IST: { city: 'Istanbul', name: 'Istanbul', lat: 41.275, lon: 28.752 },
  CAI: { city: 'Cairo', name: 'Cairo', lat: 30.122, lon: 31.406 },
  LOS: { city: 'Lagos', name: 'Murtala Muhammed', lat: 6.577, lon: 3.321 },
  NBO: { city: 'Nairobi', name: 'Jomo Kenyatta', lat: -1.319, lon: 36.928 },
  JNB: { city: 'Johannesburg', name: 'O. R. Tambo', lat: -26.139, lon: 28.246 },
  CPT: { city: 'Cape Town', name: 'Cape Town', lat: -33.965, lon: 18.602 },
  DXB: { city: 'Dubai', name: 'Dubai', lat: 25.253, lon: 55.364, hub: true },
  DOH: { city: 'Doha', name: 'Hamad', lat: 25.273, lon: 51.608 },
  BOM: { city: 'Mumbai', name: 'Chhatrapati Shivaji', lat: 19.089, lon: 72.866 },
  DEL: { city: 'Delhi', name: 'Indira Gandhi', lat: 28.556, lon: 77.1 },
  BKK: { city: 'Bangkok', name: 'Suvarnabhumi', lat: 13.69, lon: 100.75 },
  SIN: { city: 'Singapore', name: 'Changi', lat: 1.364, lon: 103.991, hub: true },
  HKG: { city: 'Hong Kong', name: 'Hong Kong', lat: 22.308, lon: 113.918 },
  PEK: { city: 'Beijing', name: 'Capital', lat: 40.08, lon: 116.585 },
  ICN: { city: 'Seoul', name: 'Incheon', lat: 37.46, lon: 126.441 },
  NRT: { city: 'Tokyo', name: 'Narita', lat: 35.772, lon: 140.393 },
  PER: { city: 'Perth', name: 'Perth', lat: -31.94, lon: 115.967 },
  SYD: { city: 'Sydney', name: 'Kingsford Smith', lat: -33.946, lon: 151.177, hub: true },
  MEL: { city: 'Melbourne', name: 'Tullamarine', lat: -37.67, lon: 144.843 },
  AKL: { city: 'Auckland', name: 'Auckland', lat: -37.008, lon: 174.792 }
};

// Great-circle distance in km.
export function gcDistance(a, b) {
  const R = 6371, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Indicative block time: wind-optimised cruise at the quoted speed plus ~35 minutes for taxi, climb and descent.
export function blockTime(km, cruiseKmh) {
  const h = km / cruiseKmh + 0.6;
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60 / 5) * 5;
  return mm === 60 ? `${hh + 1}h 00m` : `${hh}h ${String(mm).padStart(2, '0')}m`;
}

export const fmt = n => n.toLocaleString('en-GB');
