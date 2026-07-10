import * as THREE from 'three';
import { CAMERA_MODES, MS_TO_KT } from './constants.js';
import { clamp } from './utils.js';
import { getOrientationVectors } from './physics.js';

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

    if (this.mode === 0) {
      const distance = 24 + clamp(speedKt / 9, 0, 32);
      target.copy(sim.position)
        .add(forward.clone().multiplyScalar(-distance))
        .add(up.clone().multiplyScalar(7.5));
      look.copy(sim.position)
        .add(forward.clone().multiplyScalar(32))
        .add(up.clone().multiplyScalar(2.5));
    } else if (this.mode === 1) {
      target.copy(sim.position).add(forward.clone().multiplyScalar(1.8)).add(up.clone().multiplyScalar(1.55));
      look.copy(target).add(forward.clone().multiplyScalar(180)).add(up.clone().multiplyScalar(0.35));
    } else if (this.mode === 2) {
      target.set(245, 121, -880);
      look.copy(sim.position);
    } else if (this.mode === 3) {
      target.copy(sim.position).add(right.clone().multiplyScalar(-12)).add(up.clone().multiplyScalar(2.6)).add(forward.clone().multiplyScalar(-1.2));
      look.copy(sim.position).add(forward.clone().multiplyScalar(90));
    } else {
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

    this.position.lerp(target, 1 - Math.pow(0.02, dt));
    this.look.lerp(look, 1 - Math.pow(0.04, dt));
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
  }
}
