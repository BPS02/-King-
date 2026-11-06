import * as THREE from 'three';
import { toonMaterial, toonGradient, addOutline, outlineMaterial } from './toon.js';

// The open world: one big kingdom island surrounded by sea.
// North is -Z (mountains), south is +Z (village + spawn).
//
// Collision shapes the player understands:
//   box: { minX, maxX, minZ, maxZ, top, bottom }   stone blocks, houses, castle walls
//   cyl: { x, z, r, top, bottom }                  islands, towers, tree trunks, stumps
//   terrain: handled separately via terrainHeight(x, z)

export const WORLD_SIZE = 420;
const N = 210;                       // terrain grid resolution (2m squares)
const STEP = WORLD_SIZE / N;
const HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = 0;
export const WORLD_RADIUS = 185;     // invisible edge of the playable area

export const PLACES = {
  village: { x: 0, z: 50 },
  castle: { x: 0, z: -32 },
  lake: { x: -75, z: 55 },
  forest: { x: 95, z: 25 },
  sky: { x: 72, z: -60 },
};

// ---------- Noise (makes hills look natural) ----------
function hash(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { s += amp * noise(x * f, z * f); f *= 2; amp *= 0.5; }
  return s / 0.9375;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Seeded random so the world is the same every time.
function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function rawHeight(x, z) {
  let h = 1.5 + fbm(x * 0.012 + 10, z * 0.012 + 3) * 8;                         // rolling meadows
  h += smooth(-60, -140, z) * (8 + fbm(x * 0.025 + 7, z * 0.025) * 40);            // northern mountains
  const L = PLACES.lake, C = PLACES.castle, V = PLACES.village;
  h = mix(-3.5, h, smooth(14, 40, Math.hypot(x - L.x, z - L.z)));                   // lake
  h = mix(10, h, smooth(24, 42, Math.hypot(x - C.x, z - (C.z + 2))));               // castle hill
  h = mix(3.5, h, smooth(24, 40, Math.hypot(x - V.x, z - V.z)));                    // flat village
  h = mix(h, -8, smooth(150, 200, Math.hypot(x, z)));                               // beach -> sea
  return h;
}

const C = {
  grass1: 0x8be05f, grass2: 0x5cbf48, sand: 0xf2e3a0, rock: 0xa89bb5, snow: 0xffffff,
  stone: 0xd9d2e3, roof: 0x4a6cd9, wood: 0x8a5a33, gold: 0xffd84a,
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.platforms = [];
    this.gems = [];
    this.jewels = [];
    this.movers = [];
    this.cameraBlockers = [];
    this.time = 0;
    this.rand = rng(1234);

    this.buildTerrain();
    this.buildWater();
    this.buildCastle();
    this.buildVillage();
    this.buildLake();
    this.buildForestStump();
    this.buildSkyIslands();
    this.buildMountainJewel();
    this.buildTrees();
    this.scatterGems(40);
    this.buildClouds();

    const sx = PLACES.village.x, sz = PLACES.village.z + 14;
    this.spawn = new THREE.Vector3(sx, this.terrainHeight(sx, sz), sz);
  }

  // ---------- Terrain ----------
  buildTerrain() {
    const W = N + 1;
    this.heights = new Float32Array(W * W);
    for (let gz = 0; gz < W; gz++) for (let gx = 0; gx < W; gx++)
      this.heights[gz * W + gx] = rawHeight(-HALF + gx * STEP, -HALF + gz * STEP);

    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = Math.round((pos.getX(i) + HALF) / STEP), gz = Math.round((pos.getZ(i) + HALF) / STEP);
      pos.setY(i, this.heights[gz * W + gx]);
    }
    geo.computeVertexNormals();

    const nrm = geo.attributes.normal, colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), g1 = new THREE.Color(C.grass1), g2 = new THREE.Color(C.grass2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
      if (y < 1.0) c.setHex(C.sand);
      else if (y > 36) c.setHex(C.snow);
      else if (ny < 0.72 || y > 24) c.setHex(C.rock);
      else c.copy(g1).lerp(g2, noise(x * 0.08, z * 0.08));
      c.toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  // Ground height at any point (smoothly blended from the grid).
  terrainHeight(x, z) {
    const W = N + 1;
    const fx = Math.min(N - 1e-4, Math.max(0, (x + HALF) / STEP));
    const fz = Math.min(N - 1e-4, Math.max(0, (z + HALF) / STEP));
    const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz;
    const h = this.heights;
    const a = h[gz * W + gx], b = h[gz * W + gx + 1], c = h[(gz + 1) * W + gx], d = h[(gz + 1) * W + gx + 1];
    return mix(mix(a, b, tx), mix(c, d, tx), tz);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(1600, 1600);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, toonMaterial(0x49b6f5, { transparent: true, opacity: 0.82 }));
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    this.scene.add(water);
  }

  // ---------- Building blocks ----------
  block(x, top, z, w, h, d, color = C.stone, { invisible = false, blockCamera = true } = {}) {
    const p = { kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top, bottom: top - h, w, h, d };
    if (!invisible) {
      const m = addOutline(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color)));
      m.position.set(x, top - h / 2, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      p.mesh = m;
      if (blockCamera) this.cameraBlockers.push(m);
    }
    this.platforms.push(p);
    return p;
  }

  pillar(x, z, r, bottom, top, color = C.stone, topColor = null) {
    const h = top - bottom;
    const m = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 20), toonMaterial(color)));
    m.position.set(x, bottom + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    this.scene.add(m);
    if (topColor !== null) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.3, 20), toonMaterial(topColor));
      cap.position.set(x, top - 0.14, z);
      cap.receiveShadow = true;
      this.scene.add(cap);
    }
    this.cameraBlockers.push(m);
    const p = { kind: 'cyl', x, z, r, top, bottom };
    this.platforms.push(p);
    return p;
  }

  island(x, y, z, r) {
    const g = new THREE.Group();
    const top = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.5, 24), toonMaterial(C.grass1)));
    top.position.y = -0.25;
    top.receiveShadow = top.castShadow = true;
    const rock = addOutline(new THREE.Mesh(new THREE.ConeGeometry(r * 0.92, r * 1.6, 9), toonMaterial(0xb07a4a)));
    rock.rotation.x = Math.PI;
    rock.position.y = -0.5 - r * 0.8;
    rock.castShadow = true;
    g.add(top, rock);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.platforms.push({ kind: 'cyl', x, z, r, top: y, bottom: y - 0.5 });
  }

  // A platform that slides between two points (can go up/down too) and carries the player.
  mover(a, b, period, w = 2.2, d = 2.2, color = 0xf3b6e0) {
    const p = this.block(a.x, a.y, a.z, w, 0.5, d, color);
    Object.assign(p, { a, b, period, cur: a.clone(), delta: new THREE.Vector3() });
    this.movers.push(p);
    return p;
  }

  gem(x, y, z) {
    const m = addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), toonMaterial(0xff4d6d, { emissive: 0x551020 })), 0.025);
    m.position.set(x, y + 0.8, z);
    m.userData.baseY = m.position.y;
    this.scene.add(m);
    this.gems.push(m);
  }

  // Crown Jewels are the main goal. Each has a tall light beam you can see from far away.
  jewel(x, y, z, name) {
    const g = new THREE.Group();
    const gem = addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.6), toonMaterial(C.gold, { emissive: 0x7a5a00 })), 0.04);
    gem.scale.y = 1.4;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 120, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = 60;
    g.add(gem, beam);
    g.position.set(x, y + 1.1, z);
    g.userData = { baseY: y + 1.1, name, gem };
    this.scene.add(g);
    this.jewels.push(g);
  }

  // ---------- Landmarks ----------
  buildCastle() {
    const { x: cx, z: cz } = PLACES.castle;
    const b = this.terrainHeight(cx, cz);
    // Front wall (walkable top), two towers, and the tall keep behind.
    this.block(cx, b + 6, cz + 2, 12, 6.5, 4);
    for (const sx of [-7.8, 7.8]) {
      this.pillar(cx + sx, cz + 2, 2, b - 0.5, b + 10);
      const roof = addOutline(new THREE.Mesh(new THREE.ConeGeometry(2.5, 3.5, 16), toonMaterial(C.roof)), 0.06);
      roof.position.set(cx + sx, b + 11.75, cz + 2);
      roof.castShadow = true;
      this.scene.add(roof);
    }
    this.pillar(cx, cz - 4, 2.6, b - 0.5, b + 15);
    for (let i = 0; i < 8; i++) {   // battlements around the keep top
      const a = (i / 8) * Math.PI * 2;
      const crenel = addOutline(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.4), toonMaterial(C.stone)), 0.03);
      crenel.position.set(cx + Math.cos(a) * 2.4, b + 15.35, cz - 4 + Math.sin(a) * 2.4);
      crenel.rotation.y = -a;
      this.scene.add(crenel);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.2), toonMaterial(0x6b3f24));
    gate.position.set(cx, b + 1.6, cz + 4.05);
    this.scene.add(gate);
    for (const sx of [-3.5, 3.5]) {  // red banners
      const banner = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.1), toonMaterial(0xd9364a));
      banner.position.set(cx + sx, b + 4.2, cz + 4.06);
      this.scene.add(banner);
    }

    // Staircase up to the wall top.
    for (let i = 1; i <= 5; i++) this.block(cx + 3.5, b + i, cz + 10.5 - i * 1.3, 2.2, i + 0.5, 1.3);
    this.gem(cx + 3.5, b + 6, cz + 2);
    // Elevator from the wall top up to the keep, where a Crown Jewel waits.
    const ex = cx + 3.9, ez = cz - 3.5;
    this.mover(new THREE.Vector3(ex, b + 6, ez), new THREE.Vector3(ex, b + 15, ez), 7, 2, 2, C.gold);
    this.jewel(cx, b + 15, cz - 4, 'Castle Keep');
  }

  buildVillage() {
    const { x: vx, z: vz } = PLACES.village;
    const colors = [0xd9534f, 0x4a6cd9, 0x6cc070, 0xe39b3a, 0x9b6cd9];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      if (Math.abs(Math.sin(a)) > 0.93) continue; // leave the north and south roads open
      const x = vx + Math.cos(a) * 17, z = vz + Math.sin(a) * 17;
      this.house(x, z, colors[i % colors.length]);
    }
    // Fountain in the square.
    const b = this.terrainHeight(vx, vz);
    this.pillar(vx, vz, 2.2, b - 0.5, b + 0.8, C.stone, 0x6fd0ff);
    this.pillar(vx, vz, 0.4, b + 0.8, b + 2.2, C.stone);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.gem(vx + Math.cos(a) * 6, b, vz + Math.sin(a) * 6); }
  }

  house(x, z, roofColor) {
    const b = this.terrainHeight(x, z);
    const wall = this.block(x, b + 3, z, 4, 3.6, 4, 0xf6e7c8);
    const roof = addOutline(new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 4), toonMaterial(roofColor)), 0.05);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, b + 4.2, z);
    roof.castShadow = true;
    this.scene.add(roof);
    this.block(x, b + 4.2, z, 2, 1.2, 2, 0, { invisible: true }); // so you can stand near the roof peak
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.1), toonMaterial(0x6b3f24));
    const toCenter = Math.atan2(PLACES.village.x - x, PLACES.village.z - z);
    door.position.set(x + Math.sin(toCenter) * 2.03, b + 0.9, z + Math.cos(toCenter) * 2.03);
    door.rotation.y = toCenter;
    this.scene.add(door);
    return wall;
  }

  buildLake() {
    const { x: lx, z: lz } = PLACES.lake;
    // Stepping stones from the east shore out to a little island.
    for (let i = 0; i < 5; i++) {
      const x = lx + 24 - i * 3.6, z = lz + Math.sin(i * 1.3) * 1.2;
      this.pillar(x, z, 0.9, -4, 0.6 + i * 0.15, 0xbdb3c9);
      if (i % 2 === 1) this.gem(x, 0.6 + i * 0.15, z);
    }
    this.pillar(lx, lz, 4, -4, 1.4, C.sand, C.grass1);
    this.jewel(lx, 1.4, lz, 'Lake Isle');
  }

  buildForestStump() {
    const { x: fx, z: fz } = PLACES.forest;
    const b = this.terrainHeight(fx, fz);
    this.pillar(fx, fz, 2.5, b - 1, b + 7, C.wood, 0xd8b07a);
    for (let i = 0; i < 3; i++) {
      const a = i * 1.25;
      this.pillar(fx + Math.cos(a) * 4.6, fz + Math.sin(a) * 4.6, 1, b - 1, b + 1.8 * (i + 1), C.wood, 0xd8b07a);
    }
    this.jewel(fx, b + 7, fz, 'Old Stump');
  }

  buildSkyIslands() {
    const { x: sx, z: sz } = PLACES.sky;
    let base = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.5) base = Math.max(base, this.terrainHeight(sx + Math.cos(a) * 7, sz + Math.sin(a) * 7));
    base = Math.max(base, this.terrainHeight(sx, sz));
    // A spiral of floating islands climbing into the sky.
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const a = i * 0.95, y = base + 1.4 * (i + 1);
      const x = sx + Math.cos(a) * 6.5, z = sz + Math.sin(a) * 6.5;
      if (i === 4) this.block(x, y, z, 2.4, 1, 2.4, 0xf3b6e0);
      else this.island(x, y, z, 1.5);
      this.gem(x, y, z);
    }
    this.island(sx, base + 1.4 * (steps + 1), sz, 3);
    this.jewel(sx, base + 1.4 * (steps + 1), sz, 'Sky Spiral');
  }

  buildMountainJewel() {
    const W = N + 1;
    let best = { h: -Infinity };
    for (let gz = 0; gz < W; gz++) for (let gx = 0; gx < W; gx++) {
      const x = -HALF + gx * STEP, z = -HALF + gz * STEP;
      const h = this.heights[gz * W + gx];
      if (z < -70 && Math.hypot(x, z) < 145 && h > best.h) best = { h, x, z };
    }
    this.peak = best;
    this.jewel(best.x, this.terrainHeight(best.x, best.z), best.z, 'Mountain Peak');
  }

  buildTrees() {
    const spots = [];
    const near = (p, x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
    for (let tries = 0; tries < 6000 && spots.length < 420; tries++) {
      const x = (this.rand() * 2 - 1) * 170, z = (this.rand() * 2 - 1) * 170;
      const h = this.terrainHeight(x, z);
      if (h < 1.5 || h > 24) continue;
      if (near(PLACES.castle, x, z, 30) || near(PLACES.village, x, z, 30) || near(PLACES.lake, x, z, 40)) continue;
      if (near(PLACES.forest, x, z, 9) || near(PLACES.sky, x, z, 10)) continue;
      if (Math.abs(x) < 4 && z > PLACES.castle.z && z < PLACES.village.z) continue; // road
      const density = near(PLACES.forest, x, z, 55) ? 0.9 : 0.1;
      if (this.rand() > density) continue;
      spots.push({ x, z, h, s: 0.8 + this.rand() * 0.7, hue: this.rand() });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 1.6, 7).translate(0, 0.8, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1.2, 1).translate(0, 2.5, 0);
    const n = spots.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMaterial(C.wood), n);
    const leaves = new THREE.InstancedMesh(leafGeo, toonMaterial(0xffffff), n);
    const trunkLines = new THREE.InstancedMesh(trunkGeo, outlineMaterial(0.04), n);
    const leafLines = new THREE.InstancedMesh(leafGeo, outlineMaterial(0.05), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const leafA = new THREE.Color(0x4fbf4a), leafB = new THREE.Color(0x2f9e5a);
    spots.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.hue * 6);
      m.compose(new THREE.Vector3(t.x, t.h - 0.1, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      for (const im of [trunks, leaves, trunkLines, leafLines]) im.setMatrixAt(i, m);
      leaves.setColorAt(i, col.copy(leafA).lerp(leafB, t.hue));
      this.platforms.push({ kind: 'cyl', x: t.x, z: t.z, r: 0.3 * t.s, top: t.h + 3.6 * t.s, bottom: t.h - 1 });
    });
    trunks.castShadow = leaves.castShadow = true;
    this.scene.add(trunks, leaves, trunkLines, leafLines);
  }

  scatterGems(count) {
    let placed = 0;
    for (let tries = 0; tries < 3000 && placed < count; tries++) {
      const x = (this.rand() * 2 - 1) * 150, z = (this.rand() * 2 - 1) * 150;
      const h = this.terrainHeight(x, z);
      if (h < 1.5 || h > 30) continue;
      if (Math.hypot(x - PLACES.castle.x, z - PLACES.castle.z) < 12) continue;
      this.gem(x, h, z);
      placed++;
    }
  }

  buildClouds() {
    const mat = toonMaterial(0xffffff);
    const r = rng(99);
    for (let i = 0; i < 40; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 2.5, 10, 8), mat);
        s.position.set(j * 3.2 - 4.8, r() * 1.2, r() * 1.6);
        g.add(s);
      }
      const a = r() * Math.PI * 2, d = 60 + r() * 220;
      g.position.set(Math.cos(a) * d, 45 + r() * 35, Math.sin(a) * d);
      g.rotation.y = r() * Math.PI;
      this.scene.add(g);
    }
  }

  // ---------- Per-frame ----------
  update(dt) {
    this.time += dt;
    for (const p of this.movers) {
      const t = (Math.sin((this.time / p.period) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      const prev = p.cur.clone();
      p.cur.lerpVectors(p.a, p.b, t);
      p.delta.subVectors(p.cur, prev);
      p.minX += p.delta.x; p.maxX += p.delta.x;
      p.minZ += p.delta.z; p.maxZ += p.delta.z;
      p.top += p.delta.y; p.bottom += p.delta.y;
      p.mesh.position.set(p.cur.x, p.cur.y - p.h / 2, p.cur.z);
    }
    for (const g of this.gems) {
      if (!g.visible) continue;
      g.rotation.y += dt * 2;
      g.position.y = g.userData.baseY + Math.sin(this.time * 3 + g.position.x) * 0.12;
    }
    for (const j of this.jewels) {
      if (!j.visible) continue;
      j.userData.gem.rotation.y += dt * 1.5;
      j.userData.gem.position.y = Math.sin(this.time * 2) * 0.2;
    }
  }

  // ---------- Collision queries ----------
  // Highest platform top under (x,z) that is at or below y.
  groundBelow(x, z, y, radius) {
    let best = null;
    for (const p of this.platforms) {
      if (p.top > y + 0.05 || (best && p.top <= best.top)) continue;
      let inside;
      if (p.kind === 'cyl') inside = Math.hypot(x - p.x, z - p.z) <= Math.max(0.2, p.r - 0.1);
      else inside = x >= p.minX - radius * 0.5 && x <= p.maxX + radius * 0.5 && z >= p.minZ - radius * 0.5 && z <= p.maxZ + radius * 0.5;
      if (inside) best = p;
    }
    return best;
  }

  // Push the player out of the sides of blocks, pillars and trees.
  resolveWalls(pos, radius, height) {
    for (const p of this.platforms) {
      if (pos.y >= p.top - 0.05 || pos.y + height <= p.bottom) continue;
      if (p.kind === 'cyl') {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), min = p.r + radius;
        if (d < min && d > 1e-5) { pos.x = p.x + (dx / d) * min; pos.z = p.z + (dz / d) * min; }
      } else {
        const cx = Math.max(p.minX, Math.min(pos.x, p.maxX));
        const cz = Math.max(p.minZ, Math.min(pos.z, p.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
        if (d < radius && d > 1e-5) { pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius; }
      }
    }
  }

  ceilingAbove(pos, radius, height) {
    for (const p of this.platforms) {
      if (p.kind !== 'box') continue;
      if (pos.x < p.minX || pos.x > p.maxX || pos.z < p.minZ || pos.z > p.maxZ) continue;
      if (pos.y + height > p.bottom && pos.y < p.bottom) return p;
    }
    return null;
  }
}
