import * as THREE from 'three';

/**
 * Procedural low-wing GA aircraft (SR22-style). No external assets:
 * smooth lathe fuselage, tapered wings with working ailerons + flaps,
 * stabilator + rudder, retracting gear, 3-blade prop with blur disc,
 * nav lights, strobe and landing light. All control surfaces animate
 * from the sim state in updateAircraftVisual().
 */

const paintWhite = new THREE.MeshPhysicalMaterial({
  color: 0xf2f4f7, roughness: 0.32, metalness: 0.08, clearcoat: 0.7, clearcoatRoughness: 0.25
});
const paintBlue = new THREE.MeshPhysicalMaterial({
  color: 0x1c5aa8, roughness: 0.3, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.25
});
const paintDark = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.55, metalness: 0.25 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd7dde4, roughness: 0.25, metalness: 0.9 });
const glass = new THREE.MeshPhysicalMaterial({
  color: 0x2a3846, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.72,
  clearcoat: 1, envMapIntensity: 1.6
});

/** Tapered wing slab: span along X, chord along Z, thickness along Y. */
function makeWing({ span, rootChord, tipChord, thickness, sweep = 0, dihedral = 0 }) {
  const geo = new THREE.BoxGeometry(span, thickness, rootChord, 1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.abs(pos.getX(i)) / (span / 2); // 0 root → 1 tip
    const chordScale = 1 + (tipChord / rootChord - 1) * t;
    pos.setZ(i, pos.getZ(i) * chordScale + sweep * t);
    pos.setY(i, pos.getY(i) * (1 - 0.45 * t) + dihedral * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Fuselage profile via lathe: radius along length, rotated to lie on Z. */
function makeFuselage() {
  const profile = [
    [-4.05, 0.10], [-3.85, 0.30], [-3.45, 0.46], [-2.6, 0.58], [-1.6, 0.64],
    [-0.6, 0.62], [0.6, 0.55], [1.8, 0.44], [3.0, 0.30], [4.1, 0.19], [4.6, 0.10]
  ].map(([z, r]) => new THREE.Vector2(r, -z));
  const geo = new THREE.LatheGeometry(profile, 28);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function addLighting(aircraft) {
  const geo = new THREE.SphereGeometry(0.08, 10, 8);
  const mk = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3.5 });
  const lRed = new THREE.Mesh(geo, mk(0xff2020));
  lRed.position.set(-5.45, 0.14, -0.15);
  const lGreen = new THREE.Mesh(geo, mk(0x22ff66));
  lGreen.position.set(5.45, 0.14, -0.15);
  const lTail = new THREE.Mesh(geo, mk(0xffffff));
  lTail.position.set(0, 0.3, 4.65);
  aircraft.add(lRed, lGreen, lTail);

  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mk(0xffffff));
  strobe.position.set(0, 2.05, 4.55);
  aircraft.add(strobe);
  aircraft.userData.strobe = strobe;

  const landing = new THREE.SpotLight(0xfff7df, 18, 170, 0.18, 0.4, 1.2);
  landing.position.set(0, -0.18, -3.55);
  landing.target.position.set(0, -8, -72);
  aircraft.add(landing, landing.target);
}

export function createAircraftModel() {
  const aircraft = new THREE.Group();

  const fuselage = new THREE.Mesh(makeFuselage(), paintWhite);
  fuselage.castShadow = true;
  aircraft.add(fuselage);

  // Blue belly accent stripe
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.585, 0.45, 3.4, 24, 1, true), paintBlue);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, -0.12, 0.9);
  stripe.scale.y = 0.98;
  aircraft.add(stripe);

  // Engine cowling + spinner
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.56, 0.8, 24), paintDark);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = -3.72;
  aircraft.add(cowl);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 20), chrome);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.35;
  aircraft.add(spinner);

  // Canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass);
  canopy.scale.set(0.52, 0.52, 1.35);
  canopy.position.set(0, 0.52, -1.15);
  aircraft.add(canopy);

  // --- Wings with ailerons + flaps ---------------------------------------
  const wing = new THREE.Mesh(
    makeWing({ span: 11, rootChord: 1.75, tipChord: 0.95, thickness: 0.17, sweep: 0.3, dihedral: 0.42 }),
    paintWhite
  );
  wing.position.set(0, -0.18, -0.35);
  wing.castShadow = true;
  aircraft.add(wing);

  const tipL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.9, 4, 10), paintBlue);
  tipL.rotation.x = Math.PI / 2;
  tipL.position.set(-5.48, 0.22, -0.05);
  const tipR = tipL.clone();
  tipR.position.x = 5.48;
  aircraft.add(tipL, tipR);

  // Control surfaces: pivot groups hinged at the wing trailing edge.
  function surface(width, chord, x, y, z, material = paintWhite) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, chord), material);
    mesh.position.z = chord / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    aircraft.add(pivot);
    return pivot;
  }
  const ailL = surface(1.7, 0.34, -4.2, 0.11, 0.42);
  const ailR = surface(1.7, 0.34, 4.2, 0.11, 0.42);
  const flapL = surface(2.6, 0.4, -1.9, -0.05, 0.52, paintBlue);
  const flapR = surface(2.6, 0.4, 1.9, -0.05, 0.52, paintBlue);

  // --- Tail: fin (extruded shape), rudder, stabilator ---------------------
  const finShape = new THREE.Shape();
  finShape.moveTo(-3.0, 0.1);
  finShape.lineTo(-4.55, 0.15);
  finShape.lineTo(-4.85, 2.0);
  finShape.lineTo(-4.35, 2.0);
  finShape.quadraticCurveTo(-3.4, 1.0, -3.0, 0.1);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.09, bevelEnabled: false });
  finGeo.rotateY(Math.PI / 2);
  finGeo.translate(-0.045, 0, 0);
  const fin = new THREE.Mesh(finGeo, paintBlue);
  fin.castShadow = true;
  aircraft.add(fin);

  const rudder = new THREE.Group();
  rudder.position.set(0, 1.0, 4.75);
  const rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.45), paintWhite);
  rudderMesh.position.set(0, 0.1, 0.22);
  rudder.add(rudderMesh);
  aircraft.add(rudder);

  const stab = new THREE.Mesh(
    makeWing({ span: 3.9, rootChord: 1.0, tipChord: 0.55, thickness: 0.09, sweep: 0.22 }),
    paintWhite
  );
  stab.position.set(0, 0.28, 4.05);
  stab.castShadow = true;
  aircraft.add(stab);

  // --- Retractable gear: pivot legs fold forward into the belly -----------
  function gearLeg(x, z, wheelR) {
    const leg = new THREE.Group();
    leg.position.set(x, -0.42, z);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 10), chrome);
    strut.position.y = -0.31;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.16, 16), rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -0.62;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, 0.17, 10), chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.y = -0.62;
    strut.castShadow = wheel.castShadow = true;
    leg.add(strut, wheel, hub);
    aircraft.add(leg);
    return leg;
  }
  const gearLegs = [gearLeg(0, -2.85, 0.2), gearLeg(-1.2, -0.15, 0.25), gearLeg(1.2, -0.15, 0.25)];

  // --- Prop: 3 blades + translucent blur disc at speed --------------------
  const propGroup = new THREE.Group();
  propGroup.position.set(0, 0, -4.18);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.28, 0.045), paintDark);
    blade.position.y = 0.64;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    propGroup.add(holder);
  }
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 28),
    new THREE.MeshBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  propGroup.add(blurDisc);
  aircraft.add(propGroup);

  addLighting(aircraft);
  aircraft.userData = {
    ...aircraft.userData,
    prop: propGroup, blurDisc, gearLegs,
    ailL, ailR, flapL, flapR, rudder, stab
  };
  return aircraft;
}

