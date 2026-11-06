import * as THREE from 'three';
import { Stage } from '../stage.js';
import { jpHouse, torii, stoneLantern, paperLantern, lampPost, lanternString } from '../deco.js';
import { pbr } from '../graphics.js';
import { buildMountain } from '../mountain.js';

// Level 3 - Lantern Peak (old town at night).
// Leave the lantern-lit town at the foot of the mountain and climb a stone-paved pilgrim path
// lined with glowing lanterns, up to the watchtower under the stars.

const R = 60, H = 85;

export class LanternLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 33 });
    this.title = 'Lantern Peak';
    this.environment({
      skyTop: 0x030a0d, skyMid: 0x0b2024, skyBottom: 0x1d3f3a,
      fog: [0x10262a, 30, 220],
      hemi: [0x6a88a8, 0x2a1a10, 0.5],
      sun: { color: 0x9ab8d0, intensity: 0.6, dir: [-0.3, 1, 0.5] },
      stars: 450, env: 'night', envIntensity: 0.4, exposure: 0.85,
    });
    this.night = true; this.lanternLights = true;
    this.bloom = 0.6; this.bloomThreshold = 1.4;
    this.map.bg = '#1a1612'; this.map.platform = 'rgba(255,214,150,0.85)';

    let decor = 0;
    const colors = [0xe0303a, 0xfff1d6, 0xff8a3a];
    const mtn = buildMountain(this, {
      H, R, seed: 2, dir: 1, detailAmp: 7,
      rockMat: pbr('mossRock', { tint: 0xa8a6a2, tile: 1.6 }),
      farColor: 0x14282c, farHaze: 0.8,
      // A lantern on a post at every bend of the pilgrim path.
      onTrail: (s, pt, out) => {
        decor++;
        const p = pt.clone().addScaledVector(out, 2.5), g = s.terrainHeight(p.x, p.z);
        s.pillar(p.x, p.z, 0.08, g, g + 2.6, 0, null, { segments: 6, material: pbr('darkWood'), blockCamera: false });
        paperLantern(s, p.x, g + 2.3, p.z, colors[decor % 3], 0.85);
      },
    });

    this.terrain((R + 52) * 2, 220, (x, z) => this.mountainHeight(x, z), () => {}, {
      layers: ['flagstone', 'dirt', 'mossRock'],
      tints: [0xa8a6a2, 0x8a8078, 0x9a9890],
      rough: [0.5, 0.9, 0.8],
      weights: (x, y, z, ny) => {
        if (this.trailDistance(x, z) < 2.2) return [1, 0, 0];      // stone-paved pilgrim path
        if (ny < 0.72) return [0, 0.2, 0.8];
        return [0, 0.75, 0.25];
      },
    });
    mtn.build();
    this.mapColor = (h) => [40 + h * 1.5, 36 + h * 1.5, 30 + h];

    // The town at the foot of the mountain: a short street of machiya leading to the trailhead.
    const st = mtn.startPos, g0 = this.terrainHeight(st.x, st.z);
    for (let i = 0; i < 4; i++) {
      const sx = st.x + 10 + i * 8;
      for (const side of [-1, 1]) {
        const hz = st.z + side * 6.5;
        jpHouse(this, sx, hz, {
          w: 7, d: 6, h: 4.4, ground: this.terrainHeight(sx, hz) - 0.2, face: side > 0 ? '-z' : '+z', roofH: 1.4,
          wall: 0x5b3a26, trim: 0x2e1f16, roof: 0x3d4a48, window: 0xffc87a, upper: true,
          noren: [0x7a1f2b, 0x2b3a6b][i % 2], lanterns: i % 2 ? null : 0xe0303a, door: 0x3a2618,
        });
      }
      if (i % 2 === 0) {
        const a = lampPost(this, sx + 4, st.z - 3.2, this.terrainHeight(sx + 4, st.z - 3.2), 3.6, 0xffd9a0);
        const b = lampPost(this, sx + 4, st.z + 3.2, this.terrainHeight(sx + 4, st.z + 3.2), 3.6, 0xffd9a0);
        lanternString(this, new THREE.Vector3(a.x, a.y + 0.5, a.z), new THREE.Vector3(b.x, b.y + 0.5, b.z), 3, 0xff6a3a);
      }
    }
    torii(this, st.x + 4, st.z, g0, { span: 4.2, h: 4.8, color: 0xc0301e, axis: 'z' });
    stoneLantern(this, st.x + 3, st.z + 3.2, this.terrainHeight(st.x + 3, st.z + 3.2));
    stoneLantern(this, st.x + 3, st.z - 3.2, this.terrainHeight(st.x + 3, st.z - 3.2));
    this.particles({ count: 260, box: { x0: -R - 10, x1: R + 40, y0: 1, y1: H, z0: -R - 10, z1: R + 10 }, color: 0xffb35a, size: 0.18, mode: 'float', speed: 0.4 });
    this.bounds.r += 20;    // room for the town street
    this.spawn.y = g0;
  }
}
