import * as THREE from 'three';
import { smoothstep } from './utils.js';

export function terrainHeight(x, z) {
  const runwayZone = Math.abs(x) < 65 && z > -2300 && z < 2300;
  const airportZone = Math.abs(x) < 360 && z > -2600 && z < 2600;
  if (runwayZone) return 0;
  let h = Math.sin(x * 0.004) * 12 + Math.cos(z * 0.003) * 10;
  h += Math.sin((x + z) * 0.0018) * 22;
  const distance = Math.sqrt(x * x + z * z);
  h += smoothstep(1200, 4200, distance) * (Math.sin(x * 0.0017) * 110 + Math.cos(z * 0.0013) * 140 + 150);
  if (airportZone) h *= 0.14;
  return Math.max(-4, h);
}

function addBox(parent, name, size, pos, color, rough = 0.75, metal = 0.0) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  mesh.name = name;
  mesh.position.copy(pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeTerrain(world) {
  const size = 9000;
  const segments = 220;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  geo.computeVertexNormals();

  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 3) c.setHex(0x587f3f);
    else if (y < 70) c.setHex(0x668a45);
    else if (y < 180) c.setHex(0x6d7250);
    else c.setHex(0xb7bdba);
    colors.push(c.r, c.g, c.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }));
  mesh.receiveShadow = true;
  world.add(mesh);

  const grid = new THREE.GridHelper(size, 90, 0x2a512e, 0x335e37);
  grid.position.y = 0.25;
  grid.material.opacity = 0.14;
  grid.material.transparent = true;
  world.add(grid);
}

function makeSkyDome(world) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0b3f96');
  grad.addColorStop(0.28, '#2f7ad1');
  grad.addColorStop(0.52, '#8ac8ff');
  grad.addColorStop(0.78, '#cfe6f7');
  grad.addColorStop(1, '#f8e2bc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 512);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10500, 48, 24), mat);
  world.add(dome);

  // Visible sun disc with a soft glow, placed toward the directional light.
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 128;
  sunCanvas.height = 128;
  const sctx = sunCanvas.getContext('2d');
  const sunGrad = sctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  sunGrad.addColorStop(0, 'rgba(255,252,235,1)');
  sunGrad.addColorStop(0.25, 'rgba(255,244,200,0.95)');
  sunGrad.addColorStop(0.6, 'rgba(255,228,150,0.28)');
  sunGrad.addColorStop(1, 'rgba(255,228,150,0)');
  sctx.fillStyle = sunGrad;
  sctx.fillRect(0, 0, 128, 128);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(sunCanvas),
    transparent: true,
    depthWrite: false,
    fog: false
  }));
  sun.position.set(-4600, 7600, -4400);
  sun.scale.setScalar(2600);
  world.add(sun);
}

// Painted runway designator ("27" / "09") lying flat on the runway.
function addRunwayNumber(world, text, z, flip) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f7fa';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 52),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  mesh.rotation.x = -Math.PI / 2;
  if (flip) mesh.rotation.z = Math.PI;
  mesh.position.set(0, 0.95, z);
  world.add(mesh);
}

function makeAirport(world) {
  addBox(world, 'Runway 27/09', new THREE.Vector3(92, 0.6, 2450), new THREE.Vector3(0, 0.05, 0), 0x242934, 0.55);
  addBox(world, 'Centerline', new THREE.Vector3(3, 0.64, 1800), new THREE.Vector3(0, 0.45, 0), 0xf4f7fa, 0.4);

  for (let i = -1050; i <= 1050; i += 150) {
    addBox(world, 'center dash', new THREE.Vector3(4, 0.8, 70), new THREE.Vector3(0, 0.8, i), 0xffffff, 0.4);
  }

  for (const z of [-1120, 1120]) {
    for (let x = -33; x <= 33; x += 11) {
      addBox(world, 'threshold', new THREE.Vector3(6, 0.8, 70), new THREE.Vector3(x, 0.85, z), 0xffffff, 0.4);
    }
  }

  addBox(world, 'taxiway', new THREE.Vector3(25, 0.55, 930), new THREE.Vector3(178, 0.06, -220), 0x303642, 0.6);
  addBox(world, 'apron', new THREE.Vector3(380, 0.55, 260), new THREE.Vector3(320, 0.06, -700), 0x3a404d, 0.65);
  addBox(world, 'hangar', new THREE.Vector3(150, 55, 95), new THREE.Vector3(430, 27.8, -700), 0x8a9bae, 0.78, 0.08);
  addBox(world, 'tower', new THREE.Vector3(34, 105, 34), new THREE.Vector3(245, 52.8, -880), 0x9eadbc, 0.72, 0.05);
  addBox(world, 'tower top', new THREE.Vector3(62, 25, 62), new THREE.Vector3(245, 119, -880), 0x425366, 0.48, 0.1);

  const lightGeo = new THREE.SphereGeometry(2.2, 12, 8);
  const red = new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0xff0000, emissiveIntensity: 2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeaf7ff, emissive: 0xaedbff, emissiveIntensity: 1.6 });
  for (let z = -1180; z <= 1180; z += 95) {
    for (const x of [-54, 54]) {
      const l = new THREE.Mesh(lightGeo, white);
      l.position.set(x, 2.5, z);
      world.add(l);
    }
  }
  for (const z of [-1250, 1250]) {
    for (let x = -54; x <= 54; x += 18) {
      const l = new THREE.Mesh(lightGeo, red);
      l.position.set(x, 2.8, z);
      world.add(l);
    }
  }

  // Runway designators: 27 faces traffic landing toward -z, 09 the reverse.
  addRunwayNumber(world, '27', 1040, false);
  addRunwayNumber(world, '09', -1040, true);

  // PAPI (2 red / 2 white) beside the touchdown zone of runway 27.
  const papiWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.4 });
  const papiRed = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2.4 });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(lightGeo, i < 2 ? papiWhite : papiRed);
    l.position.set(-70 - i * 10, 2.6, 850);
    world.add(l);
  }

  // Rotating airport beacon on top of the tower — pulsed from the main loop.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x66ff88, emissiveIntensity: 2.5 })
  );
  beacon.position.set(245, 136, -880);
  world.add(beacon);
  return beacon;
}

