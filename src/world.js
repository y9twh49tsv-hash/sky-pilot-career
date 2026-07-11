import * as THREE from 'three';
import { smoothstep } from './utils.js';

/**
 * Procedural island world. Density scales with the graphics quality tier;
 * createWorld() is called again (after disposing the old group) when the
 * player changes quality in the settings.
 *
 * terrainHeight() is shared with the physics module — do not change its
 * shape without re-tuning the mission checkpoints and landing logic.
 */

const DENSITY = {
  low: { seg: 140, trees: 500, clouds: 22, buildings: 60 },
  medium: { seg: 200, trees: 900, clouds: 34, buildings: 90 },
  high: { seg: 240, trees: 1500, clouds: 48, buildings: 120 },
  ultra: { seg: 340, trees: 3000, clouds: 72, buildings: 170 }
};

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

// ---------------------------------------------------------------------------
// Terrain with slope/height based coloring
// ---------------------------------------------------------------------------
function makeTerrain(world, seg) {
  const size = 9000;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const colors = [];
  const c = new THREE.Color();
  const grassA = new THREE.Color(0x4e7a38);
  const grassB = new THREE.Color(0x6b9048);
  const rock = new THREE.Color(0x7d7a6c);
  const snow = new THREE.Color(0xc9d2d6);
  const sand = new THREE.Color(0xbfae7c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    // Slope from finite differences of the height field.
    const s = Math.abs(terrainHeight(x + 25, z) - y) + Math.abs(terrainHeight(x, z + 25) - y);
    const lakeDist = Math.hypot(x + 1450, z - 1300);
    // Base grass with cheap variation noise.
    c.copy(grassA).lerp(grassB, 0.5 + 0.5 * Math.sin(x * 0.011 + z * 0.017));
    if (lakeDist < 780) c.lerp(sand, smoothstep(780, 690, lakeDist));
    if (s > 9) c.lerp(rock, Math.min(1, (s - 9) / 14));
    if (y > 240) c.lerp(snow, smoothstep(240, 330, y));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  world.add(mesh);
}

// ---------------------------------------------------------------------------
// Airport: textured runway with painted markings, taxiway, buildings, lights
// ---------------------------------------------------------------------------
function makeRunwayTexture() {
  const canvas = document.createElement('canvas');
  const W = 512;
  const H = 2048;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2c2f35';
  ctx.fillRect(0, 0, W, H);
  // Asphalt speckle
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2.5, 2.5);
  }
  ctx.fillStyle = '#e8ecef';
  // Edge lines
  ctx.fillRect(10, 0, 7, H);
  ctx.fillRect(W - 17, 0, 7, H);
  // Threshold piano keys (both ends)
  for (const yBase of [26, H - 78]) {
    for (let i = 0; i < 8; i++) ctx.fillRect(42 + i * 56, yBase, 32, 52);
  }
  // Runway numbers
  ctx.font = '900 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(W / 2, H - 190);
  ctx.scale(1.6, 1);
  ctx.fillText('27', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, 190);
  ctx.rotate(Math.PI);
  ctx.scale(1.6, 1);
  ctx.fillText('09', 0, 0);
  ctx.restore();
  // Centerline dashes
  for (let y = 280; y < H - 280; y += 96) ctx.fillRect(W / 2 - 7, y, 14, 54);
  // Touchdown zone bars
  for (const yBase of [300, H - 348]) {
    for (const dx of [-140, 140]) {
      for (let i = 0; i < 3; i++) ctx.fillRect(W / 2 + dx - 36 + i * 26, yBase, 16, 88);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAirport(world) {
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 2450),
    new THREE.MeshStandardMaterial({ map: makeRunwayTexture(), roughness: 0.88 })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = 0.06;
  runway.receiveShadow = true;
  world.add(runway);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x34383f, roughness: 0.85 });
  const taxiway = new THREE.Mesh(new THREE.PlaneGeometry(25, 930), asphalt);
  taxiway.rotation.x = -Math.PI / 2;
  taxiway.position.set(178, 0.05, -220);
  taxiway.receiveShadow = true;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(380, 260), asphalt);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(320, 0.05, -700);
  apron.receiveShadow = true;
  world.add(taxiway, apron);

  // Hangar with curved roof
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x8a97a8, roughness: 0.5, metalness: 0.35 });
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(150, 40, 95), hangarMat);
  hangar.position.set(430, 20, -700);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 150, 24, 1, false, 0, Math.PI), hangarMat);
  roof.rotation.z = Math.PI / 2;
  roof.position.set(430, 40, -700);
  hangar.castShadow = roof.castShadow = true;
  hangar.receiveShadow = true;
  world.add(hangar, roof);

  // Control tower: shaft + glass cab
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(11, 15, 105, 18), new THREE.MeshStandardMaterial({ color: 0xa8b4c2, roughness: 0.6 }));
  shaft.position.set(245, 52.5, -880);
  shaft.castShadow = true;
  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(20, 16, 22, 10),
    new THREE.MeshPhysicalMaterial({ color: 0x2b4a63, roughness: 0.1, metalness: 0.3, clearcoat: 1 })
  );
  cab.position.set(245, 116, -880);
  cab.castShadow = true;
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(21, 21, 3, 10), new THREE.MeshStandardMaterial({ color: 0xdde4ea, roughness: 0.5 }));
  cabRoof.position.set(245, 128.5, -880);
  world.add(shaft, cab, cabRoof);

  // Runway lights
  const lightGeo = new THREE.SphereGeometry(1.6, 10, 8);
  const white = new THREE.MeshStandardMaterial({ color: 0xeaf7ff, emissive: 0xaedbff, emissiveIntensity: 1.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0xff0000, emissiveIntensity: 2 });
  for (let z = -1180; z <= 1180; z += 95) {
    for (const x of [-52, 52]) {
      const l = new THREE.Mesh(lightGeo, white);
      l.position.set(x, 1.8, z);
      world.add(l);
    }
  }
  for (const z of [-1250, 1250]) {
    for (let x = -50; x <= 50; x += 17) {
      const l = new THREE.Mesh(lightGeo, red);
      l.position.set(x, 2.0, z);
      world.add(l);
    }
  }

  // PAPI (2 white / 2 red) beside the touchdown zone of runway 27
  const papiWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.4 });
  const papiRed = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2.4 });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(lightGeo, i < 2 ? papiWhite : papiRed);
    l.position.set(-70 - i * 10, 2.2, 850);
    world.add(l);
  }

  // Rotating airport beacon — pulsed from the main loop
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(3.0, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x66ff88, emissiveIntensity: 2.5 })
  );
  beacon.position.set(245, 133, -880);
  world.add(beacon);
  return beacon;
}

