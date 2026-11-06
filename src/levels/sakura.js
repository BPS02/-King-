import * as THREE from 'three';
import { Stage, noise } from '../stage.js';
import { torii, cherryTree, stoneLantern, grassField } from '../deco.js';
import { pbr } from '../graphics.js';
import { petalTexture } from '../proctex.js';
import { buildMountain } from '../mountain.js';

// Level 1 - Sakura Peak.
// A cherry-blossom mountain on a spring afternoon. Follow the switchback trails, leap up the
// rock ledges on the cliffs, light the checkpoint lanterns, and reach the watchtower on the summit.

const R = 62, H = 70;

export class SakuraLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 11 });
    this.title = 'Sakura Peak';
    this.environment({
      skyTop: 0x2f7fe8, skyMid: 0x8cc8ff, skyBottom: 0xd8e8f4,
      fog: [0xc4d6e6, 110, 460],
      hemi: [0xdfefff, 0x6a5a48, 1.1],
      sun: { color: 0xffe6c4, intensity: 3.2, dir: [0.55, 0.62, 0.42] },
      physicalSky: { turbidity: 2.6, rayleigh: 1.3, mie: 0.004 },
      env: 'day', envIntensity: 1.0, exposure: 0.58,
    });
    this.bloom = 0.3; this.bloomThreshold = 3.5;
    this.map.bg = '#8fd46a'; this.map.platform = 'rgba(255,240,245,0.9)';

    const pinks = [0xffb7d0, 0xff9cc2, 0xffd1e3];
    let decor = 0;
    const mtn = buildMountain(this, {
      H, R, seed: 0, detailAmp: 6,
      rockMat: pbr('mossRock', { tint: 0xd4d0c8, tile: 1.6 }),
      farColor: 0xa8bcd4, farHaze: 0.45,
      // Along the trail: cherry trees and stone lanterns on the downhill side.
      onTrail: (s, pt, out) => {
        decor++;
        const p = pt.clone().addScaledVector(out, decor % 2 ? 3.8 : 2.6);
        const g = s.terrainHeight(p.x, p.z);
        if (decor % 2) cherryTree(s, p.x, p.z, g, { scale: 0.9 + (decor % 3) * 0.15, colors: pinks });
        else stoneLantern(s, p.x, p.z, g, 0.8);
      },
    });

    // Ground: grass on gentle slopes, worn dirt on the trail, bare rock on cliffs.
    this.terrain((R + 52) * 2, 220, (x, z) => this.mountainHeight(x, z), () => {}, {
      layers: ['grass', 'dirt', 'mossRock'],
      tints: [0xb8e08a, 0xffffff, 0xe0dcd4],
      weights: (x, y, z, ny) => {
        if (this.trailDistance(x, z) < 2.3) return [0, 1, 0];
        if (ny < 0.72) return [0, 0.15, 0.85];
        const d = Math.max(0, Math.min(1, (noise(x * 0.12, z * 0.12) - 0.58) * 3));
        return [1 - d, d, 0];
      },
    });
    mtn.build();
    this.mapColor = (h) => (h > 40 ? [190, 186, 180] : [143 - h, 212 - h * 1.5, 106 - h]);

    // Trailhead: a red torii and lanterns where the climb begins.
    const st = mtn.startPos, g0 = this.terrainHeight(st.x, st.z);
    torii(this, st.x + 5, st.z, g0, { span: 4, h: 4.6, color: 0xe03a24, axis: 'z' });
    stoneLantern(this, st.x + 6, st.z + 3, this.terrainHeight(st.x + 6, st.z + 3));
    stoneLantern(this, st.x + 6, st.z - 3, this.terrainHeight(st.x + 6, st.z - 3));

    // Cherry groves on the foothills.
    const r = this.rand;
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2, d = R - 4 + r() * 34;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.trailDistance(x, z) < 6 || Math.hypot(x - st.x, z - st.z) < 9) continue;
      cherryTree(this, x, z, this.terrainHeight(x, z), { scale: 1.1 + r() * 0.5, colors: pinks });
    }
    grassField(this, 12000, { x0: -R - 45, x1: R + 45, z0: -R - 45, z1: R + 45 }, (x, z) => {
      const y = this.terrainHeight(x, z);
      if (this.trailDistance(x, z) < 2.4) return null;
      const slope = Math.abs(this.terrainHeight(x + 1, z) - y) + Math.abs(this.terrainHeight(x, z + 1) - y);
      return slope > 0.9 ? null : y;
    });
    this.particles({ count: 900, box: { x0: -R - 20, x1: R + 20, y0: 0, y1: H + 15, z0: -R - 20, z1: R + 20 }, color: 0xffffff, size: 0.16, mode: 'fall', speed: 0.8, texture: petalTexture() });

    this.spawn.y = g0;
  }
}
void THREE;
