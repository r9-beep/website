// Procedural ultra-high-bypass turbofan with a cutaway, for the Engineering page.
import * as THREE from '../vendor/three.js';
import { OrbitControls } from '../vendor/three.js';
import { createStage, studioLighting, isLowPower, prefersReducedMotion } from './stage.js';

const D2R = Math.PI / 180;
const KEEP_START = 18 * D2R, KEEP_LEN = 232 * D2R; // the remaining wedge is cut away to show the core

function lathe(profile, segs, cut = true) {
  const pts = profile.map(([r, x]) => new THREE.Vector2(Math.max(r, 1e-3), x));
  const g = cut ? new THREE.LatheGeometry(pts, segs, KEEP_START, KEEP_LEN) : new THREE.LatheGeometry(pts, segs);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function bladeGeo(r0, r1, chord, pitch0, pitch1, sweep = 0, thick = 0.012) {
  const ns = 6, pos = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    const t = i / ns, r = r0 + (r1 - r0) * t;
    const p = (pitch0 + (pitch1 - pitch0) * t) * D2R;
    const c = chord * (0.85 + 0.3 * Math.sin(t * Math.PI * 0.8));
    const sw = sweep * t * t;
    const cx = Math.cos(p) * c / 2, cz = Math.sin(p) * c / 2;
    pos.push(cx - sw, r, cz + thick, -cx - sw, r, -cz + thick, cx - sw, r, cz - thick, -cx - sw, r, -cz - thick);
  }
  for (let i = 0; i < ns; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function ring(geo, mat, n, x, phase = 0) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  const q = new THREE.Quaternion(), M = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (i / n) * Math.PI * 2 + phase);
    M.compose(new THREE.Vector3(x, 0, 0), q, one);
    m.setMatrixAt(i, M);
  }
  return m;
}