export function updateAircraftVisual(aircraft, sim, dt) {
  aircraft.position.copy(sim.position);
  aircraft.rotation.set(sim.pitch, sim.yaw, sim.roll, 'YXZ');
  const u = aircraft.userData;

  if (u.prop) {
    u.prop.rotation.z += dt * (6 + sim.rpm * 75);
    u.blurDisc.material.opacity = Math.min(0.28, sim.rpm * 0.4);
  }

  // Control surfaces follow the stick; flaps/gear follow their actual positions.
  if (u.ailL) {
    u.ailL.rotation.x = -sim.controls.roll * 0.45;
    u.ailR.rotation.x = sim.controls.roll * 0.45;
    u.flapL.rotation.x = u.flapR.rotation.x = (sim.flapsPos / 30) * 0.6;
    u.rudder.rotation.y = -sim.controls.yaw * 0.5;
    u.stab.rotation.x = -sim.controls.pitch * 0.28 - sim.trim * 0.6;
  }

  // Gear legs fold forward as gearPos goes 1 → 0.
  if (u.gearLegs) {
    for (const leg of u.gearLegs) {
      leg.rotation.x = (1 - sim.gearPos) * -1.7;
      leg.visible = sim.gearPos > 0.02;
    }
  }

  if (u.strobe) {
    // Double-flash strobe pattern, ~1 s period.
    const t = performance.now() % 1000;
    u.strobe.visible = t < 60 || (t > 140 && t < 200);
  }
}
