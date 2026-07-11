import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, disposeWorld } from './world.js';
import { createAircraftModel, updateAircraftVisual } from './aircraft.js';
import { createInitialSimState, resetSimState } from './state.js';
import { InputController } from './input.js';
import { updatePhysics } from './physics.js';
import { CameraRig } from './cameraRig.js';
import { GameUI } from './ui.js';
import { GameAudio } from './audio.js';
import { updateMission, currentCheckpoint } from './missions.js';
import { registerMissionResult } from './storage.js';

const canvas = document.getElementById('sim');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbcd3e8, 0.00009);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 30000);

// --- Sun, sky and image-based lighting -------------------------------------
const SUN_DIR = new THREE.Vector3(-950, 1600, -900).normalize();
const sun = new THREE.DirectionalLight(0xfff2d8, 3.4);
sun.position.copy(SUN_DIR).multiplyScalar(2200);
sun.castShadow = true;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 5200;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbdd8f2, 0x50603f, 0.3));

// Physically based sky (atmospheric scattering shader from three.js addons).
const sky = new Sky();
sky.scale.setScalar(24000);
sky.material.uniforms.turbidity.value = 3;
sky.material.uniforms.rayleigh.value = 1.1;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy(SUN_DIR);

// Bake the sky into an environment map so all PBR materials get real
// ambient light and reflections (canopy, water, paint). The sun disc is
// hidden during the bake (per Sky docs) and the near/far planes must
// enclose the sky box — the fromScene default of far=100 would miss it
// entirely and produce a black environment.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
sky.material.uniforms.showSunDisc.value = 0;
envScene.add(sky);
scene.environment = pmrem.fromScene(envScene, 0.02, 1, 25000).texture;
pmrem.dispose();
sky.material.uniforms.showSunDisc.value = 1;
scene.add(sky); // moves the sky from envScene into the visible scene
// The raw sky env is very bright HDR — tame its ambient contribution.
scene.environmentIntensity = 0.45;

const aircraft = createAircraftModel();
scene.add(aircraft);

const checkpointGroup = new THREE.Group();
scene.add(checkpointGroup);
const checkpointRing = new THREE.Mesh(
  new THREE.TorusGeometry(85, 3.5, 12, 72),
  new THREE.MeshStandardMaterial({ color: 0xffda79, emissive: 0xffb000, emissiveIntensity: 1.2 })
);
checkpointRing.rotation.x = Math.PI / 2;
checkpointGroup.add(checkpointRing);

const sim = createInitialSimState();
const input = new InputController();
const cameraRig = new CameraRig(camera);
const ui = new GameUI();
const audio = new GameAudio();

// --- Post-processing (bloom) ------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.5, 0.88);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
let useComposer = false;

// --- Quality tiers -----------------------------------------------------------
// low:    no shadows, 1x pixels           — integrated graphics
// medium: 2048 shadows, 1.5x pixels       — average laptop
// high:   2048 shadows, native ≤2x, bloom — gaming laptop
// ultra:  4096 shadows over a wider area, full native pixels, bloom,
//         much denser world               — desktop GPUs
const TIERS = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, shadowSpan: 900, bloom: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, shadowSpan: 900, bloom: false },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadows: true, shadowMap: 2048, shadowSpan: 1000, bloom: true },
  ultra: { pixelRatio: window.devicePixelRatio, shadows: true, shadowMap: 4096, shadowSpan: 1600, bloom: true }
};

let world = null;
let worldQuality = null;

function applySettings(settings) {
  const tier = TIERS[settings.quality] ?? TIERS.high;
  renderer.setPixelRatio(tier.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(tier.pixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  useComposer = tier.bloom;

  if (renderer.shadowMap.enabled !== tier.shadows) {
    renderer.shadowMap.enabled = tier.shadows;
    scene.traverse((obj) => {
      if (obj.material) obj.material.needsUpdate = true;
    });
  }
  // Resize the shadow map and the area it covers.
  if (sun.shadow.mapSize.x !== tier.shadowMap) {
    sun.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  const s = tier.shadowSpan;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.updateProjectionMatrix();

  // World density is baked at build time — rebuild when the tier changes.
  if (worldQuality !== settings.quality) {
    if (world) disposeWorld(scene, world);
    world = createWorld(scene, settings.quality);
    worldQuality = settings.quality;
  }

  audio.setMuted(!settings.sound);
}

function placeCheckpointVisual() {
  const cp = currentCheckpoint(sim);
  checkpointGroup.visible = Boolean(cp);
  if (!cp) return;
  checkpointGroup.position.copy(cp.position);
  checkpointRing.scale.setScalar(cp.landing ? 0.75 : 1);
}

async function startGame(missionMode) {
  await audio.unlock();
  audio.setMuted(!ui.settings.sound);
  resetSimState(sim, { missionMode });
  aircraft.visible = true;
  cameraRig.mode = 0;
  cameraRig.position.copy(sim.position).add(new THREE.Vector3(0, 6, 20));
  cameraRig.look.copy(sim.position);
  ui.showGame();
  placeCheckpointVisual();
}

function restartCurrent() {
  startGame(sim.missionMode);
}

function backToMenu() {
  sim.running = false;
  ui.showMenu();
}

function handleCrash(reason) {
  sim.crashed = true;
  sim.state = 'CRASH';
  audio.crash();
  ui.showCrash(reason);
}

function handleMissionComplete(result) {
  const save = registerMissionResult(result);
  sim.money = save.money;
  audio.checkpoint();
  ui.showMissionComplete(result);
}

ui.bind({
  onMissionStart: () => startGame(true),
  onFreeFlight: () => startGame(false),
  onRestart: restartCurrent,
  onBackToMenu: backToMenu,
  onSettingsChange: applySettings
});
applySettings(ui.settings);
ui.showMenu();

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(rawDt, 0.045);
  last = now;

  const event = updatePhysics(sim, input, dt, audio);
  if (event?.type === 'reset') restartCurrent();
  if (event?.type === 'crash') handleCrash(event.reason);

  const missionEvent = updateMission(sim);
  if (missionEvent?.type === 'checkpoint') {
    audio.checkpoint();
    placeCheckpointVisual();
  }
  if (missionEvent?.type === 'complete') handleMissionComplete(missionEvent.result);

  checkpointRing.rotation.z += dt * 1.6;
  if (world) {
    world.userData.beacon.material.emissiveIntensity = 1 + Math.max(0, Math.sin(now * 0.004)) * 3;
    // Clouds drift slowly with the wind.
    world.userData.clouds.position.x += sim.wind.x * dt * 0.6;
    world.userData.clouds.position.z += sim.wind.z * dt * 0.6;
    if (Math.abs(world.userData.clouds.position.x) > 1500) world.userData.clouds.position.x = 0;
  }
  updateAircraftVisual(aircraft, sim, dt);
  cameraRig.update(sim, input, dt);
  ui.updateHud(sim, cameraRig, dt);
  if (useComposer) composer.render();
  else renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

animate(performance.now());
