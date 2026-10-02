// Home: scroll-driven flight of the 4-44ULR at dusk, plus the mini range globe.
import * as THREE from '../vendor/three.js';
import { FLEET_BY_ID } from '../data/fleet.js';
import { buildAircraft, loadLiveryFonts } from '../lib/aircraft.js';
import { createStage, webglAvailable, isLowPower, prefersReducedMotion } from '../lib/stage.js';
import { createSky, createClouds, createContrail } from '../lib/sky.js';

const host = document.querySelector('[data-hero-canvas]');
const section = document.querySelector('.home-hero');
const heroLayer = document.querySelector('[data-hero-layer]');
const chapters = [...document.querySelectorAll('[data-chapter]')];
const progressDots = [...document.querySelectorAll('.story-progress i')];
const progressWrap = document.querySelector('.story-progress');
const hudClock = document.querySelector('[data-hud-clock]');
const reduced = prefersReducedMotion();

/* ---------- Scroll progress + overlays (works with or without WebGL) ---------- */
let progress = 0;
function readProgress() {
  const r = section.getBoundingClientRect();
  const total = r.height - window.innerHeight;
  progress = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
  heroLayer.classList.toggle('gone', progress > 0.05);
  const ranges = [[0.16, 0.4], [0.46, 0.68], [0.74, 1.01]];
  let active = -1;
  chapters.forEach((c, i) => {
    const on = progress >= ranges[i][0] && progress < ranges[i][1];
    c.classList.toggle('on', on);
    if (on) active = i;
  });
  progressDots.forEach((d, i) => d.classList.toggle('on', i === active));
  progressWrap && progressWrap.classList.toggle('on', progress > 0.1 && progress < 0.995);
  if (hudClock) {
    const mins = Math.round((19 * 60 + 10) * (1 - progress * 0.985));
    hudClock.textContent = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  }
}
window.addEventListener('scroll', readProgress, { passive: true });
window.addEventListener('resize', readProgress);
readProgress();

