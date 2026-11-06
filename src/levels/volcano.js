import * as THREE from 'three';
import { Stage, fbm, noise, smooth, mix } from '../stage.js';
import { toonMaterial, glowMaterial } from '../toon.js';
import { jpHouse, torii, cherryTree, archBridge, standingStone, banner, volcano, stoneLantern } from '../deco.js';

// Level 4 - Ember Volcano (ruined village under an erupting volcano).
// Cross the lava river on the red arched bridge, weave through the stone field
// past bubbling lava pools, hop the second lava river, and scale the cliff terraces
// to the shrine gate where the Royal Star waits.

const river1 = (x) => -30 + Math.sin(x * 0.08) * 4;
const river2 = (x) => -80 + Math.sin(x * 0.05) * 3;
const POOLS = [[-8, -48, 3.2], [7, -55, 2.8], [-4, -64, 3]];

function height(x, z) {
  const ax = Math.abs(x);
  let h = 1 + fbm(x * 0.07 + 5, z * 0.07) * 3 * (1 - smooth(-84, -92, z));
  h += smooth(22, 40, ax) * 14 + smooth(14, 26, z) * 8;
  for (const [px, pz, r] of POOLS) h = mix(-2, h, smooth(r - 1.2, r + 0.8, Math.hypot(x - px, z - pz)));
  h = mix(-2, h, smooth(3.5, 5, Math.abs(z - river1(x))));
  h = mix(-2, h, smooth(6, 8, Math.abs(z - river2(x))));
  h += 4 * (smooth(-94, -95.5, z) + smooth(-101, -102.5, z) + smooth(-108, -109.5, z));
  return h;
}

