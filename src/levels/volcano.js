import * as THREE from 'three';
import { Stage, noise, smooth } from '../stage.js';
import { torii, stoneLantern, banner, standingStone } from '../deco.js';
import { pbr } from '../graphics.js';
import { buildMountain } from '../mountain.js';

// Level 4 - Fire Mountain (an active volcano at sunset).
// Cross the scorched foothills between lava pools, then climb the ash slopes and black lava-rock
// cliffs past the snow line to the watchtower on the rim, with smoke rising from the summit.

const R = 70, H = 100;

export class VolcanoLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 44 });
    this.title = 'Fire Mountain';
    this.environment({
      skyTop: 0x2e2838, skyMid: 0x6a5262, skyBottom: 0xd09078,
      fog: [0x6a5560, 40, 260],
      hemi: [0xe0c0d0, 0x3a2020, 1.0],
      sun: { color: 0xffa060, intensity: 2.4, dir: [0.25, 0.45, -1] },
      env: 'sunset', envIntensity: 0.8, exposure: 0.85,
    });
    this.bloom = 0.6; this.bloomThreshold = 1.5;
    this.map.bg = '#2a1e22'; this.map.platform = 'rgba(255,190,150,0.8)';

    // Foothills: ash plain with lava pools (kept clear of the trailhead).
    const startGuess = { x: 0, z: R + 2 };
    const baseHeight = (x, z) => {
      let h = 1.5 + (noise(x * 0.05, z * 0.05) - 0.5) * 1.2;
      const pool = noise(x * 0.035 + 7, z * 0.035 + 3);
      const away = smooth(12, 20, Math.hypot(x - startGuess.x, z - startGuess.z));
      if (pool > 0.6) h -= Math.min(4, 1.2 + (pool - 0.6) * 25) * away;
      return h;
    };
    let decor = 0;
    const mtn = buildMountain(this, {
      H, R, seed: 3, dir: 1, p: 1.1, detailAmp: 8, baseHeight,
      rockMat: pbr('darkRock', { tint: 0xb0a8a8, tile: 1.6 }),
      farColor: 0x8a6a70, farHaze: 0.55,
      onTrail: (s, pt, out) => {
        decor++;
        const p = pt.clone().addScaledVector(out, 2.6), g = s.terrainHeight(p.x, p.z);
        if (decor % 3 === 0) banner(s, p.x, p.z, g, 0xb8222a, 3.6);
      },
    });

    // Ash on the gentle ground, black rock on cliffs, snow above the snow line.
    this.terrain((R + 52) * 2, 230, (x, z) => this.mountainHeight(x, z), () => {}, {
      layers: ['ash', 'darkRock', 'snow'],
      tints: [0x9a8e88, 0x8a8080, 0xffffff],
      weights: (x, y, z, ny) => {
        const snow = smooth(H * 0.68, H * 0.8, y + (noise(x * 0.2, z * 0.2) - 0.5) * 8);
        if (this.trailDistance(x, z) < 2.3) return [1 - snow * 0.6, 0, snow * 0.6];
        if (ny < 0.7) return [0, 1 - snow * 0.3, snow * 0.3];
        return [(1 - snow) * 0.75, (1 - snow) * 0.25, snow];
      },
    });
    mtn.build();
    this.mapColor = (h) => (h < -0.4 ? [255, 110, 40] : h > H * 0.72 ? [235, 235, 240] : [70 + h, 60 + h * 0.8, 62 + h * 0.8]);

    // Molten lava in the pools.
    const lava = this.hazard(-0.5, pbr('darkRock', { tint: 0xff7a30, emissive: 0xff4a10, emissiveIntensity: 2.2, rough: 0.6, tile: 4 }), 0.6);
    this.onUpdate((dt, t) => { lava.material.emissiveIntensity = 2.0 + Math.sin(t * 2) * 0.35; });

    const st = mtn.startPos, g0 = this.terrainHeight(st.x, st.z);
    torii(this, st.x + 5, st.z, g0, { span: 4, h: 4.6, color: 0x8a2020, top: 0x1a1418, axis: 'z' });
    stoneLantern(this, st.x + 6, st.z + 3, this.terrainHeight(st.x + 6, st.z + 3), 1, 0xff9a4a);
    stoneLantern(this, st.x + 6, st.z - 3, this.terrainHeight(st.x + 6, st.z - 3), 1, 0xff9a4a);
    // Standing stones on the scorched plain.
    const r = this.rand;
    for (let i = 0, tries = 0; i < 16 && tries < 300; tries++) {
      const a = r() * Math.PI * 2, d = R + 6 + r() * 28, x = Math.cos(a) * d, z = Math.sin(a) * d, g = this.terrainHeight(x, z);
      if (g < 1 || Math.hypot(x - st.x, z - st.z) < 10 || this.routeDistance(x, z) < 6) continue;
      standingStone(this, x, z, g, 3 + r() * 4, 0.8 + r() * 0.6);
      i++;
    }
    // Smoke rising from the summit, embers and falling ash.
    this.particles({ count: 220, box: { x0: -10, x1: 10, y0: H + 4, y1: H + 70, z0: -10, z1: 10 }, color: 0x4a4048, size: 3.5, mode: 'rise', speed: 2.2, additive: false, opacity: 0.55 });
    this.particles({ count: 380, box: { x0: -R - 20, x1: R + 20, y0: 0, y1: H + 10, z0: -R - 20, z1: R + 20 }, color: 0xff8a3a, size: 0.24, mode: 'rise', speed: 1.3 });
    this.particles({ count: 260, box: { x0: -R - 20, x1: R + 20, y0: 0, y1: H + 10, z0: -R - 20, z1: R + 20 }, color: 0x2a2224, size: 0.2, mode: 'fall', speed: 0.6, additive: false, opacity: 0.8 });
    this.spawn.y = g0;
  }
}
void THREE;
