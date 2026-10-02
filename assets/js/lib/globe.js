// Dotted 3D globe with range caps and great-circle routes. Used by the Range Explorer and the home page.
import * as THREE from '../vendor/three.js';
import { OrbitControls } from '../vendor/three.js';
import { LAND_MASK, LAND_W, LAND_H } from '../data/land-mask.js';
import { FLEET_BY_ID, AIRPORTS, gcDistance } from '../data/fleet.js';
import { createStage, isLowPower, prefersReducedMotion } from './stage.js';

const EARTH_KM = 6371;
const D2R = Math.PI / 180;

export function latLonToVec(lat, lon, r = 1, out = new THREE.Vector3()) {
  const phi = (90 - lat) * D2R, theta = (lon + 180) * D2R;
  return out.set(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(r);
}

let landBits = null;
function isLand(lat, lon) {
  if (!landBits) {
    const bin = atob(LAND_MASK);
    landBits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) landBits[i] = bin.charCodeAt(i);
  }
  const j = Math.min(LAND_H - 1, Math.max(0, Math.floor((90 - lat) / (180 / LAND_H))));
  const i = Math.min(LAND_W - 1, Math.max(0, Math.floor((lon + 180) / (360 / LAND_W))));
  const idx = j * LAND_W + i;
  return (landBits[idx >> 3] >> (idx & 7)) & 1;
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createGlobe(container, opts = {}) {
  const low = isLowPower();
  const reduced = prefersReducedMotion();
  const stage = createStage(container, { alpha: true, fov: 32, near: 0.05, far: 50, antialias: true, label: opts.label || 'Interactive globe' });
  const { scene, camera, renderer } = stage;
  renderer.toneMapping = THREE.NoToneMapping;
  camera.position.set(0, 0.8, (opts.mini ? 4.4 : 5.4) * (container.clientWidth < container.clientHeight ? 1.3 : 1));

  const world = new THREE.Group();
  scene.add(world);

  // Ocean sphere with a soft fresnel rim
  const ocean = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Color('#0b1330') }, uB: { value: new THREE.Color('#1d2c63') } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.5); vec3 c = mix(uA, uB, f); gl_FragColor = vec4(c, 1.0); }`
  }));
  world.add(ocean);

  // Atmosphere glow
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color('#7f9bff') } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float d = dot(vN, vV); float f = pow(clamp(1.0 + d * 1.15, 0.0, 1.0), 3.0) * smoothstep(-0.05, 0.25, -d + 0.25); gl_FragColor = vec4(uC, f * 0.38); }`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(atmo);

  // Land dots on a Fibonacci lattice
  const N = opts.mini || low ? 30000 : 60000;
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const lat = Math.asin(y) / D2R;
    // invert latLonToVec: x = -sinφ cosθ, z = sinφ sinθ  →  θ = atan2(z, -x)
    const theta = Math.atan2(z, -x);
    let lon = theta / D2R - 180; if (lon < -180) lon += 360;
    if (isLand(lat, lon)) pts.push(x * 1.003, y * 1.003, z * 1.003);
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const dotMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: dotTexture() }, uSize: { value: (opts.mini ? 3.6 : 3.4) * renderer.getPixelRatio() }, uColor: { value: new THREE.Color('#dfe4ee') } },
    vertexShader: `uniform float uSize; varying float vF; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vec3 n = normalize(normalMatrix*normalize(position)); vF = dot(n, normalize(-mv.xyz)); gl_PointSize = uSize * (4.6 / -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vF; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); float a = t.a * smoothstep(-0.05, 0.35, vF) * 0.95; if (a < 0.02) discard; gl_FragColor = vec4(uColor, a); }`,
    transparent: true, depthWrite: false
  });
  world.add(new THREE.Points(dotGeo, dotMat));

  // Graticule
  const grat = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 3) {
    grat.push(latLonToVec(lat, lon, 1.001), latLonToVec(lat, lon + 3, 1.001));
  }
  for (let lon = -180; lon < 180; lon += 30) for (let lat = -84; lat < 84; lat += 3) {
    grat.push(latLonToVec(lat, lon, 1.001), latLonToVec(lat + 3, lon, 1.001));
  }
  const gratGeo = new THREE.BufferGeometry().setFromPoints(grat);
  world.add(new THREE.LineSegments(gratGeo, new THREE.LineBasicMaterial({ color: '#3a4a80', transparent: true, opacity: 0.18, depthWrite: false })));

  // Range cap
  const capU = { hubDir: { value: new THREE.Vector3(0, 1, 0) }, uAngle: { value: 0 }, uTime: { value: 0 } };
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.004, 128, 96), new THREE.ShaderMaterial({
    uniforms: capU, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 hubDir; uniform float uAngle; uniform float uTime; varying vec3 vP;
      void main(){
        float ang = acos(clamp(dot(vP, normalize(hubDir)), -1.0, 1.0));
        float inside = 1.0 - smoothstep(uAngle - 0.002, uAngle + 0.002, ang);
        float edge = 1.0 - smoothstep(0.0, 0.012, abs(ang - uAngle));
        float rings = 0.5 + 0.5 * sin(ang * 90.0 - uTime * 2.0);
        vec3 col = mix(vec3(0.78, 0.06, 0.18), vec3(0.79, 0.66, 0.30), edge);
        float a = inside * (0.055 + 0.05 * rings * smoothstep(uAngle - 0.5, uAngle, ang)) + edge * 0.95;
        if (uAngle <= 0.0001) a = 0.0;
        gl_FragColor = vec4(col, a);
      }`
  }));
  world.add(cap);

  // Airports
  const codes = Object.keys(AIRPORTS);
  const cityGeo = new THREE.BufferGeometry();
  const cityPos = new Float32Array(codes.length * 3), cityCol = new Float32Array(codes.length * 3);
  codes.forEach((c, i) => { const v = latLonToVec(AIRPORTS[c].lat, AIRPORTS[c].lon, 1.006); cityPos.set([v.x, v.y, v.z], i * 3); });
  cityGeo.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
  cityGeo.setAttribute('color', new THREE.BufferAttribute(cityCol, 3));
  const cityMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: dotTexture() }, uSize: { value: 9 * renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 color; uniform float uSize; varying vec3 vC; varying float vF; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); vec3 n = normalize(normalMatrix*normalize(position)); vF = dot(n, normalize(-mv.xyz)); gl_PointSize = uSize * (3.6 / -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vF; void main(){ float a = texture2D(uMap, gl_PointCoord).a * smoothstep(0.0, 0.25, vF); if (a < 0.02) discard; gl_FragColor = vec4(vC, a); }`,
    transparent: true, depthWrite: false
  });
  world.add(new THREE.Points(cityGeo, cityMat));

  // Hub pulse ring
  const ringMat = new THREE.MeshBasicMaterial({ color: '#C9A84C', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.024, 48), ringMat);
  world.add(ring);

  // Routes
  const arcGroup = new THREE.Group();
  world.add(arcGroup);
  const arcMat = new THREE.MeshBasicMaterial({ color: '#E2C477', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const arcMatOut = new THREE.MeshBasicMaterial({ color: '#EF3B55', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  let arcs = [];
  const planeGeo = new THREE.BufferGeometry();
  const MAXP = 64;
  const planePos = new Float32Array(MAXP * 3);
  planeGeo.setAttribute('position', new THREE.BufferAttribute(planePos, 3));
  planeGeo.setDrawRange(0, 0);
  const planeMat = new THREE.PointsMaterial({ color: '#ffffff', size: (opts.mini ? 0.04 : 0.032), map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const planes = new THREE.Points(planeGeo, planeMat);
  world.add(planes);

  function arcCurve(a, b) {
    const va = latLonToVec(a.lat, a.lon), vb = latLonToVec(b.lat, b.lon);
    const ang = va.angleTo(vb);
    const lift = 0.015 + 0.13 * (ang / Math.PI);
    const pts = [];
    const n = 64;
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3().crossVectors(va, vb).normalize();
    if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      q.setFromAxisAngle(axis, ang * t);
      const p = va.clone().applyQuaternion(q).multiplyScalar(1.006 + lift * Math.sin(Math.PI * t));
      pts.push(p);
    }
    return new THREE.CatmullRomCurve3(pts);
  }

  function clearArcs() {
    arcs.forEach(a => { arcGroup.remove(a.mesh); a.mesh.geometry.dispose(); });
    arcs = [];
  }

  const state = { aircraft: null, hub: 'LHR', angle: 0, targetAngle: 0, focus: null, routes: [] };

  function recolourCities() {
    const hub = AIRPORTS[state.hub];
    const range = state.aircraft ? state.aircraft.specs.rangeKm : 0;
    codes.forEach((c, i) => {
      const reach = c === state.hub ? 2 : (gcDistance(hub, AIRPORTS[c]) <= range ? 1 : 0);
      const col = reach === 2 ? [0.79, 0.66, 0.3] : reach ? [0.95, 0.93, 0.9] : [0.45, 0.47, 0.55];
      cityCol.set(col, i * 3);
    });
    cityGeo.attributes.color.needsUpdate = true;
  }

  function buildRoutes() {
    clearArcs();
    const hub = AIRPORTS[state.hub];
    const range = state.aircraft ? state.aircraft.specs.rangeKm : 0;
    let list = state.routes.length ? state.routes : codes.filter(c => c !== state.hub && !(AIRPORTS[c].city === hub.city))
      .map(c => ({ to: c, km: gcDistance(hub, AIRPORTS[c]) }))
      .filter(r => r.km <= range && r.km > 600)
      .sort((a, b) => b.km - a.km)
      .slice(0, opts.mini ? 10 : 22)
      .map(r => ({ from: state.hub, to: r.to }));
    list.forEach((r, i) => {
      const A = AIRPORTS[r.from], B = AIRPORTS[r.to];
      const curve = arcCurve(A, B);
      const ok = gcDistance(A, B) <= range;
      const geo = new THREE.TubeGeometry(curve, 64, opts.mini ? 0.0032 : 0.0026, 6, false);
      const mesh = new THREE.Mesh(geo, ok ? arcMat : arcMatOut);
      geo.setDrawRange(0, 0);
      arcGroup.add(mesh);
      arcs.push({ mesh, curve, total: geo.index.count, t0: performance.now() + i * 45, speed: 0.08 + Math.random() * 0.05, phase: Math.random() });
    });
  }

  // Labels
  const labelLayer = opts.labels === false ? null : document.createElement('div');
  const labels = [];
  if (labelLayer) {
    labelLayer.className = 'globe-labels';
    container.appendChild(labelLayer);
    codes.forEach(c => {
      const el = document.createElement('div');
      el.className = 'glabel';
      el.textContent = `${c} · ${AIRPORTS[c].city}`;
      labelLayer.appendChild(el);
      labels.push({ code: c, el, v: latLonToVec(AIRPORTS[c].lat, AIRPORTS[c].lon, 1.01) });
    });
  }

  // Controls
  let controls = null;
  if (opts.interactive !== false) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 1.7;
    controls.maxDistance = 8;
    controls.minDistance = 2.2;
    controls.autoRotate = !reduced && (opts.autoRotate ?? true);
    controls.autoRotateSpeed = 0.35;
    let idleT = null;
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleT); flyTo = null; });
    controls.addEventListener('end', () => { idleT = setTimeout(() => { controls.autoRotate = !reduced && (opts.autoRotate ?? true); }, 6000); });
  }

  // Camera fly-to (keeps distance, slerps direction)
  let flyTo = null;
  function lookAtLatLon(lat, lon, instant = false) {
    const dist = camera.position.length();
    const dir = latLonToVec(Math.max(-55, Math.min(60, lat + 12)), lon).normalize();
    if (instant || reduced) { camera.position.copy(dir.multiplyScalar(dist)); camera.lookAt(0, 0, 0); controls && controls.update(); return; }
    flyTo = { from: camera.position.clone().normalize(), to: dir, t0: performance.now(), dur: 1400, dist };
  }

  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
  let spin = 0;
  stage.onFrame = (time, dt) => {
    capU.uTime.value = time;
    state.angle += (state.targetAngle - state.angle) * (1 - Math.exp(-dt * 2.4));
    capU.uAngle.value = state.angle;
    if (flyTo) {
      const t = Math.min(1, (performance.now() - flyTo.t0) / flyTo.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const q = new THREE.Quaternion().setFromUnitVectors(flyTo.from, flyTo.to);
      const qi = new THREE.Quaternion().slerp(q, e);
      camera.position.copy(flyTo.from).applyQuaternion(qi).multiplyScalar(flyTo.dist);
      camera.lookAt(0, 0, 0);
      if (t >= 1) flyTo = null;
    }
    if (controls) controls.update();
    else if (!reduced && opts.autoRotate) { spin += dt * 0.12; world.rotation.y = spin; }

    // hub ring orientation + pulse
    const hub = AIRPORTS[state.hub];
    latLonToVec(hub.lat, hub.lon, 1.007, ring.position);
    ring.lookAt(tmp.copy(ring.position).multiplyScalar(2));
    const pulse = (time * 0.6) % 1;
    ring.scale.setScalar(1 + pulse * 2.4);
    ringMat.opacity = 0.9 * (1 - pulse);

    // arcs draw-on + planes
    let pc = 0;
    const now = performance.now();
    arcs.forEach(a => {
      const t = Math.min(1, Math.max(0, (now - a.t0) / 1400));
      const e = 1 - Math.pow(1 - t, 3);
      a.mesh.geometry.setDrawRange(0, Math.floor(a.total * e / 6) * 6);
      if (t >= 1 && pc < MAXP) {
        const u = (a.phase + time * a.speed) % 1;
        a.curve.getPointAt(u, tmp);
        planePos.set([tmp.x, tmp.y, tmp.z], pc * 3);
        pc++;
      }
    });
    planeGeo.attributes.position.needsUpdate = true;
    planeGeo.setDrawRange(0, pc);

    // labels
    if (labelLayer) {
      camDir.copy(camera.position).normalize();
      const w = stage.state.width, h = stage.state.height;
      const range = state.aircraft ? state.aircraft.specs.rangeKm : 0;
      const placed = [];
      labels.sort((a, b) => (b.code === state.hub) - (a.code === state.hub) || (b.code === state.focus) - (a.code === state.focus));
      labels.forEach(l => {
        tmp.copy(l.v).applyMatrix4(world.matrixWorld);
        const facing = tmp.clone().normalize().dot(camDir);
        if (facing < 0.18) { l.el.style.opacity = '0'; return; }
        tmp.project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
        const isHub = l.code === state.hub;
        const km = gcDistance(hub, AIRPORTS[l.code]);
        if (!isHub && km < 450 && state.focus !== l.code) { l.el.style.opacity = '0'; return; }
        const reach = isHub || km <= range;
        if (!isHub && l.code !== state.focus && placed.some(p => Math.abs(p[0] - x) < 90 && Math.abs(p[1] - y) < 13)) { l.el.style.opacity = '0'; return; }
        placed.push([x, y]);
        l.el.className = 'glabel' + (isHub ? ' hub' : '') + (reach ? '' : ' out');
        l.el.style.opacity = String(Math.min(1, (facing - 0.18) * 4) * (state.focus && state.focus !== l.code && !isHub ? 0.35 : 1));
        l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(8px, -50%)`;
      });
    }
  };
  stage.start();

  const api = {
    stage,
    setAircraft(id) {
      state.aircraft = FLEET_BY_ID[id];
      state.targetAngle = state.aircraft.specs.rangeKm / EARTH_KM;
      state.angle = Math.min(state.angle, state.targetAngle * 0.15);
      recolourCities(); buildRoutes();
    },
    setHub(code, instant = false) {
      state.hub = code;
      const hub = AIRPORTS[code];
      capU.hubDir.value.copy(latLonToVec(hub.lat, hub.lon)).normalize();
      state.angle = 0;
      recolourCities(); buildRoutes();
      if (controls) lookAtLatLon(hub.lat, hub.lon, instant);
      else { world.rotation.y = 0; camera.position.copy(latLonToVec(hub.lat + 18, hub.lon).normalize().multiplyScalar(camera.position.length())); camera.lookAt(0, 0, 0); spin = 0; }
    },
    setRoutes(list) { state.routes = list || []; buildRoutes(); },
    focus(code) {
      state.focus = code;
      if (code) { const a = AIRPORTS[code]; lookAtLatLon(a.lat, a.lon); }
    },
    dispose() { stage.dispose(); labelLayer && labelLayer.remove(); }
  };
  window.__ready = true;
  return api;
}
