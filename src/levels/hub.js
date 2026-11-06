import * as THREE from 'three';
import { Stage, fbm, noise, smooth, mix } from '../stage.js';
import { toonMaterial, addOutline, outlineMaterial } from '../toon.js';
import { portal } from '../deco.js';

// The Kingdom: the open-world hub. One big island surrounded by sea.
// North is -Z (mountains), south is +Z (village + spawn). Level portals stand east of the village.

const SIZE = 420, N = 210;
export const PLACES = {
  village: { x: 0, z: 50 },
  castle: { x: 0, z: -32 },
  lake: { x: -75, z: 55 },
  forest: { x: 95, z: 25 },
  sky: { x: 72, z: -60 },
};

function rawHeight(x, z) {
  let h = 1.5 + fbm(x * 0.012 + 10, z * 0.012 + 3) * 8;
  h += smooth(-60, -140, z) * (8 + fbm(x * 0.025 + 7, z * 0.025) * 40);
  const L = PLACES.lake, C = PLACES.castle, V = PLACES.village;
  h = mix(-3.5, h, smooth(14, 40, Math.hypot(x - L.x, z - L.z)));
  h = mix(10, h, smooth(24, 42, Math.hypot(x - C.x, z - (C.z + 2))));
  h = mix(3.5, h, smooth(24, 40, Math.hypot(x - V.x, z - V.z)));
  h = mix(h, -8, smooth(150, 200, Math.hypot(x, z)));
  return h;
}

const C = { grass1: 0x8be05f, grass2: 0x5cbf48, sand: 0xf2e3a0, rock: 0xa89bb5, snow: 0xffffff, stone: 0xd9d2e3, roof: 0x4a6cd9, wood: 0x8a5a33 };

export class Hub extends Stage {
  constructor(scene, levels, progress) {
    super(scene, { seed: 1234 });
    this.title = 'The Kingdom';
    this.maxSlope = Infinity; // hills and mountains are free to climb here
    this.bounds = { x: 0, z: 0, r: 185 };
    this.map = { x: 0, z: 0, size: SIZE, bg: '#49b6f5', platform: 'rgba(240,235,250,0.85)' };

    this.environment({
      skyTop: 0x4a9cff, skyMid: 0x8fd3ff, skyBottom: 0xbfe8ff,
      fog: [0x8fd3ff, 90, 260],
      hemi: [0xdff3ff, 0x6a8a4a, 1.4],
      sun: { color: 0xfff2d6, intensity: 2.2, dir: [0.5, 1, 0.35] },
    });

    const g1 = new THREE.Color(C.grass1), g2 = new THREE.Color(C.grass2);
    this.terrain(SIZE, N, rawHeight, (x, y, z, ny, c) => {
      if (y < 1.0) c.setHex(C.sand);
      else if (y > 36) c.setHex(C.snow);
      else if (ny < 0.72 || y > 24) c.setHex(C.rock);
      else c.copy(g1).lerp(g2, noise(x * 0.08, z * 0.08));
    });
    this.hazard(0, toonMaterial(0x49b6f5, { transparent: true, opacity: 0.82 }));
    this.mapColor = (h) => (h < 0 ? [73, 182, 245] : h < 1 ? [242, 227, 160] : h > 36 ? [255, 255, 255] : h > 24 ? [168, 155, 181] : [139 - 2.5 * Math.min(20, h), 224 - 2.5 * Math.min(20, h), 95 - 1.5 * Math.min(20, h)]);

    this.buildCastle();
    this.buildVillage();
    this.buildPortals(levels, progress);
    this.buildLake();
    this.buildForestStump();
    this.buildSkyIslands();
    this.buildMountainJewel();
    this.buildTrees();
    this.scatterGems(40);
    this.buildClouds();

    const sx = PLACES.village.x, sz = PLACES.village.z + 14;
    this.spawn.set(sx, this.terrainHeight(sx, sz), sz);
    this.spawnFacing = Math.PI;

    // Hide jewels already found on an earlier visit.
    for (const j of this.jewels) if (progress.jewels.includes(j.userData.name)) j.visible = false;
  }

  // Where to stand when coming back out of a level's portal.
  portalSpawn(id) {
    const p = this.portals.find((q) => q.id === id);
    if (!p) return null;
    const V = PLACES.village, dx = V.x - p.x, dz = V.z - p.z, d = Math.hypot(dx, dz);
    const x = p.x + (dx / d) * 4.5, z = p.z + (dz / d) * 4.5;
    return { spawn: new THREE.Vector3(x, this.terrainHeight(x, z), z), facing: Math.atan2(dx, dz) };
  }

  buildPortals(levels, progress) {
    const V = PLACES.village;
    levels.forEach((lv, i) => {
      const a = -0.55 + i * 0.4;
      const x = V.x + Math.cos(a) * 31, z = V.z + Math.sin(a) * 31;
      const facing = Math.atan2(V.x - x, V.z - z);
      portal(this, x, z, this.terrainHeight(x, z), { id: lv.id, name: lv.name, color: lv.color, done: progress.stars.includes(lv.id), facing });
    });
  }

