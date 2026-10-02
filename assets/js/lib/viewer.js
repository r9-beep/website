// Studio "hangar" viewer: orbit, gear, night, x-ray, hotspots and a to-scale fleet line-up.
import * as THREE from '../vendor/three.js';
import { OrbitControls } from '../vendor/three.js';
import { FLEET, FLEET_BY_ID } from '../data/fleet.js';
import { buildAircraft, loadLiveryFonts } from './aircraft.js';
import { createStage, studioLighting, isLowPower, prefersReducedMotion } from './stage.js';

const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(512, 512, 0, 512, 512, 512);
  grd.addColorStop(0, 'rgba(60,72,110,0.55)'); grd.addColorStop(0.5, 'rgba(30,38,64,0.25)'); grd.addColorStop(1, 'rgba(10,14,26,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(201,168,76,0.22)'; g.lineWidth = 2;
  for (const r of [300, 420]) { g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(240,237,230,0.08)'; g.lineWidth = 1;
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, r0 = i % 6 === 0 ? 395 : 410;
    g.beginPath(); g.moveTo(512 + Math.cos(a) * r0, 512 + Math.sin(a) * r0); g.lineTo(512 + Math.cos(a) * 420, 512 + Math.sin(a) * 420); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createViewer(container, opts = {}) {
  const low = isLowPower();
  const reduced = prefersReducedMotion();
  await loadLiveryFonts();
  const stage = createStage(container, { alpha: true, fov: 30, near: 0.5, far: 3000, shadows: !low, exposure: 1.0, label: opts.label || 'Interactive 3D aircraft model' });
  const { scene, camera, renderer } = stage;
  const lights = studioLighting(stage, { shadows: !low });

  const floorGroup = new THREE.Group();
  scene.add(floorGroup);
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.42 }));
  shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.receiveShadow = true;
  floorGroup.add(shadowFloor);
  const deck = new THREE.Mesh(new THREE.CircleGeometry(60, 96), new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = 0.02;
  floorGroup.add(deck);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = Math.PI * 0.08;
  controls.autoRotate = !reduced && (opts.autoRotate ?? true);
  controls.autoRotateSpeed = 0.55;
  controls.rotateSpeed = 0.6;
  let resumeT = null;
  controls.addEventListener('start', () => { clearTimeout(resumeT); camTween = null; });
  controls.addEventListener('end', () => {
    if (!api.autoRotate) return;
    resumeT = setTimeout(() => { if (api.autoRotate) controls.autoRotate = true; }, 5000);
    controls.autoRotate = false;
  });

  let current = null;          // { ac, spec }
  let lineup = [];             // aircraft for to-scale mode
  let camTween = null;
  const flags = { gear: true, night: false, xray: false };

  function frameFor(spec, dir = new THREE.Vector3(0.78, 0.36, 0.9)) {
    const L = spec.geo.length, S = spec.geo.wing.span;
    const R = 0.5 * Math.max(L, S) * 1.05;
    const vFov = camera.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = R / Math.sin(Math.min(vFov, hFov) / 2) * (camera.aspect < 1 ? 0.62 : 0.7);
    const h = spec.geo.diameter * 1.4;
    return { pos: dir.clone().normalize().multiplyScalar(dist).add(new THREE.Vector3(0, h, 0)), target: new THREE.Vector3(0, h * 0.8, 0) };
  }

  function tweenCamera(to, dur = 1.6) {
    if (reduced) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
    camTween = { p0: camera.position.clone(), t0v: controls.target.clone(), to, start: performance.now(), dur: dur * 1000 };
  }

  function prep(ac) {
    ac.group.traverse(o => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = false; } });
    ac.group.position.y = -ac.dims.groundY;
    ac.setGear(flags.gear);
    ac.setNight(flags.night ? 1 : 0);
    ac.lightLevel = flags.night ? 1 : 0.45;
    if (flags.xray) ac.setXray(true);
    return ac;
  }

  async function load(id, { instant = false } = {}) {
    const spec = FLEET_BY_ID[id];
    if (!spec) return;
    if (lineup.length) setLineup(false);
    if (current && current.spec.id === id) return;
    const ac = prep(buildAircraft(spec, { detail: low ? 0 : 1, gear: true, textureSize: low ? 2048 : 4096 }));
    const old = current;
    current = { ac, spec };
    scene.add(ac.group);
    const fr = frameFor(spec);
    if (instant || !old) {
      if (!old && !instant && !reduced) {
        ac.group.position.x = spec.geo.length * 1.6;
        slide(ac.group, 0, 1.6);
        camera.position.copy(fr.pos).multiplyScalar(1.25);
        controls.target.copy(fr.target);
        tweenCamera(fr, 2.2);
      } else {
        camera.position.copy(fr.pos); controls.target.copy(fr.target); controls.update();
      }
    } else {
      const outX = -Math.max(old.spec.geo.length, 40) * 1.8;
      slide(old.ac.group, outX, 1.0).then(() => { scene.remove(old.ac.group); old.ac.dispose(); });
      ac.group.position.x = spec.geo.length * 1.8;
      slide(ac.group, 0, 1.4, 0.25);
      tweenCamera(fr, 1.6);
    }
    opts.onLoad && opts.onLoad(spec);
    return ac;
  }

  const slides = [];
  function slide(obj, toX, dur, delay = 0) {
    return new Promise(res => {
      if (reduced) { obj.position.x = toX; res(); return; }
      slides.push({ obj, from: obj.position.x, to: toX, start: performance.now() + delay * 1000, dur: dur * 1000, res });
    });
  }

  function setLineup(on) {
    if (on && !lineup.length) {
      if (current) current.ac.group.visible = false;
      let z = 0;
      const order = [...FLEET].sort((a, b) => a.geo.wing.span - b.geo.wing.span);
      const gap = 6;
      const list = order.map(spec => {
        const ac = prep(buildAircraft(spec, { detail: 0, gear: true, textureSize: 2048 }));
        const half = spec.geo.wing.span / 2;
        z += half;
        ac.group.position.z = z;
        ac.group.position.x = 40 - spec.geo.length / 2; // noses aligned
        z += half + gap;
        scene.add(ac.group);
        return { ac, spec };
      });
      const zMid = (z - gap) / 2;
      list.forEach(l => { l.ac.group.position.z -= zMid; });
      lineup = list;
      deck.visible = false;
      shadowFloor.scale.setScalar(2);
      tweenCamera({ pos: new THREE.Vector3(150, 160, 210), target: new THREE.Vector3(0, 0, 0) }, 1.8);
      lights.key.shadow.camera.left = -180; lights.key.shadow.camera.right = 180; lights.key.shadow.camera.top = 180; lights.key.shadow.camera.bottom = -180; lights.key.shadow.camera.updateProjectionMatrix();
      controls.maxDistance = 700;
    } else if (!on && lineup.length) {
      lineup.forEach(l => { scene.remove(l.ac.group); l.ac.dispose(); });
      lineup = [];
      deck.visible = !flags.xray;
      shadowFloor.scale.setScalar(1);
      lights.key.shadow.camera.left = -60; lights.key.shadow.camera.right = 60; lights.key.shadow.camera.top = 60; lights.key.shadow.camera.bottom = -60; lights.key.shadow.camera.updateProjectionMatrix();
      if (current) { current.ac.group.visible = true; tweenCamera(frameFor(current.spec), 1.6); }
      controls.maxDistance = 400;
    }
    container.classList.toggle('lineup', on);
  }
  controls.maxDistance = 400;
  controls.minDistance = 12;

  // Hotspots
  let hsLayer = null, hsCard = null, hsItems = [], activeHs = -1;
  function setupHotspots(list) {
    if (!list || !list.length) return;
    hsLayer = document.createElement('div'); hsLayer.className = 'hotspots';
    hsCard = document.createElement('div'); hsCard.className = 'hs-card'; hsCard.setAttribute('role', 'dialog'); hsCard.setAttribute('aria-live', 'polite');
    container.appendChild(hsLayer); container.appendChild(hsCard);
    hsItems = list.map((h, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hotspot';
      b.setAttribute('aria-label', `${i + 1}: ${h.title}`);
      b.innerHTML = `<span>${i + 1}</span>`;
      b.addEventListener('click', e => { e.stopPropagation(); focusHotspot(i); });
      hsLayer.appendChild(b);
      return { h, el: b };
    });
    renderer.domElement.addEventListener('pointerdown', () => { if (activeHs >= 0) focusHotspot(-1); });
  }
  function focusHotspot(i) {
    activeHs = i;
    hsItems.forEach((it, k) => it.el.classList.toggle('active', k === i));
    document.querySelectorAll('[data-hotspot]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.hotspot === i)));
    if (i < 0 || !current) { hsCard.classList.remove('on'); return; }
    const it = hsItems[i];
    hsCard.innerHTML = `<span class="hs-num">${String(i + 1).padStart(2, '0')}</span><h3>${it.h.title}</h3><p>${it.h.text}</p>`;
    hsCard.classList.add('on');
    const a = current.ac.anchors[it.h.anchor].clone().add(current.ac.group.position);
    const n = current.ac.anchorNormals[it.h.anchor];
    const L = current.spec.geo.length;
    const pos = a.clone().addScaledVector(n, L * 0.55).add(new THREE.Vector3(0, L * 0.12, 0));
    controls.autoRotate = false;
    tweenCamera({ pos, target: a }, 1.4);
  }

  const tmp = new THREE.Vector3(), camV = new THREE.Vector3();
  let viewShift = 0;
  stage.onFrame = (time, dt) => {
    // slides
    const now = performance.now();
    for (let i = slides.length - 1; i >= 0; i--) {
      const s = slides[i];
      const t = Math.min(1, Math.max(0, (now - s.start) / s.dur));
      s.obj.position.x = s.from + (s.to - s.from) * easeIO(t);
      if (t >= 1) { slides.splice(i, 1); s.res(); }
    }
    if (camTween) {
      const t = Math.min(1, (now - camTween.start) / camTween.dur);
      const e = easeIO(t);
      camera.position.lerpVectors(camTween.p0, camTween.to.pos, e);
      controls.target.lerpVectors(camTween.t0v, camTween.to.target, e);
      if (t >= 1) camTween = null;
    }
    controls.update();
    const w0 = stage.state.width, h0 = stage.state.height;
    const shift = (opts.shiftX || 0) * (w0 > 980 && !lineup.length ? 1 : 0);
    viewShift += (shift - viewShift) * (1 - Math.exp(-dt * 4));
    camera.setViewOffset(w0, h0, viewShift * w0, 0, w0, h0);
    if (current) current.ac.update(time, dt);
    lineup.forEach(l => l.ac.update(time, dt));

    if (hsItems.length && current) {
      const w = stage.state.width, h = stage.state.height;
      hsItems.forEach((it, i) => {
        tmp.copy(current.ac.anchors[it.h.anchor]).add(current.ac.group.position);
        camV.copy(camera.position).sub(tmp).normalize();
        const facing = current.ac.anchorNormals[it.h.anchor].dot(camV);
        tmp.project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
        it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        it.el.classList.toggle('hidden', facing < -0.05);
        if (i === activeHs) {
          const cw = hsCard.offsetWidth, ch = hsCard.offsetHeight;
          let cx = x + 26, cy = y - ch / 2;
          if (cx + cw > w - 12) cx = x - cw - 26;
          cy = Math.max(12, Math.min(h - ch - 80, cy));
          hsCard.style.left = `${cx}px`; hsCard.style.top = `${cy}px`;
        }
      });
    }
  };
  stage.start();

  const api = {
    stage, controls,
    autoRotate: controls.autoRotate,
    get current() { return current; },
    load,
    setAutoRotate(v) { api.autoRotate = v; controls.autoRotate = v && !reduced; },
    setGear(v) { flags.gear = v; current && current.ac.setGear(v); lineup.forEach(l => l.ac.setGear(v)); },
    setNight(v) {
      flags.night = v;
      [current?.ac, ...lineup.map(l => l.ac)].forEach(ac => { if (ac) { ac.setNight(v ? 1 : 0); ac.lightLevel = v ? 1 : 0.45; } });
      scene.environmentIntensity = v ? 0.12 : 0.75;
      lights.key.intensity = v ? 0.25 : 2.4;
      lights.rim.intensity = v ? 0.9 : 1.3;
      lights.hemi.intensity = v ? 0.12 : 0.5;
      lights.warm.intensity = v ? 0 : 0.6;
      container.classList.toggle('night', v);
    },
    setXray(v) {
      flags.xray = v;
      [current?.ac, ...lineup.map(l => l.ac)].forEach(ac => ac && ac.setXray(v));
      deck.visible = !v && !lineup.length; shadowFloor.visible = !v;
      container.classList.toggle('xray', v);
    },
    setLineup,
    hotspots: setupHotspots,
    focusHotspot,
    reset() { if (current) tweenCamera(frameFor(current.spec), 1.2); focusHotspot(-1); }
  };
  if (opts.hotspots) setupHotspots(opts.hotspots);
  if (opts.initial) await load(opts.initial, { instant: !!opts.instant });
  window.__ready = true;
  return api;
}