export function createEngine(container, opts = {}) {
  const low = isLowPower();
  const reduced = prefersReducedMotion();
  const stage = createStage(container, { alpha: true, fov: 30, near: 0.1, far: 200, exposure: 1.05, label: 'Interactive cutaway of a BAC ultra-high-bypass turbofan' });
  const { scene, camera, renderer } = stage;
  studioLighting(stage, { intensity: 1.05 });
  const segs = low ? 48 : 96;

  const M = {
    cowl: new THREE.MeshPhysicalMaterial({ color: '#0d1430', roughness: 0.32, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide }),
    inner: new THREE.MeshStandardMaterial({ color: '#30353f', roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
    lip: new THREE.MeshStandardMaterial({ color: '#e1e4e9', roughness: 0.14, metalness: 1, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: '#C9A84C', roughness: 0.3, metalness: 1, side: THREE.DoubleSide }),
    fan: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.22, metalness: 1, side: THREE.DoubleSide }),
    spinner: new THREE.MeshStandardMaterial({ color: '#15181f', roughness: 0.25, metalness: 0.9 }),
    comp: new THREE.MeshStandardMaterial({ color: '#a9aeb7', roughness: 0.3, metalness: 1, side: THREE.DoubleSide }),
    hot: new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.35, metalness: 1, emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 0.0, side: THREE.DoubleSide }),
    casing: new THREE.MeshStandardMaterial({ color: '#4a505c', roughness: 0.4, metalness: 0.85, side: THREE.DoubleSide }),
    shaft: new THREE.MeshStandardMaterial({ color: '#7d838d', roughness: 0.25, metalness: 1 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    union: new THREE.MeshStandardMaterial({ color: '#C8102E', roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide })
  };

  const engine = new THREE.Group();
  scene.add(engine);
  const lp = new THREE.Group(), hp = new THREE.Group();
  engine.add(lp, hp);

  // Nacelle (cut)
  engine.add(new THREE.Mesh(lathe([[1.86, 3.35], [1.98, 3.15], [2.02, 2.7], [2.0, 1.6], [1.92, 0.4], [1.78, -0.6], [1.7, -0.9]], segs), M.cowl));
  engine.add(new THREE.Mesh(lathe([[1.72, 3.2], [1.78, 3.38], [1.86, 3.42], [1.92, 3.36], [1.95, 3.25]], segs), M.lip));
  engine.add(new THREE.Mesh(lathe([[1.72, 3.2], [1.7, 2.6], [1.69, 1.4], [1.66, 0.2], [1.62, -0.85]], segs), M.inner));
  engine.add(new THREE.Mesh(lathe([[2.005, 2.25], [2.005, 2.05]], segs), M.gold));
  // Core cowl / splitter (cut)
  engine.add(new THREE.Mesh(lathe([[0.86, 1.95], [0.98, 1.7], [1.04, 1.1], [1.02, 0.0], [0.96, -1.2], [0.86, -2.2], [0.74, -2.9]], segs), M.casing));
  engine.add(new THREE.Mesh(lathe([[0.82, 1.92], [0.9, 1.65], [0.9, 1.3]], segs), M.lip));
  // inner core casing walls (cut)
  engine.add(new THREE.Mesh(lathe([[0.8, 1.6], [0.72, 1.0], [0.62, 0.2], [0.55, -0.6], [0.6, -1.0], [0.7, -1.5], [0.82, -2.2], [0.86, -2.6]], segs), M.inner));
  // Exhaust nozzle + plug
  engine.add(new THREE.Mesh(lathe([[0.74, -2.9], [0.68, -3.25]], segs), M.casing));
  engine.add(new THREE.Mesh(lathe([[0.42, -2.6], [0.45, -2.95], [0.32, -3.35], [0.02, -3.9]], segs, false), M.casing));

  // Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 6.2, 24), M.shaft);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.4;
  engine.add(shaft);

  // Fan (LP spool)
  const spinner = new THREE.Mesh(lathe([[0.5, 2.82], [0.47, 3.0], [0.33, 3.25], [0.02, 3.52]], segs, false), M.spinner);
  lp.add(spinner);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 48, Math.PI * 0.9), M.lip);
  swirl.rotation.y = Math.PI / 2; swirl.position.x = 3.07;
  lp.add(swirl);
  lp.add(ring(bladeGeo(0.48, 1.66, 0.58, 62, 24, 0.28, 0.014), M.fan, low ? 16 : 20, 2.8));
  // LP compressor (booster) — 3 stages
  [[1.55, 0.62, 0.92], [1.38, 0.6, 0.86], [1.21, 0.58, 0.8]].forEach(([x, r0, r1], i) => lp.add(ring(bladeGeo(r0, r1, 0.12, 50, 36), M.comp, 34, x, i * 0.1)));
  // LP turbine — 5 stages
  [[-1.7, 0.42, 0.72], [-1.92, 0.44, 0.76], [-2.14, 0.46, 0.8], [-2.36, 0.48, 0.83], [-2.58, 0.5, 0.86]].forEach(([x, r0, r1], i) => lp.add(ring(bladeGeo(r0, r1, 0.13, -48, -30), M.hot, 46, x, i * 0.2)));

  // HP spool: 9-stage compressor + 2-stage turbine
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = 0.95 - t * 1.55;
    const r1 = 0.7 - t * 0.17;
    hp.add(ring(bladeGeo(0.3, r1, 0.08, 48, 38), M.comp, low ? 30 : 44 + i * 2, x, i * 0.13));
  }
  [[-1.18, 0.34, 0.56], [-1.36, 0.35, 0.6]].forEach(([x, r0, r1], i) => hp.add(ring(bladeGeo(r0, r1, 0.1, -50, -34), M.hot, 52, x, i * 0.3)));
  const hpDrum = new THREE.Mesh(lathe([[0.3, 1.0], [0.3, -0.6], [0.34, -1.1], [0.34, -1.45]], segs, false), M.casing);
  hp.add(hpDrum);

  // Static: outlet guide vanes in the bypass duct + stator rows
  engine.add(ring(bladeGeo(1.04, 1.67, 0.32, 10, 4, 0, 0.008), M.casing, low ? 28 : 44, 1.9));

  // Combustor
  const comb = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 16, 64), M.casing);
  comb.rotation.y = Math.PI / 2; comb.position.x = -0.85; comb.scale.set(1, 1, 2.2);
  engine.add(comb);
  const flame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 12, 64), M.flame);
  flame.rotation.y = Math.PI / 2; flame.position.x = -0.85; flame.scale.set(1, 1, 2.0);
  engine.add(flame);
  const glow = new THREE.PointLight('#ff6a28', 0, 4, 1.6);
  glow.position.set(-0.9, 0, 0);
  engine.add(glow);

  engine.rotation.y = 0;
  engine.position.x = 0.2;

  // Camera + controls
  camera.position.set(7.4, 3.9, 9.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-0.1, 0, 0);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 4; controls.maxDistance = 18;
  controls.autoRotate = !reduced; controls.autoRotateSpeed = 0.4;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // Labels
  const anchors = [
    { k: 'fan', t: 'Fan', s: '3.4 m · 20 blades', p: new THREE.Vector3(2.8, 1.3, 0.6) },
    { k: 'ogv', t: 'Bypass duct', s: '18:1 bypass', p: new THREE.Vector3(1.9, -1.35, 0.5) },
    { k: 'lpc', t: 'Booster', s: '3 stages', p: new THREE.Vector3(1.38, 0.75, 0.2) },
    { k: 'hpc', t: 'HP compressor', s: '9 stages · 60:1 OPR', p: new THREE.Vector3(0.2, 0.62, 0.15) },
    { k: 'comb', t: 'Combustor', s: 'Lean-burn, SAF-100', p: new THREE.Vector3(-0.85, 0.52, 0.2) },
    { k: 'hpt', t: 'HP turbine', s: '2 stages', p: new THREE.Vector3(-1.28, -0.6, 0.15) },
    { k: 'lpt', t: 'LP turbine', s: '5 stages', p: new THREE.Vector3(-2.2, 0.75, 0.2) },
    { k: 'nozzle', t: 'Exhaust', s: 'Chevron-free acoustic nozzle', p: new THREE.Vector3(-3.4, -0.5, 0.2) }
  ];
  const labelLayer = document.createElement('div');
  labelLayer.className = 'engine-labels';
  container.appendChild(labelLayer);
  anchors.forEach(a => {
    a.el = document.createElement('div');
    a.el.className = 'elabel';
    a.el.innerHTML = `${a.t} <i>${a.s}</i>`;
    labelLayer.appendChild(a.el);
  });

  let power = opts.power ?? 0.65;
  let lpAngle = 0, hpAngle = 0;
  const tmp = new THREE.Vector3();
  stage.onFrame = (time, dt) => {
    controls.update();
    const W = stage.state.width, H = stage.state.height;
    camera.setViewOffset(W, H, W > 980 ? -0.2 * W : 0, W > 980 ? 0.02 * H : 0, W, H);
    const rate = reduced ? 0.15 : 1;
    lpAngle += dt * (1.5 + power * 22) * rate;
    hpAngle += dt * (3 + power * 48) * rate;
    lp.rotation.x = -lpAngle; hp.rotation.x = -hpAngle;
    const flick = 0.85 + 0.15 * Math.sin(time * 37) * Math.sin(time * 23);
    M.flame.opacity = (0.15 + power * 0.75) * flick;
    M.hot.emissiveIntensity = power * power * 0.6;
    glow.intensity = power * 9 * flick;
    const w = stage.state.width, h = stage.state.height;
    anchors.forEach(a => {
      tmp.copy(a.p).applyMatrix4(engine.matrixWorld).project(camera);
      const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-3px, -50%)`;
      a.el.style.opacity = tmp.z < 1 ? '1' : '0';
    });
  };
  stage.start();
  window.__ready = true;
  return { stage, setPower(v) { power = v; }, controls };
}