export class VolcanoLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 44 });
    this.title = 'Ember Volcano';
    this.bounds = { x: 0, z: -55, r: 80 };
    this.map = { x: 0, z: -55, size: 170, bg: '#2a1e22', platform: 'rgba(255,190,150,0.8)' };
    this.environment({
      skyTop: 0x2e2838, skyMid: 0x6a5262, skyBottom: 0xd09078,
      fog: [0x6a5560, 30, 170],
      hemi: [0xe0c0d0, 0x3a2020, 1.0],
      sun: { color: 0xffa060, intensity: 2.0, dir: [0.25, 0.7, -1] },
    });

    const rockA = new THREE.Color(0x3e363a), rockB = new THREE.Color(0x56484a), ash = new THREE.Color(0x6a5e5a), burn = new THREE.Color(0x8a3a22);
    this.terrain(260, 130, height, (x, y, z, ny, c) => {
      if (y < 0.3) c.copy(burn);
      else if (ny < 0.7) c.setHex(0x2a2428);
      else c.copy(rockA).lerp(rockB, noise(x * 0.15, z * 0.15)).lerp(ash, Math.max(0, noise(x * 0.05 + 9, z * 0.05) - 0.5));
    });
    this.mapColor = (h) => (h < 0 ? [255, 110, 40] : [60 + h * 4, 50 + h * 3, 52 + h * 3]);
    const lava = this.hazard(0, toonMaterial(0xff5a1a, { emissive: 0xff4a10, emissiveIntensity: 0.9 }), 0.6);
    this.onUpdate((dt, t) => { lava.material.emissiveIntensity = 0.8 + Math.sin(t * 2) * 0.15; });

    volcano(this, 0, -290, 120, 78);
    this.buildVillage();
    this.buildBridge();
    this.buildStoneField();
    this.buildRiverTwo();
    this.buildTerraces();
    this.particles({ count: 320, box: { x0: -26, x1: 26, y0: 0, y1: 16, z0: -125, z1: 12 }, color: 0xff8a3a, size: 0.24, mode: 'rise', speed: 1.3 });
    this.particles({ count: 200, box: { x0: -26, x1: 26, y0: 0, y1: 18, z0: -125, z1: 12 }, color: 0x2a2224, size: 0.2, mode: 'fall', speed: 0.6, additive: false, opacity: 0.8 });

    this.spawn.set(0, this.terrainHeight(0, 8), 8);
  }

  buildVillage() {
    const wall = 0x4a3a32, roof = 0x2b2b30, trim = 0x241812;
    [[-9, 0, '+x'], [-9, -11, '+x'], [9, -4, '-x'], [9, -15, '-x']].forEach(([x, z, face], i) => {
      const g = this.terrainHeight(x, z);
      const top = jpHouse(this, x, z, { w: 6, d: 7, h: 4.2 + (i % 2) * 0.6, ground: g, face, wall, roof, trim, window: 0xff8a3a, noren: 0x6a1a1a, awning: i % 2 ? null : 0x3a2a2a, awningStripe: 0x2e2222 });
      this.gem(x, top + 0.72, z, 0xffa05a);
    });
    for (const [x, z] of [[-4, 2], [4, -8], [-4, -18], [4, 4]]) banner(this, x, z, this.terrainHeight(x, z), 0xb8222a);
    cherryTree(this, -16, -8, this.terrainHeight(-16, -8), { scale: 2.2, colors: [0xb07ad8, 0x9a5ac8, 0xd0a0f0], trunk: 0x3a2a2a });
    for (let z = 4; z > -20; z -= 5) this.gem(0, this.terrainHeight(0, z), z, 0xffa05a);
  }

  buildBridge() {
    torii(this, 0, -23, this.terrainHeight(0, -23), { span: 5, h: 5, color: 0x8a2020, top: 0x1a1418 });
    const base = Math.max(this.terrainHeight(0, -24), this.terrainHeight(0, -36));
    archBridge(this, 0, -24, -36, base, { width: 3, rise: 1.8, color: 0xb8322a, deck: 0x5a3e2a });
    this.gem(0, base + 2.05, -30, 0xffa05a);
  }

  buildStoneField() {
    const r = this.rand;
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 14; tries++) {
      const x = (r() - 0.5) * 36, z = -40 - r() * 32;
      if (Math.abs(x) < 2.5) continue;
      if (POOLS.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + 2)) continue;
      const g = this.terrainHeight(x, z);
      if (g < 0.5) continue;
      standingStone(this, x, z, g, 3 + r() * 4, 0.8 + r() * 0.6);
      placed++;
    }
    // Glowing cracks in the ground.
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 34, z = -38 - r() * 36, g = this.terrainHeight(x, z);
      if (g < 0.5) continue;
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 2 + r() * 4), glowMaterial(0xff7a2a, 1));
      crack.position.set(x, g + 0.02, z);
      crack.rotation.y = r() * Math.PI;
      this.add(crack);
    }
    // Gems hop between pools.
    for (const [px, pz, pr] of POOLS) this.gem(px + pr + 1.2, this.terrainHeight(px + pr + 1.2, pz), pz, 0xffa05a);
    for (let z = -42; z > -72; z -= 6) this.gem(0, this.terrainHeight(0, z), z, 0xffa05a);
  }

  buildRiverTwo() {
    const bankA = this.terrainHeight(0, -71.5), bankB = this.terrainHeight(0, -88.5);
    const y = bankB + 0.3;
    const s1 = bankA + 0.4, s2 = (bankA + y) / 2 + 0.3;
    this.pillar(0, -74, 0.9, -2, s1, 0x2e2a30, 0x4a4248);
    this.pillar(0.6, -77.5, 0.9, -2, s2, 0x2e2a30, 0x4a4248);
    this.mover(new THREE.Vector3(0, y, -80.6), new THREE.Vector3(0, y, -85.4), 5, 2.4, 2.4, 0x5a4a50);
    this.gem(0, s1, -74, 0xffa05a);
    this.gem(0.6, s2, -77.5, 0xffa05a);
  }

  buildTerraces() {
    // Blocks to climb each cliff terrace, zig-zagging left and right.
    const climb = (x, zCliff, G, T) => {
      const n = Math.max(1, Math.ceil((T - G) / 1.4) - 1);
      for (let i = 1; i <= n; i++) {
        const top = G + ((T - G) * i) / (n + 1), z = zCliff + 0.7 + (n - i) * 1.6;
        this.block(x, top, z, 1.6, top - G + 1, 1.6, 0x4a4046);
        this.gem(x, top, z, 0xffa05a);
      }
    };
    climb(-3, -94, this.terrainHeight(-3, -92), this.terrainHeight(-3, -97));
    climb(4, -101, this.terrainHeight(4, -99), this.terrainHeight(4, -104));
    climb(-4, -108, this.terrainHeight(-4, -106), this.terrainHeight(-4, -111));

    const g = this.terrainHeight(0, -114);
    torii(this, 0, -113, g, { span: 5, h: 5.5, color: 0xb8222a, top: 0x1a1418 });
    stoneLantern(this, -3.5, -116, g, 1.1, 0xff9a4a);
    stoneLantern(this, 3.5, -116, g, 1.1, 0xff9a4a);
    this.block(0, g + 1, -117.5, 2.4, 1.5, 2.4, 0x3a3236);
    this.jewel(0, g + 1, -117.5, 'Royal Star', { star: true, beamColor: 0xffc080 });
  }
}
