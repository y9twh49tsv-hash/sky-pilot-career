import * as THREE from 'three';
import { DEG, GRAVITY, MS_TO_KT, OVERSPEED_WARN_KT, OVERSPEED_CRASH_KT } from './constants.js';
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

  // --- Throttle & engine spool ------------------------------------------
  if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) sim.throttle += dt * 0.55;
  if (input.pressed('ControlLeft') || input.pressed('ControlRight')) sim.throttle -= dt * 0.65;
  sim.throttle = clamp(sim.throttle, 0, sim.fuel <= 0 ? 0 : 1);
  // Engine power lags the lever: fast-ish spool up, slightly faster spool down.
  const spoolRate = sim.rpm < sim.throttle ? 1.6 : 2.2;
  sim.rpm = lerp(sim.rpm, sim.throttle, 1 - Math.exp(-spoolRate * dt));
  if (sim.fuel <= 0) sim.rpm = lerp(sim.rpm, 0, 1 - Math.exp(-0.8 * dt));

  sim.brakes = input.pressed('KeyB') || (sim.onGround && sim.throttle < 0.05 && sim.velocity.length() < 2);
  if (input.pressed('KeyT')) sim.trim += dt * 0.14;
  if (input.pressed('KeyY')) sim.trim -= dt * 0.14;
  sim.trim = clamp(sim.trim, -8 * DEG, 8 * DEG);

  // Flaps and gear take time to move; aero forces use the actual positions.
  sim.flapsPos += clamp(sim.flaps - sim.flapsPos, -9 * dt, 9 * dt);
  sim.gearPos += clamp((sim.gearDown ? 1 : 0) - sim.gearPos, -dt / 1.4, dt / 1.4);

  // --- Attitude control -------------------------------------------------
  const pitchIn = input.axis('KeyS', 'KeyW');
  const rollIn = input.axis('KeyD', 'KeyA');
  const yawIn = input.axis('KeyE', 'KeyQ');
  sim.controls.pitch = pitchIn;
  sim.controls.roll = rollIn;
  sim.controls.yaw = yawIn;

  const airVelForAuthority = sim.velocity.clone().sub(sim.wind);
  const speedKtForAuthority = airVelForAuthority.length() * MS_TO_KT;
  const speedFactor = clamp((speedKtForAuthority - 25) / 120, 0.12, 1.9);
  const controlAuthority = sim.onGround ? clamp(speedKtForAuthority / 42, 0.06, 0.65) : speedFactor;

  sim.roll += rollIn * dt * (2.1 * controlAuthority);
  sim.pitch += (pitchIn * 0.95 * controlAuthority + sim.trim * 0.13) * dt;
  sim.yaw += (yawIn * 0.6 * controlAuthority + Math.sin(sim.roll) * clamp(speedKtForAuthority / 130, 0, 0.5)) * dt;

  // Natural roll/pitch stability: wings level out slowly, nose seeks trim.
  sim.roll *= Math.pow(0.988, dt * 60);
  sim.pitch = lerp(sim.pitch, sim.trim, dt * 0.14 * clamp(speedKtForAuthority / 80, 0.1, 1));
  sim.pitch = clamp(sim.pitch, -45 * DEG, 45 * DEG);
  sim.roll = clamp(sim.roll, -85 * DEG, 85 * DEG);
  sim.yaw = wrapAnglePi(sim.yaw);

  // --- Aerodynamics -----------------------------------------------------
  const { q, forward, up } = orientationVectors(sim);
  const airVel = sim.velocity.clone().sub(sim.wind);
  const speed = Math.max(0.1, airVel.length());
  const speedKt = speed * MS_TO_KT;
  const invQ = q.clone().invert();
  const localV = airVel.clone().applyQuaternion(invQ);
  // Angle of attack: positive when the nose is above the velocity vector
  // (relative wind from below). localV.y is negative in that case, hence the minus.
  const alpha = Math.atan2(-localV.y, Math.max(1, -localV.z));
  const beta = Math.atan2(localV.x, Math.max(1, -localV.z));
  sim.alpha = alpha;
  sim.beta = beta;

  const rho = 1.225 * Math.exp(-Math.max(0, sim.position.y) / 8400);
  const dynamic = 0.5 * rho * speed * speed;

  // Lift: base camber + AoA slope + flap increment, with post-stall drop-off.
  const flapCl = sim.flapsPos / 30 * 0.72;
  let cl = 0.22 + 5.2 * alpha + flapCl;
  const stallLimit = (15 + sim.flapsPos * 0.10) * DEG;
  const stallAbs = Math.abs(alpha) > stallLimit;
  if (stallAbs) {
    const drop = clamp(1 - (Math.abs(alpha) - stallLimit) / (23 * DEG), 0.12, 1);
    cl *= drop;
  }
  cl = clamp(cl, -1.05, 1.8);

  // Drag: parasitic (gear/flaps/wheel brakes add) + induced + sideslip.
  const cd0 = 0.023 + sim.gearPos * 0.024 + (sim.flapsPos / 30) * 0.07 + (sim.brakes && sim.onGround ? 0.16 : 0);
  const induced = 0.06 * cl * cl;
  const sideDrag = Math.abs(beta) * 0.08;
  const cd = cd0 + induced + sideDrag;

  const lift = dynamic * sim.wingArea * cl;
  const drag = dynamic * sim.wingArea * cd;
  sim.liftN = lift;
  sim.dragN = drag;
  sim.stall = stallAbs && speedKt > 33 && !sim.onGround;
  // Pre-stall buffet warning a little before the wing actually lets go.
  sim.stallWarn = sim.stall || (!sim.onGround && speedKt > 33 && Math.abs(alpha) > stallLimit * 0.82);
  sim.overspeedWarn = speedKt > OVERSPEED_WARN_KT;

  const velDir = airVel.clone().normalize();
  const liftDir = up.clone().sub(velDir.clone().multiplyScalar(up.dot(velDir))).normalize();
  if (!Number.isFinite(liftDir.x)) liftDir.copy(up);

  // --- Thrust: strong static thrust, prop efficiency fades at high TAS --
  const enginePowerAtAltitude = clamp(1 - Math.max(0, sim.position.y - 3500) / 12000, 0.42, 1);
  const propEfficiency = clamp(1 - (speedKt - 200) / 300, 0.25, 1);
  const thrustN = sim.maxThrust * sim.rpm * enginePowerAtAltitude * propEfficiency;

  const force = new THREE.Vector3();
  force.add(forward.clone().multiplyScalar(thrustN));
  force.add(liftDir.multiplyScalar(lift));
  force.add(airVel.clone().normalize().multiplyScalar(-drag));
  force.add(new THREE.Vector3(0, -GRAVITY * sim.mass, 0));

  if (sim.stall) {
    // Deep stall: extra sink, nose drop and wing rock.
    force.add(up.clone().multiplyScalar(-sim.mass * 2.7));
    sim.pitch -= dt * 0.18;
    sim.roll += Math.sin(performance.now() * 0.006) * 0.09 * dt;
  }
  audio?.stall(sim.stallWarn);

  const acc = force.multiplyScalar(1 / sim.mass);
  sim.lastAcc.copy(acc);
  sim.velocity.add(acc.multiplyScalar(dt));
  sim.position.add(sim.velocity.clone().multiplyScalar(dt));

  // Fuel burn: idle trickle + throttle-proportional. Full tank ≈ 45 min at max power.
  sim.fuel = Math.max(0, sim.fuel - dt * (0.00004 + sim.rpm * 0.00033));
  audio?.engine(sim.rpm, speedKt);

  // --- Ground contact & landing ----------------------------------------
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
        gearDown: sim.gearDown && sim.gearPos > 0.95
      };
      audio?.touchdown(Math.abs(verticalSpeed));
    }
    // Hard landing, banked touchdown, gear up or off-runway = crash.
    if (!sim.onGround && (Math.abs(verticalSpeed) > 4.6 || Math.abs(sim.roll) > 23 * DEG || sim.gearPos < 0.95 || !onRunway)) {
      return {
        type: 'crash',
        reason: onRunway ? 'Harte Landung / Fahrwerk prüfen' : 'Geländeberührung außerhalb der Landebahn'
      };
    }
    sim.position.y = ground;
    sim.velocity.y = Math.max(0, sim.velocity.y);
    // Rolling friction fades as the wings unload weight; wheel brakes are strong.
    const liftRatio = clamp(lift / (sim.mass * GRAVITY), 0, 1);
    const groundFriction = sim.brakes ? 0.955 : 1 - 0.0015 * (1 - liftRatio);
    sim.velocity.x *= Math.pow(groundFriction, dt * 60);
    sim.velocity.z *= Math.pow(groundFriction, dt * 60);
    if (speedKt < 8 && sim.throttle < 0.08) sim.velocity.multiplyScalar(Math.pow(0.90, dt * 60));
    sim.onGround = true;
    sim.roll = lerp(sim.roll, 0, dt * 4.2);
  } else {
    sim.onGround = false;
  }

  // --- Structural limits & world bounds ---------------------------------
  if (sim.position.y > 12500) return { type: 'crash', reason: 'Strukturversagen: zu hoch für diese Maschine' };
  if (speedKt > OVERSPEED_CRASH_KT) return { type: 'crash', reason: 'Overspeed: Flugzeugstruktur überlastet' };
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
