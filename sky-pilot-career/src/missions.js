import * as THREE from 'three';
import { FT, MS_TO_KT, NM } from './constants.js';
import { clamp } from './utils.js';

export const missionOne = {
  name: 'Runway 27 Training Circuit',
  checkpoints: [
    { id: 'climb', label: 'Steigflug: erreiche 650 ft', position: new THREE.Vector3(0, 200, -1150), radius: 210, minAltFt: 550 },
    { id: 'left-downwind', label: 'Downwind Checkpoint', position: new THREE.Vector3(-1450, 320, -900), radius: 260 },
    { id: 'base', label: 'Base Turn', position: new THREE.Vector3(-1500, 260, 700), radius: 260 },
    { id: 'final', label: 'Final Approach', position: new THREE.Vector3(-150, 150, 1180), radius: 260 },
    { id: 'land', label: 'Lande auf Runway 27', position: new THREE.Vector3(0, 5, 280), radius: 140, landing: true }
  ]
};

export function currentCheckpoint(sim) {
  if (!sim.missionMode) return null;
  return missionOne.checkpoints[sim.checkpointIndex] ?? null;
}

export function updateMission(sim) {
  if (!sim.missionMode || sim.completed || sim.crashed) return null;
  const cp = currentCheckpoint(sim);
  if (!cp) return null;

  const distance = sim.position.distanceTo(cp.position);
  const altitudeFt = sim.position.y * FT;
  const speedKt = sim.velocity.length() * MS_TO_KT;

  if (!cp.landing) {
    const altitudeOk = cp.minAltFt ? altitudeFt >= cp.minAltFt : true;
    if (distance <= cp.radius && altitudeOk) {
      sim.checkpointIndex += 1;
      return { type: 'checkpoint', checkpoint: cp };
    }
  } else if (sim.onGround && Math.abs(sim.position.x) < 45 && sim.position.z > -1050 && sim.position.z < 1050 && speedKt < 38 && sim.lastTouchdown?.onRunway) {
    const result = scoreLanding(sim);
    sim.score = result.score;
    sim.money = result.money;
    sim.xp = result.xp;
    sim.completed = true;
    return { type: 'complete', result };
  }

  return null;
}

export function scoreLanding(sim) {
  const touchdown = sim.lastTouchdown ?? { verticalSpeed: -6, speedKt: 100, bankDeg: 35, onRunway: false, gearDown: sim.gearDown };
  const vsFpm = Math.abs(touchdown.verticalSpeed * FT * 60);
  const speedError = Math.abs(touchdown.speedKt - 72);
  const centerlineError = Math.abs(sim.position.x);
  const timePenalty = Math.min(180, sim.flightTime) * 1.2;

  let score = 1000;
  score -= clamp(vsFpm - 160, 0, 650) * 0.72;
  score -= clamp(speedError - 4, 0, 60) * 5.5;
  score -= clamp(centerlineError, 0, 60) * 4.0;
  score -= clamp(touchdown.bankDeg, 0, 30) * 7.0;
  score -= timePenalty;
  if (!touchdown.gearDown) score -= 400;
  if (!touchdown.onRunway) score -= 600;
  score = Math.round(clamp(score, 0, 1000));

  return {
    score,
    money: Math.round(150 + score * 2.4),
    xp: Math.round(40 + score * 0.28),
    verticalSpeedFpm: Math.round(vsFpm),
    touchdownSpeedKt: Math.round(touchdown.speedKt),
    centerlineError: Math.round(centerlineError),
    flightTime: Math.round(sim.flightTime)
  };
}

export function checkpointDistanceNm(sim) {
  const cp = currentCheckpoint(sim);
  if (!cp) return 0;
  return sim.position.distanceTo(cp.position) / NM;
}

export function objectiveText(sim) {
  if (!sim.missionMode) return 'Free Flight';
  const cp = currentCheckpoint(sim);
  if (!cp) return 'Mission complete';
  return cp.label;
}
