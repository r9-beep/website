// Shared WebGL plumbing: renderer, resize, visibility-aware render loop, studio lighting.
import * as THREE from '../vendor/three.js';
import { RoomEnvironment } from '../vendor/three.js';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

export function isLowPower() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return mem <= 4 || cores <= 4 || small;
}

export function createStage(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: opts.antialias ?? true,
    alpha: opts.alpha ?? true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false
  });
  const maxDpr = opts.maxDpr ?? (isLowPower() ? 1.5 : 2);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = opts.toneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.0;
  if (opts.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  if (opts.label) canvas.setAttribute('aria-label', opts.label);
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, 1, opts.near ?? 0.5, opts.far ?? 4000);

  const state = { visible: true, running: false, width: 1, height: 1, onFrame: null, onResize: null, render: null, resizeHooks: [] };
  const clock = new THREE.Timer();
  clock.connect && clock.connect(document);

  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === state.width && h === state.height) return;
    state.width = w; state.height = h;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    state.onResize && state.onResize(w, h);
    state.resizeHooks.forEach(fn => fn(w, h));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const io = new IntersectionObserver(es => {
    state.visible = es[0].isIntersecting;
    if (state.visible) loop.start();
  }, { rootMargin: '100px' });
  io.observe(container);

  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop.start(); });

  let raf = 0;
  const loop = {
    start() {
      if (state.running) return;
      state.running = true;
      clock.update();
      const tick = ts => {
        if (!state.visible || document.hidden) { state.running = false; return; }
        raf = requestAnimationFrame(tick);
        clock.update(ts);
        const dt = Math.min(clock.getDelta(), 0.05);
        state.onFrame && state.onFrame(clock.getElapsed(), dt);
        state.render ? state.render(dt) : renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() { cancelAnimationFrame(raf); state.running = false; }
  };

  return {
    THREE, renderer, scene, camera, canvas, state, clock, resize,
    set onFrame(fn) { state.onFrame = fn; },
    set onResize(fn) { state.onResize = fn; },
    set render(fn) { state.render = fn; },
    addResizeHook(fn) { state.resizeHooks.push(fn); fn(state.width, state.height); },
    start: () => loop.start(),
    stop: () => loop.stop(),
    renderOnce: () => (state.render ? state.render(0) : renderer.render(scene, camera)),
    dispose() { loop.stop(); ro.disconnect(); io.disconnect(); renderer.dispose(); canvas.remove(); }
  };
}

// Photographic studio: a dark cyclorama with long softbox strips, so glossy paint picks up crisp
// highlight bands like a car configurator. Rendered once into a PMREM environment.
export function softboxEnvironment(renderer, { warm = 1 } = {}) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(vec3(0.035, 0.04, 0.055), vec3(0.11, 0.12, 0.15), smoothstep(-0.2, 0.9, h)); c = mix(c, vec3(0.06, 0.05, 0.045), smoothstep(0.0, -0.6, h)); gl_FragColor = vec4(c, 1.0); }'
  }));
  env.add(room);
  const panel = (w, h, pos, look, intensity, color = '#ffffff') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(pos); m.lookAt(look);
    env.add(m);
  };
  const O = new THREE.Vector3();
  panel(70, 5, new THREE.Vector3(0, 34, 0), O, 4.2);
  panel(70, 3, new THREE.Vector3(0, 30, 16), O, 2.6);
  panel(70, 3, new THREE.Vector3(0, 30, -16), O, 2.6);
  panel(10, 26, new THREE.Vector3(40, 10, 24), O, 1.8, '#fff1e0');
  panel(10, 26, new THREE.Vector3(-40, 10, -24), O, 1.4, '#e6eeff');
  panel(28, 8, new THREE.Vector3(-20, 6, 44), O, 1.1 * warm, '#ffd2a8');
  panel(28, 8, new THREE.Vector3(30, 4, -44), O, 0.7, '#cdd9ff');
  panel(80, 80, new THREE.Vector3(0, -30, 0), O, 0.12, '#3a3530');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return tex;
}

// Studio reflections + key/fill/rim lights.
export function studioLighting(stage, { shadows = false, intensity = 1, softbox = true } = {}) {
  const { renderer, scene } = stage;
  let env;
  if (softbox) env = softboxEnvironment(renderer);
  else { const pmrem = new THREE.PMREMGenerator(renderer); env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose(); }
  scene.environment = env;
  scene.environmentIntensity = 0.85 * intensity;
  const hemi = new THREE.HemisphereLight('#dfe6ff', '#2a2018', 0.45 * intensity);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff4e6', 2.2 * intensity);
  key.position.set(60, 90, 70);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fb6ff', 1.2 * intensity);
  rim.position.set(-80, 40, -90);
  scene.add(rim);
  const warm = new THREE.DirectionalLight('#ffb070', 0.55 * intensity);
  warm.position.set(-40, -20, 80);
  scene.add(warm);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(isLowPower() ? 1024 : 4096, isLowPower() ? 1024 : 4096);
    const c = key.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 400;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.05;
    key.shadow.radius = 5;
  }
  return { hemi, key, rim, warm, env };
}

// Frame an object: returns distance so it fits within the view.
export function fitDistance(camera, size, margin = 1.15) {
  const fov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
  const dV = (size.y / 2) / Math.tan(fov / 2);
  const dH = (Math.max(size.x, size.z) / 2) / Math.tan(hFov / 2);
  return Math.max(dV, dH) * margin;
}

export const ease = {
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
};

// Simple tween helper driven from a render loop.
export function tween(from, to, dur, fn, easing = ease.inOutCubic) {
  const t0 = performance.now();
  return new Promise(res => {
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / (dur * 1000));
      fn(lerpAny(from, to, easing(t)), t);
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
function lerpAny(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  const o = {};
  for (const k in a) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