// ---------------------------------------------------------------------------
// Water, roads
// ---------------------------------------------------------------------------
function makeWaterAndRoads(world) {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(690, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x14496b, roughness: 0.08, metalness: 0.0, envMapIntensity: 1.4 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-1450, -1.4, 1300);
  world.add(water);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.85 });
  for (const [x, z, rot, len] of [[-420, -650, 0.35, 1250], [760, -1050, -0.72, 1500], [-980, 920, 1.15, 900], [880, 300, 0.05, 1400]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(16, len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -rot;
    road.position.set(x, terrainHeight(x, z) + 0.5, z);
    road.receiveShadow = true;
    world.add(road);
  }
}

// ---------------------------------------------------------------------------
// Trees (two instanced species) and a city grid with lit windows
// ---------------------------------------------------------------------------
function makeTrees(world, count) {
  const trunkGeo = new THREE.CylinderGeometry(0.9, 1.4, 8, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x54341f, roughness: 0.9 });
  const coneGeo = new THREE.ConeGeometry(5.6, 18, 7);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x1d5230, roughness: 0.95 });
  const blobGeo = new THREE.IcosahedronGeometry(6, 1);
  const blobMat = new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.95, flatShading: true });

  const nConifer = Math.floor(count * 0.6);
  const nBroad = count - nConifer;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, nConifer);
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, nBroad);
  cones.castShadow = blobs.castShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0;
  let ci = 0;
  let bi = 0;
  while (placed < count) {
    const x = (Math.random() - 0.5) * 8200;
    const z = (Math.random() - 0.5) * 8200;
    if (Math.abs(x) < 520 && Math.abs(z) < 2850) continue; // airport
    if (Math.hypot(x + 1450, z - 1300) < 850) continue; // lake
    if (x > 550 && x < 1500 && z > 500 && z < 1450) continue; // city
    const y = terrainHeight(x, z);
    const s = 0.7 + Math.random() * 1.3;
    dummy.position.set(x, y + 4 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    if (ci < nConifer) {
      dummy.position.y = y + 14 * s;
      dummy.updateMatrix();
      cones.setMatrixAt(ci++, dummy.matrix);
    } else {
      dummy.position.y = y + 11 * s;
      dummy.scale.set(s, s * 0.85, s);
      dummy.updateMatrix();
      blobs.setMatrixAt(bi++, dummy.matrix);
    }
    placed++;
  }
  world.add(trunks, cones, blobs);
}

