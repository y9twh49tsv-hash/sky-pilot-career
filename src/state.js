import * as THREE from 'three';
import { DEG } from './constants.js';

export function createInitialSimState() {
  return {
    running: false,
    missionMode: true,
    paused: false,
    crashed: false,
    completed: false,
    position: new THREE.Vector3(0, 1.35, 980),
    velocity: new THREE.Vector3(0, 0, -0.5),
    wind: new THREE.Vector3(4.0, 0, -1.5),
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0,
    // Engine power actually delivered (0..1) — lags behind throttle to model spool-up.
    rpm: 0,
    trim: 0,
    flaps: 0,
    gearDown: true,
    brakes: true,
    fuel: 1,
    mass: 1420,
    wingArea: 16.6,
    maxThrust: 17800,
    alpha: 0,
    beta: 0,
    gload: 1,
    liftN: 0,
    dragN: 0,
    stall: false,
    stallWarn: false,
    overspeedWarn: false,
    onGround: true,
    state: 'READY',
    lastAcc: new THREE.Vector3(),
    lastTouchdown: null,
    score: 0,
    xp: 0,
    money: 0,
    checkpointIndex: 0,
    missionStartTime: performance.now(),
    flightTime: 0,
    damage: 0,
    dayNight: 0
  };
}

export function resetSimState(sim, { missionMode = true } = {}) {
  Object.assign(sim, createInitialSimState());
  sim.missionMode = missionMode;
  sim.running = true;
  sim.brakes = missionMode;
  sim.wind.set(4.0, 0, -1.5);
  if (!missionMode) {
    // Free flight starts already airborne on downwind for instant fun.
    sim.position.set(0, 450, 920);
    sim.velocity.set(0, 0, -70);
    sim.pitch = -2 * DEG;
    sim.throttle = 0.75;
    sim.rpm = 0.75;
    sim.gearDown = false;
    sim.brakes = false;
    sim.onGround = false;
  }
}
