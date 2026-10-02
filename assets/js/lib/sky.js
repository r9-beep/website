// Atmosphere pieces for the flight scenes: sky dome, cloud deck, contrails.
import * as THREE from '../vendor/three.js';

const NOISE = /* glsl */`
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 6; i++){ v += a*noise(p); p = m*p; a *= 0.5; } return v; }
`;

// Sky colour for a view direction — shared by the dome and the cloud-deck horizon fog so they meet seamlessly.
const SKY_FN = /* glsl */`
  vec3 skyColor(vec3 d, vec3 sunDir, float night){
    float h = d.y;
    float s = max(dot(d, normalize(sunDir)), 0.0);
    vec3 zen = mix(vec3(0.03, 0.05, 0.13), vec3(0.008, 0.012, 0.035), night);
    vec3 mid = mix(vec3(0.16, 0.14, 0.30), vec3(0.025, 0.035, 0.08), night);
    vec3 hor = mix(vec3(0.92, 0.50, 0.28), vec3(0.07, 0.08, 0.16), night);
    vec3 col = mix(hor, mid, smoothstep(0.0, 0.09, h));
    col = mix(col, zen, smoothstep(0.07, 0.5, h));
    float glow = pow(s, 4.0) * (1.0 - smoothstep(0.0, 0.4, h));
    col += vec3(1.0, 0.42, 0.16) * glow * 0.75 * (1.0 - night);
    col += vec3(0.8, 0.22, 0.25) * pow(s, 1.5) * 0.10 * (1.0 - night) * (1.0 - smoothstep(0.0, 0.3, h));
    col += vec3(0.25, 0.12, 0.18) * pow(s, 3.0) * night * (1.0 - smoothstep(0.0, 0.25, h));
    return col;
  }
`;

export function createSky() {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(-0.6, 0.05, -0.8).normalize() },
    uNight: { value: 0 },
    uTime: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir; uniform float uNight; uniform float uTime;
      varying vec3 vDir;
      ${SKY_FN}
      float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float s = max(dot(d, normalize(sunDir)), 0.0);
        vec3 col = skyColor(vec3(d.x, max(h, 0.0), d.z), sunDir, uNight);
        col += vec3(1.0, 0.85, 0.6) * smoothstep(0.9993, 0.9998, s) * 3.0 * (1.0 - uNight);
        col += vec3(1.0, 0.7, 0.4) * pow(s, 60.0) * 0.6 * (1.0 - uNight);
        if (h < 0.0) col = mix(col, mix(vec3(0.06,0.05,0.09), vec3(0.01,0.012,0.025), uNight), smoothstep(0.0, -0.2, h));
        // stars
        vec3 sp = d * 420.0; vec3 cell = floor(sp);
        float r = h3(cell);
        if (r > 0.9965) {
          vec3 f = fract(sp) - 0.5;
          float st = smoothstep(0.12, 0.0, length(f));
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 6.0) + r * 40.0);
          col += vec3(0.9, 0.92, 1.0) * st * tw * smoothstep(0.05, 0.4, h) * (0.25 + uNight * 0.95);
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(20000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export function createClouds({ y = -650, size = 60000, coverage = 0.48, layer = 0 } = {}) {
  const uniforms = {
    uTime: { value: 0 }, uOffset: { value: new THREE.Vector2() },
    sunDir: { value: new THREE.Vector3(-0.6, 0.05, -0.8).normalize() },
    uNight: { value: 0 }, uCam: { value: new THREE.Vector3() },
    uCoverage: { value: coverage }, uScale: { value: layer ? 0.00055 : 0.00028 },
    uHorizon: { value: new THREE.Color(0.98, 0.58, 0.30) }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec2 uOffset; uniform vec3 sunDir; uniform float uNight; uniform vec3 uCam;
      uniform float uCoverage; uniform float uScale; uniform vec3 uHorizon;
      varying vec3 vW;
      ${NOISE}
      ${SKY_FN}
      void main(){
        vec2 p = (vW.xz + uOffset) * uScale;
        float n = fbm(p + vec2(0.0, uTime * 0.004));
        float detail = fbm(p * 3.1 - vec2(uTime * 0.01, 0.0));
        float d = n * 0.78 + detail * 0.22;
        float cov = smoothstep(uCoverage, uCoverage + 0.22, d);
        // fake relief lighting from a gradient of the density field
        float e = 0.02;
        float dx = fbm(p + vec2(e, 0.0)) - n;
        float dz = fbm(p + vec2(0.0, e)) - n;
        vec3 nrm = normalize(vec3(-dx * 22.0, 1.0, -dz * 22.0));
        vec3 sd = normalize(sunDir + vec3(0.0, 0.25, 0.0));
        float lit = clamp(dot(nrm, sd) * 0.5 + 0.5, 0.0, 1.0);
        vec3 shadowC = mix(vec3(0.30, 0.25, 0.38), vec3(0.035, 0.045, 0.09), uNight);
        vec3 litC = mix(vec3(1.05, 0.74, 0.52), vec3(0.17, 0.2, 0.32), uNight);
        vec3 col = mix(shadowC, litC, pow(lit, 1.2) * (0.5 + 0.6 * d));
        // warm rim toward the sun
        vec3 toSun = normalize(vec3(sunDir.x, 0.0, sunDir.z));
        vec3 view = normalize(vW - uCam);
        float back = pow(max(dot(normalize(vec3(view.x, 0.0, view.z)), toSun), 0.0), 4.0);
        col += vec3(1.0, 0.5, 0.25) * back * 0.35 * (1.0 - uNight) * cov;
        float dist = length(vW.xz - uCam.xz);
        float fog = smoothstep(2500.0, 20000.0, dist);
        vec3 hz = skyColor(normalize(vec3(view.x, 0.0, view.z)), sunDir, uNight);
        col = mix(col, hz, fog);
        float a = cov * (1.0 - smoothstep(18000.0, 28000.0, dist));
        a = max(a, fog * 0.92 * (1.0 - smoothstep(24000.0, 30000.0, dist)));
        gl_FragColor = vec4(col, a);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// Soft condensation trail streaming aft from an engine. Built along -X from the origin.
export function createContrail({ length = 1400, r0 = 0.5, r1 = 9 } = {}) {
  const geo = new THREE.CylinderGeometry(r0, r1, length, 20, 40, true);
  geo.rotateZ(-Math.PI / 2); // axis along X; the narrow end (r0) sits at the engine
  geo.translate(-length / 2, 0, 0);
  const uniforms = { uTime: { value: 0 }, uLen: { value: length }, uNight: { value: 0 }, uOpacity: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vV;
      uniform float uLen;
      void main(){
        vT = clamp(-position.x / uLen, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uNight; uniform float uOpacity;
      varying float vT; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float soft = pow(facing, 1.6);
        float start = smoothstep(0.012, 0.05, vT);
        float fade = pow(1.0 - vT, 1.6);
        float br = 0.55 + 0.45 * fbm(vec2(vT * 40.0 + uTime * 6.0, vT * 3.0));
        float a = soft * start * fade * br * 0.55 * uOpacity;
        vec3 c = mix(vec3(1.0, 0.86, 0.74), vec3(0.42, 0.46, 0.6), uNight);
        gl_FragColor = vec4(c, a * (1.0 - uNight * 0.55));
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
