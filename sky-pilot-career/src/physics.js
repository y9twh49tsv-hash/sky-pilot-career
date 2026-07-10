import * as THREE from 'three';
import { DEG, GRAVITY, MS_TO_KT } from './constants.js';
import { clamp, lerp, wrapAnglePi } from './utils.js';
import { terrainHeight } from './world.js';

function orientationVectors(sim) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(sim.pitch, sim.yaw, sim.roll, 'YXZ'));
  return {
    q,
    forward: new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize(),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(),
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize()
  };
}

function applyDiscreteControls(sim, input, audio) {
  if (input.once('KeyG')) {
    sim.gearDown = !sim.gearDown;
    audio?.gear();
  }
  if (input.once('KeyF')) {
    sim.flaps = clamp(sim.flaps + 10, 0, 30);
    audio?.flaps();
  }
  if (input.once('KeyV')) {
    sim.flaps = clamp(sim.flaps - 10, 0, 30);
    audio?.flaps();
  }
  if (input.once('KeyR')) return 'reset';
  if (input.once('KeyP')) sim.paused = !sim.paused;
  return null;
}

export function updatePhysics(sim, input, dt, audio) {
  const command = applyDiscreteControls(sim, input, audio);
  if (command === 'reset') return { type: 'reset' };
  if (!sim.running || sim.paused || sim.crashed || sim.completed) return null;

  sim.flightTime += dt;

  if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) sim.throttle += dt * 0.38;
  if (input.pressed('ControlLeft') || input.pressed('ControlRight')) sim.throttle -= dt * 0.48;
  sim.throttle = clamp(sim.throttle, 0, sim.fuel <= 0 ? 0 : 1);
  sim.brakes = input.pressed('KeyB') || (sim.onGround && sim.throttle < 0.05 && sim.velocity.length() < 2);
  if (input.pressed('KeyT')) sim.trim += dt * 0.14;
  if (input.pressed('KeyY')) sim.trim -= dt * 0.14;
  sim.trim = clamp(sim.trim, -8 * DEG, 8 * DEG);

  const pitchIn = input.axis('KeyS', 'KeyW');
  const rollIn = input.axis('KeyD', 'KeyA');
  const yawIn = input.axis('KeyE', 'KeyQ');

  const initialVectors = orientationVectors(sim);
  const airVelForAuthority = sim.velocity.clone().sub(sim.wind);
  const speedKtForAuthority = airVelForAuthority.length() * MS_TO_KT;
  const speedFactor = clamp((speedKtForAuthority - 28) / 135, 0.1, 1.75);
  const controlAuthority = sim.onGround ? clamp(speedKtForAuthority / 45, 0.05, 0.55) : speedFactor;

  sim.roll += rollIn * dt * (1.25 * controlAuthority);
  sim.pitch += (pitchIn * 0.54 * controlAuthority + sim.trim * 0.13) * dt;
  sim.yaw += (yawIn * 0.46 * controlAuthority + Math.sin(sim.roll) * clamp(speedKtForAuthority / 130, 0, 0.45)) * dt;

  sim.roll *= Math.pow(0.984, dt * 60);
  sim.pitch = lerp(sim.pitch, sim.trim, dt * 0.18 * clamp(speedKtForAuthority / 80, 0.1, 1));
  sim.pitch = clamp(sim.pitch, -38 * DEG, 38 * DEG);
  sim.roll = clamp(sim.roll, -82 * DEG, 82 * DEG);
  sim.yaw = wrapAnglePi(sim.yaw);

  const { q, forward, up } = orientationVectors(sim);
  const airVel = sim.velocity.clone().sub(sim.wind);
  const speed = Math.max(0.1, airVel.length());
  const speedKt = speed * MS_TO_KT;
  const invQ = q.clone().invert();
  const localV = airVel.clone().applyQuaternion(invQ);
  const alpha = Math.atan2(localV.y, Math.max(1, -localV.z));
  const beta = Math.atan2(localV.x, Math.max(1, -localV.z));
  sim.alpha = alpha;
  sim.beta = beta;

  const rho = 1.225 * Math.exp(-Math.max(0, sim.position.y) / 8400);
  const dynamic = 0.5 * rho * speed * speed;
  const flapCl = sim.flaps / 30 * 0.72;
  let cl = 0.22 + 5.2 * alpha + flapCl;
  const stallLimit = (15 + sim.flaps * 0.10) * DEG;
  const stallAbs = Math.abs(alpha) > stallLimit;
  if (stallAbs) {
    const drop = clamp(1 - (Math.abs(alpha) - stallLimit) / (23 * DEG), 0.12, 1);
    cl *= drop;
  }
  cl = clamp(cl, -1.05, 1.8);

  const cd0 = 0.026 + (sim.gearDown ? 0.026 : 0) + (sim.flaps / 30) * 0.072 + (sim.brakes && sim.onGround ? 0.16 : 0);
  const induced = 0.064 * cl * cl;
  const sideDrag = Math.abs(beta) * 0.08;
  const cd = cd0 + induced + sideDrag;

  const lift = dynamic * sim.wingArea * cl;
  const drag = dynamic * sim.wingArea * cd;
  sim.liftN = lift;
  sim.dragN = drag;
  sim.stall = stallAbs && speedKt > 33 && !sim.onGround;

  const velDir = airVel.clone().normalize();
  const liftDir = up.clone().sub(velDir.clone().multiplyScalar(up.dot(velDir))).normalize();
  if (!Number.isFinite(liftDir.x)) liftDir.copy(up);

  const enginePowerAtAltitude = clamp(1 - Math.max(0, sim.position.y - 3500) / 12000, 0.42, 1);
  const thrustN = sim.maxThrust * sim.throttle * enginePowerAtAltitude;

  const force = new THREE.Vector3();
  force.add(forward.clone().multiplyScalar(thrustN));
  force.add(liftDir.multiplyScalar(lift));
  force.add(airVel.clone().normalize().multiplyScalar(-drag));
  force.add(new THREE.Vector3(0, -GRAVITY * sim.mass, 0));

  if (sim.stall) {
    force.add(up.clone().multiplyScalar(-sim.mass * 2.7));
    sim.pitch -= dt * 0.18;
    sim.roll += Math.sin(performance.now() * 0.006) * 0.09 * dt;
    audio?.stall(true);
  } else {
    audio?.stall(false);
  }

  const acc = force.multiplyScalar(1 / sim.mass);
  sim.lastAcc.copy(acc);
  sim.velocity.add(acc.multiplyScalar(dt));
  sim.position.add(sim.velocity.clone().multiplyScalar(dt));

  sim.fuel = Math.max(0, sim.fuel - dt * (0.000012 + sim.throttle * 0.00005));
  audio?.engine(sim.throttle, speedKt);

  const ground = terrainHeight(sim.position.x, sim.position.z) + 1.35;
  const verticalSpeed = sim.velocity.y;
  if (sim.position.y <= ground) {
    const onRunway = Math.abs(sim.position.x) < 48 && sim.position.z > -1210 && sim.position.z < 1210;
    if (!sim.onGround) {
      sim.lastTouchdown = {
        verticalSpeed,
        speedKt,
        onRunway,
        bankDeg: Math.abs(sim.roll / DEG),
        gearDown: sim.gearDown
      };
      audio?.touchdown(Math.abs(verticalSpeed));
    }
    if (!sim.onGround && (Math.abs(verticalSpeed) > 4.6 || Math.abs(sim.roll) > 23 * DEG || !sim.gearDown || !onRunway)) {
      return {
        type: 'crash',
        reason: onRunway ? 'Harte Landung / Fahrwerk prüfen' : 'Geländeberührung außerhalb der Landebahn'
      };
    }
    sim.position.y = ground;
    sim.velocity.y = Math.max(0, sim.velocity.y);
    const groundFriction = sim.brakes ? 0.86 : 0.992;
    sim.velocity.x *= Math.pow(groundFriction, dt * 60);
    sim.velocity.z *= Math.pow(groundFriction, dt * 60);
    if (speedKt < 8 && sim.throttle < 0.08) sim.velocity.multiplyScalar(Math.pow(0.90, dt * 60));
    sim.onGround = true;
    sim.roll = lerp(sim.roll, 0, dt * 4.2);
  } else {
    sim.onGround = false;
  }

  if (sim.position.y > 12500) return { type: 'crash', reason: 'Strukturversagen: zu hoch für diese Maschine' };
  if (speedKt > 360) return { type: 'crash', reason: 'Overspeed: Flugzeugstruktur überlastet' };
  if (Math.abs(sim.position.x) > 5600 || Math.abs(sim.position.z) > 5600) {
    sim.position.x = clamp(sim.position.x, -5400, 5400);
    sim.position.z = clamp(sim.position.z, -5400, 5400);
  }

  if (sim.onGround && speedKt < 15) sim.state = 'TAXI';
  else if (sim.onGround) sim.state = 'TAKEOFF';
  else if (sim.stall) sim.state = 'STALL';
  else if (sim.position.y < 40 && Math.abs(sim.position.x) < 80 && Math.abs(sim.position.z) < 1300) sim.state = 'APPROACH';
  else sim.state = 'AIRBORNE';

  sim.gload = clamp(lift / (sim.mass * GRAVITY), -1.5, 4.8);
  return null;
}

export function getOrientationVectors(sim) {
  return orientationVectors(sim);
}
