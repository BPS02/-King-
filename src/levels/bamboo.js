import * as THREE from 'three';
import { Stage } from '../stage.js';
import { bambooGrove, torii, stoneLantern, paperLantern, grassField } from '../deco.js';
import { pbr } from '../graphics.js';
import { buildMountain, rockLedge } from '../mountain.js';

// Level 2 - Bamboo Peak (night, fireflies, green mist).
// A mountain wrapped in bamboo forest. Climb by moonlight: the trail is lit by green paper
// lanterns, and some cliffs are climbed on old bamboo-grove stumps instead of rocks.

const R = 64, H = 80;

export class BambooLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 22 });
    this.title = 'Bamboo Peak';
    this.environment({
      skyTop: 0x050f0c, skyMid: 0x0f2a22, skyBottom: 0x2a5a45,
      fog: [0x173d30, 14, 150],
      hemi: [0x7fc8a0, 0x0e2218, 0.6],
      sun: { color: 0xbfffe0, intensity: 1.0, dir: [-0.4, 1, -0.5] },
      stars: 300, env: 'night', envIntensity: 0.35, exposure: 0.8,
    });
    this.night = true; this.lanternLights = true;
    this.bloom = 0.55; this.bloomThreshold = 1.3;
    this.map.bg = '#10261d'; this.map.platform = 'rgba(200,255,200,0.75)';

    const stump = pbr('bark', { tint: 0x9a8a70 });
    let decor = 0;
    const mtn = buildMountain(this, {
      H, R, seed: 1, dir: -1, startAngle: Math.PI / 2, detailAmp: 6,
      rockMat: pbr('mossRock', { tint: 0x98a090, tile: 1.6 }),
      farColor: 0x1a3a30, farHaze: 0.75,
      // Every other ledge is a thick bamboo-grove stump instead of a rock.
      ledge: (s, x, z, top, k, opts) => {
        if (k % 2) return rockLedge(s, x, z, top, k, opts);
        const ground = s.terrainHeight(x, z) - 0.5;
        s.pillar(x, z, 0.85, ground, top, 0, 0xb09a70, { material: stump, segments: 16 });
        return { radius: 0.85 };
      },
      onTrail: (s, pt, out) => {
        decor++;
        if (decor % 2 === 0) return;
        const p = pt.clone().addScaledVector(out, 2.6), g = s.terrainHeight(p.x, p.z);
        s.pillar(p.x, p.z, 0.07, g, g + 2.2, 0, null, { segments: 6, material: pbr('darkWood'), blockCamera: false });
        paperLantern(s, p.x, g + 2.0, p.z, 0x9dff8a, 0.75);
      },
    });

    this.terrain((R + 52) * 2, 220, (x, z) => this.mountainHeight(x, z), () => {}, {
      layers: ['forestGround', 'dirt', 'mossRock'],
      tints: [0x9ab88a, 0xb8a890, 0xa8b8a0],
      weights: (x, y, z, ny) => {
        if (this.trailDistance(x, z) < 2.3) return [0, 1, 0];
        if (ny < 0.7) return [0, 0, 1];
        return [1, 0, 0];
      },
    });
    mtn.build();
    this.mapColor = (h) => [40 + h * 1.5, 90 + h, 55 + h];

    // Bamboo forest over the foothills and lower slopes (kept off the route).
    const spots = [], r = this.rand;
    for (let i = 0, tries = 0; i < 1100 && tries < 9000; tries++) {
      const a = r() * Math.PI * 2, d = 14 + Math.sqrt(r()) * (R + 34);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.routeDistance(x, z) < 4.5) continue;
      const y = this.terrainHeight(x, z);
      if (y > H * 0.7) continue;
      spots.push({ x, z, y, h: 9 + r() * 7 });
      i++;
    }
    bambooGrove(this, spots);
    grassField(this, 7000, { x0: -R - 40, x1: R + 40, z0: -R - 40, z1: R + 40 }, (x, z) => {
      const y = this.terrainHeight(x, z);
      if (this.trailDistance(x, z) < 2.3 || y > H * 0.75) return null;
      const slope = Math.abs(this.terrainHeight(x + 1, z) - y) + Math.abs(this.terrainHeight(x, z + 1) - y);
      return slope > 1 ? null : y;
    }, [0x9ac48a, 0xb0d090, 0x88b47a]);

    const st = mtn.startPos, g0 = this.terrainHeight(st.x, st.z);
    torii(this, st.x - 5, st.z, g0, { span: 4, h: 4.4, color: 0xa8402f, axis: 'z' });
    stoneLantern(this, st.x - 6, st.z + 3, this.terrainHeight(st.x - 6, st.z + 3), 1, 0x9dff8a);
    stoneLantern(this, st.x - 6, st.z - 3, this.terrainHeight(st.x - 6, st.z - 3), 1, 0x9dff8a);
    this.particles({ count: 700, box: { x0: -R - 20, x1: R + 20, y0: 0.5, y1: H + 8, z0: -R - 20, z1: R + 20 }, color: 0xc8ff6a, size: 0.35, mode: 'float', speed: 1 });
    this.spawn.y = g0;
  }
}
void THREE;