function makeClouds(world) {
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.78 });
  for (let i = 0; i < 44; i++) {
    const group = new THREE.Group();
    const x = (Math.random() - 0.5) * 7600;
    const z = (Math.random() - 0.5) * 7600;
    const y = 720 + Math.random() * 1050;
    group.position.set(x, y, z);
    for (let j = 0; j < 8; j++) {
      const geo = new THREE.SphereGeometry(38 + Math.random() * 68, 16, 10);
      const m = new THREE.Mesh(geo, cloudMat);
      m.position.set((Math.random() - 0.5) * 210, (Math.random() - 0.5) * 34, (Math.random() - 0.5) * 86);
      m.scale.y = 0.42;
      group.add(m);
    }
    world.add(group);
  }
}

function makeWaterAndRoads(world) {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(690, 64),
    new THREE.MeshStandardMaterial({ color: 0x1d78a6, roughness: 0.28, metalness: 0.06, transparent: true, opacity: 0.88 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-1450, -1.6, 1300);
  world.add(water);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x272c32, roughness: 0.78 });
  for (const [x, z, rot, len] of [[-420, -650, 0.35, 1250], [760, -1050, -0.72, 1500], [-980, 920, 1.15, 900]]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(18, 0.32, len), roadMat);
    road.position.set(x, terrainHeight(x, z) + 0.45, z);
    road.rotation.y = rot;
    road.receiveShadow = true;
    world.add(road);
  }
}

function makeTreesAndCity(world) {
  const trunkGeo = new THREE.CylinderGeometry(1.2, 1.7, 9, 6);
  const crownGeo = new THREE.ConeGeometry(7.0, 22, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3724, roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x1f5d32, roughness: 0.95 });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, 900);
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, 900);
  trunkInst.castShadow = true;
  crownInst.castShadow = true;
  const dummy = new THREE.Object3D();
  let index = 0;
  while (index < 900) {
    const x = (Math.random() - 0.5) * 8200;
    const z = (Math.random() - 0.5) * 8200;
    const airportClear = Math.abs(x) < 520 && Math.abs(z) < 2850;
    const lakeClear = Math.hypot(x + 1450, z - 1300) < 850;
    if (airportClear || lakeClear) continue;
    const y = terrainHeight(x, z);
    const s = 0.72 + Math.random() * 1.25;
    dummy.position.set(x, y + 4.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(index, dummy.matrix);
    dummy.position.y = y + 18 * s;
    dummy.updateMatrix();
    crownInst.setMatrixAt(index, dummy.matrix);
    index++;
  }
  world.add(trunkInst, crownInst);

  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x8d98a7, roughness: 0.78, metalness: 0.05 });
  for (let i = 0; i < 80; i++) {
    const sx = 18 + Math.random() * 46;
    const sy = 14 + Math.random() * 70;
    const sz = 18 + Math.random() * 52;
    const x = 950 + (Math.random() - 0.5) * 720;
    const z = 900 + (Math.random() - 0.5) * 620;
    const y = terrainHeight(x, z) + sy / 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), buildingMat);
    b.position.set(x, y, z);
    b.castShadow = true;
    b.receiveShadow = true;
    world.add(b);
  }
}

export function createWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);
  makeSkyDome(world);
  makeTerrain(world);
  const beacon = makeAirport(world);
  makeWaterAndRoads(world);
  makeTreesAndCity(world);
  makeClouds(world);
  world.userData.beacon = beacon;
  return world;
}
