import * as THREE from 'three';

function addAircraftLighting(aircraft) {
  const red = new THREE.MeshStandardMaterial({ color: 0xff1d1d, emissive: 0xff0000, emissiveIntensity: 3.5 });
  const green = new THREE.MeshStandardMaterial({ color: 0x24ff6a, emissive: 0x00ff55, emissiveIntensity: 3.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2 });
  const geo = new THREE.SphereGeometry(0.09, 12, 8);
  const lRed = new THREE.Mesh(geo, red);
  lRed.position.set(-5.6, 0.2, -0.25);
  const lGreen = new THREE.Mesh(geo, green);
  lGreen.position.set(5.6, 0.2, -0.25);
  const lTail = new THREE.Mesh(geo, white);
  lTail.position.set(0, 0.36, 4.45);
  aircraft.add(lRed, lGreen, lTail);

  const landing = new THREE.SpotLight(0xfff7df, 18, 170, 0.18, 0.4, 1.2);
  landing.position.set(0, -0.18, -3.55);
  landing.target.position.set(0, -8, -72);
  aircraft.add(landing, landing.target);
}

export function createAircraftModel() {
  const aircraft = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.48, metalness: 0.06 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f5b99, roughness: 0.45, metalness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6ac7ff, roughness: 0.2, metalness: 0.02, transparent: true, opacity: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.7, metalness: 0.1 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 6.9, 28), white);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.35;
  fuselage.castShadow = true;
  aircraft.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.54, 1.0, 28), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.55;
  nose.castShadow = true;
  aircraft.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 28), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 4.3;
  tailCone.castShadow = true;
  aircraft.add(tailCone);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.12, 1.45), white);
  wing.position.set(0, -0.04, -0.45);
  wing.castShadow = true;
  aircraft.add(wing);

  const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.13, 0.14), blue);
  wingStripe.position.set(0, 0.04, -1.17);
  aircraft.add(wingStripe);

  const vtail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.95, 1.45), white);
  vtail.position.set(0, 0.78, 3.92);
  vtail.rotation.x = -0.18;
  vtail.castShadow = true;
  aircraft.add(vtail);

  const htail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.0), white);
  htail.position.set(0, 0.36, 3.92);
  htail.castShadow = true;
  aircraft.add(htail);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.74, 1.35), glass);
  cockpit.position.set(0, 0.62, -1.83);
  cockpit.rotation.x = -0.1;
  aircraft.add(cockpit);

  const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.15, 18);
  const wheels = [];
  for (const p of [[-1.35, -0.55, -0.75], [1.35, -0.55, -0.75], [0, -0.50, -3.0]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(...p);
    w.castShadow = true;
    aircraft.add(w);
    wheels.push(w);
  }

  const propGroup = new THREE.Group();
  propGroup.position.set(0, 0, -4.09);
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.35, 0.05), dark);
  const blade2 = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.11, 0.05), dark);
  propGroup.add(blade1, blade2);
  aircraft.add(propGroup);

  const pitot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.8), dark);
  pitot.position.set(0.55, 0.1, -3.75);
  aircraft.add(pitot);

  addAircraftLighting(aircraft);
  aircraft.userData.prop = propGroup;
  aircraft.userData.wheels = wheels;
  return aircraft;
}

export function updateAircraftVisual(aircraft, sim, dt) {
  aircraft.position.copy(sim.position);
  aircraft.rotation.set(sim.pitch, sim.yaw, sim.roll, 'YXZ');
  if (aircraft.userData.prop) {
    aircraft.userData.prop.rotation.z += dt * (18 + sim.throttle * 220);
  }
  if (aircraft.userData.wheels) {
    for (const wheel of aircraft.userData.wheels) wheel.visible = sim.gearDown;
  }
}
