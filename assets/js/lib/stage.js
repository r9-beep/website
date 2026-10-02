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

  const state = { visible: true, running: false, width: 1, height: 1, onFrame: null, onResize: null };
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
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() { cancelAnimationFrame(raf); state.running = false; }
  };

  return {
    THREE, renderer, scene, camera, canvas, state, clock, resize,
    set onFrame(fn) { state.onFrame = fn; },
    set onResize(fn) { state.onResize = fn; },
    start: () => loop.start(),
    stop: () => loop.stop(),
    renderOnce: () => renderer.render(scene, camera),
    dispose() { loop.stop(); ro.disconnect(); io.disconnect(); renderer.dispose(); canvas.remove(); }
  };
}

// Neutral studio reflections + key/fill/rim lights.
export function studioLighting(stage, { shadows = false, intensity = 1 } = {}) {
  const { renderer, scene } = stage;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.75 * intensity;
  const hemi = new THREE.HemisphereLight('#dfe6ff', '#2a2018', 0.5 * intensity);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff4e6', 2.4 * intensity);
  key.position.set(60, 90, 70);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fb6ff', 1.3 * intensity);
  rim.position.set(-80, 40, -90);
  scene.add(rim);
  const warm = new THREE.DirectionalLight('#ffb070', 0.6 * intensity);
  warm.position.set(-40, -20, 80);
  scene.add(warm);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const c = key.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 400;
    key.shadow.bias = -0.0005;
    key.shadow.radius = 6;
  }
  pmrem.dispose();
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
