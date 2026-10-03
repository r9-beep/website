// Post-processing for the studio viewers: MSAA HDR target, ground-truth ambient occlusion,
// bloom for nav lights / cabin windows, then tone mapping + sRGB output.
import * as THREE from '../vendor/three.js';
import { EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, OutputPass } from '../vendor/three.js';

export function createPost(stage, { ao = true, bloom = true, aoRadius = 2.4 } = {}) {
  const { renderer, scene, camera } = stage;
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null, bloomPass = null;
  if (ao) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: aoRadius, distanceExponent: 1.6, thickness: 3, scale: 1.15, samples: 16, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    composer.addPass(gtao);
  }
  if (bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.55, 0.92);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());
  stage.addResizeHook((w, h) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  });
  stage.render = () => composer.render();
  return {
    composer, gtao, bloom: bloomPass,
    setAoRadius(r) { gtao && gtao.updateGtaoMaterial({ radius: r }); },
    setAo(on) { if (gtao) gtao.enabled = on; },
    setBloom(strength) { if (bloomPass) bloomPass.strength = strength; }
  };
}
