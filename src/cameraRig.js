import * as THREE from 'three';
import { CAMERA_MODES, MS_TO_KT } from './constants.js';
import { clamp } from './utils.js';
import { getOrientationVectors } from './physics.js';

/**
 * Camera modes (cycled with C):
 * 0 Tail Chase — directly behind the aircraft, slightly above the tail, looking forward
 * 1 Cockpit    — pilot's eye view
 * 2 Wing       — off the left wing tip
 * 3 Tower      — fixed on the control tower, tracking the aircraft
 * 4 Free Look  — orbit around the aircraft with the arrow keys
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.position = new THREE.Vector3(0, 12, 46);
    this.look = new THREE.Vector3();
    this.freeYaw = 0;
    this.freePitch = 0.18;
  }

  nextMode() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
  }

  modeName() {
    return CAMERA_MODES[this.mode];
  }

  update(sim, input, dt) {
    if (input.once('KeyC')) this.nextMode();
    const { forward, up, right } = getOrientationVectors(sim);
    const speedKt = Math.max(0, sim.velocity.clone().sub(sim.wind).length() * MS_TO_KT);
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    // Per-mode smoothing: chase/cockpit are tight, exterior views are lazier.
    let posLambda = 4.5;
    let lookLambda = 6.5;

    if (this.mode === 0) {
      // Tail chase: sit right behind the tail, a bit above it, looking ahead
      // over the nose. Distance stretches slightly with speed for a sense of pace.
      const distance = 15 + clamp(speedKt / 22, 0, 9);
      target.copy(sim.position)
        .add(forward.clone().multiplyScalar(-distance))
        .add(up.clone().multiplyScalar(4.2));
      look.copy(sim.position)
        .add(forward.clone().multiplyScalar(55))
        .add(up.clone().multiplyScalar(1.2));
      posLambda = 8;
      lookLambda = 11;
    } else if (this.mode === 1) {
      // Cockpit: near-instant, glued to the airframe.
      target.copy(sim.position).add(forward.clone().multiplyScalar(1.8)).add(up.clone().multiplyScalar(1.55));
      look.copy(target).add(forward.clone().multiplyScalar(180)).add(up.clone().multiplyScalar(0.35));
      posLambda = 30;
      lookLambda = 30;
    } else if (this.mode === 2) {
      // Side chase: behind-left and above, so the whole aircraft stays visible.
      target.copy(sim.position).add(right.clone().multiplyScalar(-10)).add(up.clone().multiplyScalar(3)).add(forward.clone().multiplyScalar(-7));
      look.copy(sim.position).add(forward.clone().multiplyScalar(10));
      posLambda = 14;
      lookLambda = 14;
    } else if (this.mode === 3) {
      // Tower cab, tracking the aircraft.
      target.set(245, 128, -880);
      look.copy(sim.position);
      posLambda = 20;
    } else {
      // Free orbit with arrow keys.
      this.freeYaw += input.axis('ArrowRight', 'ArrowLeft') * dt * 1.4;
      this.freePitch += input.axis('ArrowUp', 'ArrowDown') * dt * 0.9;
      this.freePitch = clamp(this.freePitch, -0.6, 0.8);
      const orbit = new THREE.Vector3(
        Math.sin(this.freeYaw) * 50,
        16 + Math.sin(this.freePitch) * 26,
        Math.cos(this.freeYaw) * 50
      );
      target.copy(sim.position).add(orbit);
      look.copy(sim.position);
    }

    this.position.lerp(target, 1 - Math.exp(-posLambda * dt));
    this.look.lerp(look, 1 - Math.exp(-lookLambda * dt));
    this.camera.position.copy(this.position);

    // Speed feel: the chase view widens its FOV as speed builds.
    const targetFov = this.mode === 0 ? 70 + clamp((speedKt - 120) / 220, 0, 1) * 14 : 72;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }

    // Subtle shake during a stall buffet or a fast ground roll.
    const shake = (sim.stall ? 0.16 : 0) + (sim.onGround && speedKt > 35 ? Math.min(0.09, speedKt / 900) : 0);
    if (shake > 0 && this.mode !== 4) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }

    this.camera.lookAt(this.look);
  }
}