/* ---------- 3D flight ---------- */
async function initFlight() {
  if (!webglAvailable()) return;
  const low = isLowPower();
  await loadLiveryFonts();
  const stage = createStage(host, { alpha: false, fov: 32, near: 1, far: 40000, exposure: 1.05, label: 'A BAC 4-44ULR cruising above the clouds at dusk' });
  const { scene, camera, renderer } = stage;
  renderer.setClearColor('#0a0e1a');

  const sky = createSky();
  scene.add(sky.mesh);
  const clouds = createClouds({ y: -650, coverage: 0.46 });
  scene.add(clouds.mesh);
  const wisps = low ? null : createClouds({ y: -260, coverage: 0.62, layer: 1 });
  if (wisps) scene.add(wisps.mesh);

  // Sun: low on the horizon, off to the left of the hero shot
  const sunDir = new THREE.Vector3();
  const setSun = (elevDeg, azDeg) => {
    const e = elevDeg * Math.PI / 180, a = azDeg * Math.PI / 180;
    sunDir.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).normalize();
    sky.uniforms.sunDir.value.copy(sunDir);
    clouds.uniforms.sunDir.value.copy(sunDir);
    wisps && wisps.uniforms.sunDir.value.copy(sunDir);
  };
  const SUN_AZ = 168;
  setSun(4, SUN_AZ);

  const sunLight = new THREE.DirectionalLight('#ffbf86', 2.6);
  scene.add(sunLight);
  const moon = new THREE.DirectionalLight('#8ea8ff', 0);
  moon.position.set(0.3, 1, 0.5);
  scene.add(moon);
  const hemi = new THREE.HemisphereLight('#4a5a8f', '#a86a44', 0.85);
  scene.add(hemi);

  // Environment reflections rendered from the dusk sky itself
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = createSky();
  envSky.uniforms.sunDir.value.copy(sunDir);
  envSky.mesh.scale.setScalar(100);
  envScene.add(envSky.mesh);
  scene.environment = pmrem.fromScene(envScene, 0, 1, 1000).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  const ac = buildAircraft(FLEET_BY_ID['4-44ulr'], { detail: low ? 0 : 1, textureSize: low ? 2048 : 4096 });
  const plane = new THREE.Group();
  plane.add(ac.group);
  scene.add(plane);

  const trails = ac.exhausts.map(p => {
    const c = createContrail({ length: 1600, r0: 0.4, r1: 10 });
    c.mesh.position.copy(p);
    ac.group.add(c.mesh);
    return c;
  });

  // Camera keyframes: azimuth from the nose toward starboard, elevation, distance (× length), screen shift, bank, fov
  const L = 73.4;
  const KF = [
    { p: 0.00, az: 36, el: 4.5, d: 1.75, sx: 0.17, sy: -0.06, roll: -2, fov: 32 },
    { p: 0.30, az: 148, el: 17, d: 2.5, sx: 0.16, sy: 0.04, roll: -6, fov: 34 },
    { p: 0.58, az: 14, el: -7, d: 0.92, sx: -0.17, sy: 0.0, roll: 1, fov: 34 },
    { p: 0.88, az: 100, el: 4, d: 1.9, sx: 0.13, sy: 0.0, roll: 0, fov: 30 },
    { p: 1.00, az: 106, el: 3, d: 1.95, sx: 0.13, sy: 0.0, roll: 0, fov: 30 }
  ];
  const sm = t => t * t * (3 - 2 * t);
  const target = {};
  const cur = { ...KF[0] };
  function sample(p) {
    let i = 0;
    while (i < KF.length - 2 && p > KF[i + 1].p) i++;
    const a = KF[i], b = KF[i + 1];
    const t = sm(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
    for (const k of ['az', 'el', 'd', 'sx', 'sy', 'roll', 'fov']) target[k] = a[k] + (b[k] - a[k]) * t;
  }

  let mx = 0, my = 0;
  if (!reduced) window.addEventListener('pointermove', e => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; }, { passive: true });

  const camTarget = new THREE.Vector3();
  let offset = 0;
  let first = true;
  stage.onFrame = (time, dt) => {
    sample(progress);
    const k = 1 - Math.exp(-dt * (reduced ? 20 : 3.2));
    for (const key in target) cur[key] += (target[key] - cur[key]) * k;

    const aspect = camera.aspect;
    const portrait = aspect < 1;
    const dMul = portrait ? Math.min(2.4, 0.95 / aspect) : (aspect < 1.4 ? 1.25 : 1);
    const idle = reduced ? 0 : 1;
    const az = (cur.az + Math.sin(time * 0.11) * 2.5 * idle + mx * 6) * Math.PI / 180;
    const el = (cur.el + Math.sin(time * 0.083) * 1.2 * idle - my * 3) * Math.PI / 180;
    const dist = cur.d * L * dMul;
    camTarget.set(0, 0, 0);
    camera.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(dist).add(camTarget);
    camera.lookAt(camTarget);
    camera.fov = cur.fov;
    const w = stage.state.width, h = stage.state.height;
    const sx = portrait ? 0 : cur.sx, sy = portrait ? 0.3 : cur.sy;
    camera.setViewOffset(w, h, -sx * w, sy * h, w, h);
    camera.updateProjectionMatrix();

    // aircraft attitude: gentle cruise motion
    plane.rotation.x = (cur.roll + Math.sin(time * 0.37) * 1.1 * idle) * Math.PI / 180;
    plane.rotation.z = Math.sin(time * 0.23) * 0.5 * idle * Math.PI / 180;
    plane.position.y = Math.sin(time * 0.5) * 0.5 * idle;

    // time of day: dusk → night across the scroll story
    const night = Math.min(1, Math.max(0, (progress - 0.5) / 0.38));
    setSun(4 - night * 10, SUN_AZ + progress * 12);
    sky.uniforms.uNight.value = night;
    sky.uniforms.uTime.value = time;
    for (const c of [clouds, wisps]) {
      if (!c) continue;
      c.uniforms.uNight.value = night;
      c.uniforms.uTime.value = time;
      c.uniforms.uCam.value.copy(camera.position);
    }
    offset += dt * (reduced ? 30 : 150);
    clouds.uniforms.uOffset.value.set(offset, 0);
    wisps && wisps.uniforms.uOffset.value.set(offset * 1.6, 0);
    trails.forEach(t => { t.uniforms.uTime.value = time; t.uniforms.uNight.value = night; });
    sunLight.position.copy(sunDir).multiplyScalar(100);
    sunLight.intensity = 2.6 * (1 - night) + 0.05;
    moon.intensity = night * 0.9;
    hemi.intensity = 0.85 - night * 0.55;
    scene.environmentIntensity = 0.9 - night * 0.65;
    renderer.toneMappingExposure = 1.05 + night * 0.25;
    ac.setNight(Math.min(1, night * 1.4 + 0.08));
    ac.update(time, dt);

    if (first) {
      first = false;
      const fb = host.querySelector('[data-hero-fallback]');
      if (fb) { fb.style.transition = 'opacity 1.2s'; requestAnimationFrame(() => { fb.style.opacity = '0'; setTimeout(() => fb.remove(), 1300); }); }
      window.__ready = true;
    }
  };
  stage.canvas.style.opacity = '0';
  stage.canvas.style.transition = 'opacity 1.4s ease';
  stage.start();
  requestAnimationFrame(() => { stage.canvas.style.opacity = '1'; });
}

initFlight().catch(err => { console.error(err); window.__ready = true; });

/* ---------- Mini globe (lazy) ---------- */
const mini = document.querySelector('[data-globe-mini]');
if (mini && webglAvailable()) {
  const io = new IntersectionObserver(async es => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    const { createGlobe } = await import('../lib/globe.js');
    const g = createGlobe(mini, { interactive: false, autoRotate: true, labels: false, mini: true });
    g.setAircraft('4-44ulr');
    g.setHub('LHR', true);
  }, { rootMargin: '300px' });
  io.observe(mini);
}
