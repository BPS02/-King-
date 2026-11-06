import * as THREE from 'three';
import { Stage, fbm, noise, smooth } from '../stage.js';
import { toonMaterial, glowMaterial, addOutline, glowTexture } from '../toon.js';
import { jpHouse, lampPost, lanternString, paperLantern, stoneLantern, pagoda } from '../deco.js';

// Level 3 - Lantern Street (old town at night).
// Start at the top of a stone stairway, run down the glowing street (or across the rooftops),
// then climb the five-tier pagoda ledge by ledge to the Royal Star on top.

function height(x, z) {
  const ax = Math.abs(x);
  const h = Math.max(smooth(20, 34, ax) * (6 + fbm(x * 0.05, z * 0.05) * 8), 10 * smooth(-0.15, 0.15, z));
  return h + smooth(-138, -150, z) * 10 + smooth(14, 26, z) * 8;
}

export class LanternLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 33 });
    this.title = 'Lantern Street';
    this.bounds = { x: 0, z: -62, r: 86 };
    this.map = { x: 0, z: -62, size: 180, bg: '#1a1612', platform: 'rgba(255,214,150,0.85)' };
    this.environment({
      skyTop: 0x030a0d, skyMid: 0x0b2024, skyBottom: 0x1d3f3a,
      fog: [0x10262a, 25, 140],
      hemi: [0x8aa8c0, 0x2a1a10, 0.75],
      sun: { color: 0x9ab8d0, intensity: 0.7, dir: [-0.3, 1, 0.5] },
      stars: 450,
    });

    const wetA = new THREE.Color(0x3c4248), wetB = new THREE.Color(0x464c55), dirt = new THREE.Color(0x2e2a26);
    this.terrain(260, 130, height, (x, y, z, ny, c) => {
      if (Math.abs(x) < 4.2 && z < -18) c.copy(((Math.floor(x / 1.1) + Math.floor(z / 2.2)) & 1) ? wetA : wetB);
      else c.copy(dirt).lerp(new THREE.Color(0x3a3a30), noise(x * 0.2, z * 0.2));
    });
    this.mapColor = (h) => [40 + h * 4, 36 + h * 4, 30 + h * 3];

    this.buildStairs();
    this.buildStreet();
    this.buildGarden();
    this.buildPagoda();
    this.buildLights();
    this.particles({ count: 120, box: { x0: -10, x1: 10, y0: 1, y1: 9, z0: -130, z1: -10 }, color: 0xffb35a, size: 0.18, mode: 'float', speed: 0.4 });

    this.spawn.set(0, 10, 3);
  }

  buildStairs() {
    for (let i = 1; i <= 20; i++) {
      const top = 10 - 0.5 * i, z = -(i - 0.5);
      this.block(0, top, z, 7, top + 0.5, 1.02, i % 2 ? 0x77737e : 0x6c6874, { outline: 0.02 });
      if (i % 5 === 0) this.gem(0, top, z, 0xffb35a);
    }
    // Stepped stone walls beside the stairs, with lanterns on top.
    for (let k = 0; k < 5; k++) {
      const top = 10 - k * 2 + 1.2, z = -2 - k * 4;
      for (const side of [-1, 1]) {
        this.block(side * 5.5, top, z, 4, top + 0.5, 4.02, 0x58545e, { outline: 0.03 });
        paperLantern(this, side * 4.2, top + 0.6, z, 0xfff1d6, 0.9);
      }
    }
    stoneLantern(this, -4, 4, 10);
    stoneLantern(this, 4, 4, 10);
  }

  buildStreet() {
    const norens = [0x7a1f2b, 0x2b3a6b, 0x3f5a3a];
    const zs = [-26, -35, -44, -53, -62, -71, -80, -89, -98, -107];
    for (const side of [-1, 1]) {
      zs.forEach((z, i) => {
        if (side > 0 && z === -62) return; // garden gap
        const h = 4.2 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 0.1;
        const top = jpHouse(this, side * 7, z, {
          w: 6, d: 7, h, face: side > 0 ? '-x' : '+x', roofH: 1.4,
          wall: 0x5b3a26, trim: 0x2e1f16, roof: 0x3d4a48, window: 0xffc87a, upper: true,
          awning: 0x3d4a48, awningStripe: 0x34403e, noren: norens[i % 3], lanterns: i % 2 ? null : 0xe0303a, door: 0x3a2618,
        });
        this.gem(side * 7, top + 0.63, z, 0xffb35a);
      });
    }
    for (const z of [-30, -48, -66, -84, -102]) {
      const a = lampPost(this, -3.6, z, 0, 3.6, 0xffd9a0), b = lampPost(this, 3.6, z, 0, 3.6, 0xffd9a0);
      lanternString(this, new THREE.Vector3(a.x, a.y + 0.5, a.z), new THREE.Vector3(b.x, b.y + 0.5, b.z), 3, 0xff6a3a);
    }
    for (let z = -22; z > -112; z -= 4.5) this.gem(Math.sin(z * 0.2) * 1.8, 0, z, 0xffb35a);
  }

  buildGarden() {
    // Weeping blossom tree in a small garden between houses.
    const x = 8, z = -62;
    stoneLantern(this, 5.2, -59.5, 0, 1, 0xffc87a);
    const trunk = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 5, 8).translate(0, 2.5, 0), toonMaterial(0x3a2a22)), 0.04);
    trunk.position.set(x, 0, z);
    trunk.rotation.z = 0.12;
    this.add(trunk);
    this.solidCyl(x, z, 0.5, -1, 5);
    const crown = addOutline(new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), toonMaterial(0xe8c6d2)), 0.05);
    crown.position.set(x, 6, z);
    crown.scale.y = 0.6;
    this.add(crown);
    const strands = [];
    for (let i = 0; i < 140; i++) {
      const a = this.rand() * Math.PI * 2, r = 1.2 + this.rand() * 1.5, len = 1.5 + this.rand() * 2.2;
      strands.push(new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * r, 5.8 - len / 2, z + Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, len, 1)));
    }
    this.instanced(new THREE.BoxGeometry(0.12, 1, 0.12), glowMaterial(0xf2d6e0, 0.25), strands, { shadow: false });
  }

  buildPagoda() {
    const cz = -126;
    this.block(0, 1.5, cz, 16, 2, 20, 0x5a5660);
    for (let i = 1; i <= 2; i++) this.block(0, i * 0.5, cz + 10 + (3 - i) * 0.9, 6, i * 0.5 + 0.3, 0.92, 0x5a5660, { outline: 0.02 });
    const p = pagoda(this, 0, cz, 1.5, {
      tiers: 5, half: 4.5, shrink: 0.8, tierH: 1.6, wall: 0x6a3a22, roof: 0x2f3a38, trim: 0xe0b040, lanterns: 0xff8a3a, steps: '+z',
    });
    for (let i = 0; i < 4; i++) {
      const y = 1.5 + 2.8 + 0.35 + i * 1.6;
      const e = 4.5 - i * 0.8 + 1.3 - 0.4;
      this.gem(e, y, cz + 0.5, 0xffb35a);
    }
    this.jewel(0, p.top, cz + 1.2, 'Royal Star', { star: true, beamColor: 0xffd0a0 });
    stoneLantern(this, -6.5, cz + 8, 1.5, 1.1);
    stoneLantern(this, 6.5, cz + 8, 1.5, 1.1);
  }

  buildLights() {
    // Warm pools of lantern light (real lights + soft glow on the wet street).
    const spots = [[0, 13, 4], [0, 4, -12], [0, 3.5, -30], [0, 3.5, -48], [0, 3.5, -66], [0, 3.5, -84], [0, 3.5, -102], [0, 9, -118]];
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff9a4a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [x, y, z] of spots) {
      const l = new THREE.PointLight(0xffa04a, 65, 24, 1.6);
      l.position.set(x, y, z);
      this.add(l);
      if (z < -20) {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), glowMat);
        pool.position.set(x, 0.04, z);
        this.add(pool);
      }
    }
  }
}
