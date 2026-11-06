import * as THREE from 'three';
import { Stage, fbm, noise, smooth, mix } from '../stage.js';
import { toonMaterial, glowMaterial, addOutline, glowSprite } from '../toon.js';
import { bambooGrove, pavilion, torii, stoneLantern } from '../deco.js';

// Level 2 - Bamboo Grove (night, fireflies, green mist).
// Follow the wooden path through towering bamboo, cross two misty ravines
// (stepping stones, then a drifting raft), and climb to the glowing spirit tree.

const pathX = (z) => Math.sin(z * 0.04) * 6;
const CLEAR = { x: pathX(-120), z: -120 };

function height(x, z) {
  let h = 1 + fbm(x * 0.06 + 3, z * 0.06) * 2.5;
  h += smooth(16, 36, Math.abs(x - pathX(z))) * 14;
  h += smooth(12, 24, z) * 10 + smooth(-130, -142, z) * 10;
  h = mix(1.6, h, smooth(10, 16, Math.hypot(x - CLEAR.x, z - CLEAR.z)));
  h = mix(-8, h, smooth(4.5, 6, Math.abs(z + 35)));
  h = mix(-8, h, smooth(5, 7, Math.abs(z + 80)));
  return h;
}

export class BambooLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 22 });
    this.title = 'Bamboo Grove';
    this.bounds = { x: 0, z: -62, r: 92 };
    this.map = { x: 0, z: -62, size: 180, bg: '#10261d', platform: 'rgba(200,255,200,0.75)' };
    this.environment({
      skyTop: 0x050f0c, skyMid: 0x0f2a22, skyBottom: 0x2a5a45,
      fog: [0x173d30, 8, 58],
      hemi: [0x9fe8c0, 0x0e2218, 0.75],
      sun: { color: 0xbfffe0, intensity: 1.2, dir: [-0.4, 1, -0.5] },
      stars: 300,
    });

    const moss = new THREE.Color(0x3f6e3a), dark = new THREE.Color(0x24432a), dirt = new THREE.Color(0x5a4a38);
    this.terrain(260, 130, height, (x, y, z, ny, c) => {
      if (y < -0.5) c.setHex(0x1a2a22);
      else if (Math.abs(x - pathX(z)) < 2.4) c.copy(dirt);
      else if (ny < 0.7) c.setHex(0x3a3a36);
      else c.copy(moss).lerp(dark, noise(x * 0.2, z * 0.2));
    });
    this.mapColor = (h) => (h < -0.5 ? [12, 30, 24] : [40 + h * 3, 90 + h * 4, 55 + h * 2]);
    this.hazard(-2.5, new THREE.MeshBasicMaterial({ color: 0x5fae86, transparent: true, opacity: 0.55, depthWrite: false }), 0.5);

    this.buildPath();
    this.buildBamboo();
    this.buildPavilions();
    this.buildRavines();
    this.buildSpiritTree();
    this.particles({ count: 420, box: { x0: -18, x1: 22, y0: 0.5, y1: 7, z0: -132, z1: 14 }, color: 0xc8ff6a, size: 0.35, mode: 'float', speed: 1 });

    const sx = pathX(10);
    this.spawn.set(sx, this.terrainHeight(sx, 10), 10);
  }

  buildPath() {
    const planks = [], m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let z = 14; z > -114; z -= 0.85) {
      const x = pathX(z), y = this.terrainHeight(x, z);
      if (y < 0.4) continue;
      const slope = Math.cos(z * 0.04) * 0.24;
      q.setFromEuler(new THREE.Euler(0, Math.atan(slope), 0));
      planks.push(m.compose(new THREE.Vector3(x, y + 0.03, z), q, new THREE.Vector3(1, 1, 1)).clone());
    }
    this.instanced(new THREE.BoxGeometry(2.6, 0.12, 0.62), toonMaterial(0x8a6a48), planks, { outline: 0.02, shadow: false });
    const rocks = [];
    for (let z = 12; z > -114; z -= 1.3) {
      for (const side of [-1, 1]) {
        if (this.rand() < 0.4) continue;
        const x = pathX(z) + side * (1.7 + this.rand() * 0.6), y = this.terrainHeight(x, z);
        if (y < 0.4) continue;
        const s = 0.25 + this.rand() * 0.25;
        rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rand(), this.rand() * 3, 0)), new THREE.Vector3(s, s * 0.7, s)));
      }
    }
    this.instanced(new THREE.DodecahedronGeometry(1, 0), toonMaterial(0x6a6e66), rocks, { outline: 0.03 });
    for (let z = 6; z > -110; z -= 5) { const x = pathX(z); if (this.terrainHeight(x, z) > 0.4) this.gem(x, this.terrainHeight(x, z), z, 0x9dff8a); }
  }

  buildBamboo() {
    const spots = [];
    const r = this.rand;
    for (let z = 18; z > -146; z -= 2.1) for (let x = -36; x < 40; x += 2.1) {
      const bx = x + (r() - 0.5) * 1.6, bz = z + (r() - 0.5) * 1.6;
      if (Math.abs(bx - pathX(bz)) < 3.3) continue;
      if (Math.abs(bz + 35) < 6.5 || Math.abs(bz + 80) < 7.5) continue;
      if (Math.hypot(bx - CLEAR.x, bz - CLEAR.z) < 14) continue;
      if (r() > 0.72) continue;
      const y = this.terrainHeight(bx, bz);
      if (y < 0) continue;
      if ([-15, -55, -100].some((pz) => Math.abs(bz - pz) < 4.5 && Math.abs(bx - pathX(pz)) < 6)) continue;
      spots.push({ x: bx, z: bz, y, h: 9 + r() * 7 });
    }
    bambooGrove(this, spots);
  }

  buildPavilions() {
    for (const z of [-15, -55, -100]) {
      const x = pathX(z), g = this.terrainHeight(x, z);
      pavilion(this, x, z, g, { w: 3.6, d: 4.2, h: 3.4, post: 0x5a3e28, roof: 0x2e2a24, lanterns: 0x9dff8a });
      // Stumps to climb onto the roof, with gems up top.
      this.pillar(x + 3.4, z + 1.6, 0.7, g - 1, g + 1.3, 0x6a5a40, 0x9a8a60);
      this.pillar(x + 3.4, z - 0.2, 0.7, g - 1, g + 2.6, 0x6a5a40, 0x9a8a60);
      this.gem(x, g + 4.4, z, 0x9dff8a);
      this.gem(x - 1.6, g + 3.75, z, 0x9dff8a);
    }
  }

  buildRavines() {
    // Ravine 1: three mossy stepping stones.
    const a = this.terrainHeight(pathX(-29), -29), b = this.terrainHeight(pathX(-41), -41);
    [[-31.5, a + 0.3], [-35, Math.max(a, b) + 0.6], [-38.5, b + 0.3]].forEach(([z, top]) => {
      this.pillar(pathX(z), z, 0.85, -8, top, 0x4f5a52, 0x5d8a4a);
      this.gem(pathX(z), top, z, 0x9dff8a);
    });
    // Ravine 2: a raft that drifts back and forth.
    const x = pathX(-80), y = (this.terrainHeight(x, -72.5) + this.terrainHeight(x, -87.5)) / 2 + 0.5;
    this.mover(new THREE.Vector3(x, y, -74.2), new THREE.Vector3(x, y, -85.8), 6, 2.6, 2.6, 0x8a6a48);
    this.gem(x, y, -80, 0x9dff8a);
  }

  buildSpiritTree() {
    const { x: cx, z: cz } = CLEAR, g = this.terrainHeight(cx, cz);
    torii(this, pathX(-106), -106, this.terrainHeight(pathX(-106), -106), { span: 5, h: 5, color: 0xa8402f });
    stoneLantern(this, cx - 6, cz + 8, g, 1, 0x9dff8a);
    stoneLantern(this, cx + 6, cz + 8, g, 1, 0x9dff8a);
    this.pillar(cx, cz, 1.2, g - 1, g + 6, 0x4a3a30, 0x6a5a48);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const blob = addOutline(new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), glowMaterial(0x5fe0a8, 0.45)), 0.05);
      blob.position.set(cx + Math.cos(a) * 3.4, g + 11.5 + Math.sin(i * 2) * 0.8, cz + Math.sin(a) * 3.4);
      this.add(blob);
    }
    const top = addOutline(new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), glowMaterial(0x7dffc8, 0.55)), 0.05);
    top.position.set(cx, g + 13.5, cz);
    const halo = glowSprite(0x7dffc8, 16, 0.5);
    halo.position.set(cx, g + 12, cz);
    this.add(top, halo);
    // Stone pillars spiral up to the trunk top.
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + i * 0.8;
      this.pillar(cx + Math.cos(a) * 4, cz + Math.sin(a) * 4, 0.8, g - 1, g + 1.5 * (i + 1), 0x5a625c, 0x5d8a4a);
    }
    this.jewel(cx, g + 6, cz, 'Royal Star', { star: true, beamColor: 0xb8ffd8 });
    this.particles({ count: 70, box: { x0: cx - 10, x1: cx + 10, y0: g + 1, y1: g + 13, z0: cz - 10, z1: cz + 10 }, color: 0x7dffc8, size: 0.7, mode: 'float', speed: 0.6 });
  }
}
void mix;