  buildCastle() {
    const { x: cx, z: cz } = PLACES.castle;
    const b = this.terrainHeight(cx, cz);
    this.block(cx, b + 6, cz + 2, 12, 6.5, 4);
    for (const sx of [-7.8, 7.8]) {
      this.pillar(cx + sx, cz + 2, 2, b - 0.5, b + 10);
      const roof = addOutline(new THREE.Mesh(new THREE.ConeGeometry(2.5, 3.5, 16), toonMaterial(C.roof)), 0.06);
      roof.position.set(cx + sx, b + 11.75, cz + 2);
      roof.castShadow = true;
      this.add(roof);
    }
    this.pillar(cx, cz - 4, 2.6, b - 0.5, b + 15);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const crenel = addOutline(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.4), toonMaterial(C.stone)), 0.03);
      crenel.position.set(cx + Math.cos(a) * 2.4, b + 15.35, cz - 4 + Math.sin(a) * 2.4);
      crenel.rotation.y = -a;
      this.add(crenel);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.2), toonMaterial(0x6b3f24));
    gate.position.set(cx, b + 1.6, cz + 4.05);
    this.add(gate);
    for (const sx of [-3.5, 3.5]) {
      const banner = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.1), toonMaterial(0xd9364a));
      banner.position.set(cx + sx, b + 4.2, cz + 4.06);
      this.add(banner);
    }
    for (let i = 1; i <= 5; i++) this.block(cx + 3.5, b + i, cz + 10.5 - i * 1.3, 2.2, i + 0.5, 1.3);
    this.gem(cx + 3.5, b + 6, cz + 2);
    const ex = cx + 3.9, ez = cz - 3.5;
    this.mover(new THREE.Vector3(ex, b + 6, ez), new THREE.Vector3(ex, b + 15, ez), 7, 2, 2, 0xffd84a);
    this.jewel(cx, b + 15, cz - 4, 'Castle Keep');
  }

  buildVillage() {
    const { x: vx, z: vz } = PLACES.village;
    const colors = [0xd9534f, 0x4a6cd9, 0x6cc070, 0xe39b3a, 0x9b6cd9];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      if (Math.abs(Math.sin(a)) > 0.93) continue;
      this.house(vx + Math.cos(a) * 17, vz + Math.sin(a) * 17, colors[i % colors.length]);
    }
    const b = this.terrainHeight(vx, vz);
    this.pillar(vx, vz, 2.2, b - 0.5, b + 0.8, C.stone, 0x6fd0ff);
    this.pillar(vx, vz, 0.4, b + 0.8, b + 2.2, C.stone);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.gem(vx + Math.cos(a) * 6, b, vz + Math.sin(a) * 6); }
  }

  house(x, z, roofColor) {
    const b = this.terrainHeight(x, z);
    this.block(x, b + 3, z, 4, 3.6, 4, 0xf6e7c8);
    const roof = addOutline(new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 4), toonMaterial(roofColor)), 0.05);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, b + 4.2, z);
    roof.castShadow = true;
    this.add(roof);
    this.solidBox(x, b + 4.2, z, 2, 1.2, 2);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.1), toonMaterial(0x6b3f24));
    const toCenter = Math.atan2(PLACES.village.x - x, PLACES.village.z - z);
    door.position.set(x + Math.sin(toCenter) * 2.03, b + 0.9, z + Math.cos(toCenter) * 2.03);
    door.rotation.y = toCenter;
    this.add(door);
  }

  buildLake() {
    const { x: lx, z: lz } = PLACES.lake;
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
    let base = this.terrainHeight(sx, sz);
    for (let a = 0; a < Math.PI * 2; a += 0.5) base = Math.max(base, this.terrainHeight(sx + Math.cos(a) * 7, sz + Math.sin(a) * 7));
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
    const W = N + 1, half = SIZE / 2, step = SIZE / N;
    let best = { h: -Infinity };
    for (let gz = 0; gz < W; gz++) for (let gx = 0; gx < W; gx++) {
      const x = -half + gx * step, z = -half + gz * step, h = this.heights[gz * W + gx];
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
      if (near(PLACES.castle, x, z, 30) || near(PLACES.village, x, z, 37) || near(PLACES.lake, x, z, 40)) continue;
      if (near(PLACES.forest, x, z, 9) || near(PLACES.sky, x, z, 10)) continue;
      if (Math.abs(x) < 4 && z > PLACES.castle.z && z < PLACES.village.z) continue;
      if (this.rand() > (near(PLACES.forest, x, z, 55) ? 0.9 : 0.1)) continue;
      spots.push({ x, z, h, s: 0.8 + this.rand() * 0.7, hue: this.rand() });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 1.6, 7).translate(0, 0.8, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1.2, 1).translate(0, 2.5, 0);
    const mats = [], cols = [];
    const leafA = new THREE.Color(0x4fbf4a), leafB = new THREE.Color(0x2f9e5a);
    for (const t of spots) {
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.h - 0.1, t.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.hue * 6), new THREE.Vector3(t.s, t.s, t.s)));
      cols.push(leafA.clone().lerp(leafB, t.hue));
      this.solidCyl(t.x, t.z, 0.3 * t.s, t.h - 1, t.h + 3.6 * t.s);
    }
    this.instanced(trunkGeo, toonMaterial(C.wood), mats, { outline: 0.04 });
    this.instanced(leafGeo, toonMaterial(0xffffff), mats, { outline: 0.05, colors: cols });
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
    const r = this.rand;
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
      this.add(g);
    }
  }
}
void outlineMaterial;