function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 12) {
    for (let x = 4; x < 60; x += 12) {
      ctx.fillStyle = Math.random() > 0.55 ? '#ffe9a8' : '#1a2028';
      ctx.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeCity(world, count) {
  const windowTex = makeWindowTexture();
  const palette = [0x9aa5b1, 0x8d98a7, 0xb0a89a, 0x7f8c99, 0xa39e93];
  const streetMat = new THREE.MeshStandardMaterial({ color: 0x2e3237, roughness: 0.9 });

  // Street grid under the blocks
  for (let i = 0; i < 6; i++) {
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 950), streetMat);
    s1.rotation.x = -Math.PI / 2;
    s1.position.set(600 + i * 160, terrainHeight(600 + i * 160, 950) + 0.4, 950);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(950, 12), streetMat);
    s2.rotation.x = -Math.PI / 2;
    s2.position.set(1000, terrainHeight(1000, 550 + i * 160) + 0.4, 550 + i * 160);
    world.add(s1, s2);
  }

  for (let i = 0; i < count; i++) {
    const sx = 20 + Math.random() * 34;
    const sy = 15 + Math.random() * (Math.random() > 0.85 ? 95 : 55);
    const sz = 20 + Math.random() * 34;
    // Snap into the block grid, jittered
    const x = 640 + Math.floor(Math.random() * 5) * 160 + (Math.random() - 0.5) * 70;
    const z = 620 + Math.floor(Math.random() * 5) * 160 + (Math.random() - 0.5) * 70;
    const tex = windowTex.clone();
    tex.repeat.set(Math.max(1, Math.round(sx / 14)), Math.max(1, Math.round(sy / 16)));
    const mat = new THREE.MeshStandardMaterial({
      color: palette[i % palette.length],
      roughness: 0.75,
      emissive: 0xffe9a8,
      emissiveMap: tex,
      emissiveIntensity: 0.5
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    b.position.set(x, terrainHeight(x, z) + sy / 2, z);
    b.castShadow = b.receiveShadow = true;
    world.add(b);
  }
}

// ---------------------------------------------------------------------------
// Soft billboard clouds
// ---------------------------------------------------------------------------
function makePuffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.55, 'rgba(250,252,255,0.45)');
  grad.addColorStop(1, 'rgba(250,252,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeClouds(world, count) {
  const tex = makePuffTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const cluster = new THREE.Group();
    cluster.position.set((Math.random() - 0.5) * 8200, 750 + Math.random() * 1200, (Math.random() - 0.5) * 8200);
    const puffs = 5 + Math.floor(Math.random() * 5);
    for (let j = 0; j < puffs; j++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: 0.5 + Math.random() * 0.3
      }));
      sprite.position.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 46, (Math.random() - 0.5) * 130);
      const s = 110 + Math.random() * 150;
      sprite.scale.set(s, s * 0.5, 1);
      cluster.add(sprite);
    }
    clouds.add(cluster);
  }
  world.add(clouds);
  return clouds;
}

// ---------------------------------------------------------------------------
export function createWorld(scene, quality = 'high') {
  const d = DENSITY[quality] ?? DENSITY.high;
  const world = new THREE.Group();
  scene.add(world);
  makeTerrain(world, d.seg);
  const beacon = makeAirport(world);
  makeWaterAndRoads(world);
  makeTrees(world, d.trees);
  makeCity(world, d.buildings);
  const clouds = makeClouds(world, d.clouds);
  world.userData.beacon = beacon;
  world.userData.clouds = clouds;
  return world;
}

/** Free GPU resources of a world group before rebuilding it. */
export function disposeWorld(scene, world) {
  scene.remove(world);
  world.traverse((obj) => {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      m.map?.dispose();
      m.emissiveMap?.dispose();
      m.dispose();
    }
  });
}
