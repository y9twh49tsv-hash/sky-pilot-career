import * as THREE from 'three';
import { createWorld } from './world.js';
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.4));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89c8ff);
scene.fog = new THREE.FogExp2(0x9fd1ff, 0.00017);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 22000);
const sun = new THREE.DirectionalLight(0xfff5dc, 3.2);
sun.position.set(-950, 1600, -900);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -900;
sun.shadow.camera.right = 900;
sun.shadow.camera.top = 900;
sun.shadow.camera.bottom = -900;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 4200;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbddfff, 0x536341, 1.25));

createWorld(scene);
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

function placeCheckpointVisual() {
  const cp = currentCheckpoint(sim);
  checkpointGroup.visible = Boolean(cp);
  if (!cp) return;
  checkpointGroup.position.copy(cp.position);
  checkpointRing.scale.setScalar(cp.landing ? 0.75 : 1);
}

async function startGame(missionMode) {
  await audio.unlock();
  resetSimState(sim, { missionMode });
  aircraft.visible = true;
  cameraRig.mode = 0;
  cameraRig.position.copy(sim.position).add(new THREE.Vector3(0, 10, 48));
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
  onBackToMenu: backToMenu
});
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
  updateAircraftVisual(aircraft, sim, dt);
  cameraRig.update(sim, input, dt);
  ui.updateHud(sim, cameraRig, dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

animate(performance.now());
