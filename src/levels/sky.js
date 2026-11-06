import * as THREE from 'three';
import { Stage, smooth } from '../stage.js';
import { floatingRock, cherryTree, stoneLantern, torii } from '../deco.js';
import { pbr } from '../graphics.js';
import { glowSprite } from '../toon.js';
import { buildMountain } from '../mountain.js';

// Level 5 - Sky Spire (a mountain floating above a sea of pink clouds).
// Every cliff is climbed on stones hovering in the air. Don't fall into the clouds!
// The great sky orb shines a beam down onto the watchtower at the top.

const R = 56, H = 90;
const RED = [0xe0283c, 0xff4a5a, 0xc81e32];

export class SkyLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 55 });
    this.title = 'Sky Spire';
    this.environment({
      skyTop: 0x5a3a9a, skyMid: 0xe890c8, skyBottom: 0xffd6e8,
      fog: [0xd8a0cc, 90, 380],
      hemi: [0xffe0f0, 0x7a5a9a, 1.25],
      sun: { color: 0xffe2c0, intensity: 2.6, dir: [0.35, 0.8, -0.5] },
      env: 'pink', envIntensity: 0.8, exposure: 0.68,
    });
    this.bloom = 0.5; this.bloomThreshold = 1.4;
    this.map.bg = '#f0c0dc'; this.map.platform = 'rgba(90,60,120,0.75)';
    this.hazard(-13, new THREE.MeshStandardMaterial({ color: 0xe8c4dc, roughness: 1 }), 0);

    let decor = 0;
    const mtn = buildMountain(this, {
      H, R, seed: 4, dir: -1, detailAmp: 6,
      rockMat: pbr('mossRock', { tint: 0xb8a8c8, tile: 1.6 }),
      farColor: 0xd8a0cc, farHaze: 0.7,
      // The island ends in a cliff into the clouds just past the trailhead.
      baseHeight: (x, z) => -40 * smooth(R + 8, R + 14, Math.hypot(x, z)),
      // Hovering stones instead of rocks.
      ledge: (s, x, z, top) => {
        floatingRock(s, x, top, z, 1.15, { top: 0xeee8f5, rock: 0x5a4a6a, depth: 1.8 });
        return { radius: 1.15 };
      },
      onTrail: (s, pt, out) => {
        decor++;
        const p = pt.clone().addScaledVector(out, decor % 2 ? 3.6 : 2.5), g = s.terrainHeight(p.x, p.z);
        if (decor % 2) cherryTree(s, p.x, p.z, g, { scale: 0.9, colors: RED, trunk: 0x3a2a2a });
        else stoneLantern(s, p.x, p.z, g, 0.8, 0xffc0e0);
      },
    });

    this.terrain((R + 52) * 2, 220, (x, z) => this.mountainHeight(x, z), () => {}, {
      layers: ['grass', 'dirt', 'mossRock'],
      tints: [0xd8c8e8, 0xe0d0c8, 0xc8b8d8],
      weights: (x, y, z, ny) => {
        if (this.trailDistance(x, z) < 2.3) return [0, 1, 0];
        if (ny < 0.72 || y < -2) return [0, 0, 1];
        return [1, 0, 0];
      },
    });
    mtn.build();
    this.mapColor = (h) => (h < -5 ? [240, 192, 220] : [200 + h * 0.4, 180 + h * 0.6, 210]);

    const st = mtn.startPos, g0 = this.terrainHeight(st.x, st.z);
    torii(this, st.x - 5, st.z, g0, { span: 4, h: 4.6, color: 0xd8342a, axis: 'z' });
    this.buildClouds();
    this.buildDistant();
    this.buildOrb(mtn);
    this.particles({ count: 400, box: { x0: -R - 20, x1: R + 20, y0: -2, y1: H + 20, z0: -R - 20, z1: R + 20 }, color: 0xffd0f0, size: 0.3, mode: 'float', speed: 0.8 });
    this.spawn.y = g0;
  }

  buildClouds() {
    const mats = [], r = this.rand;
    for (let i = 0; i < 520; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 320, s = 7 + r() * 12;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, -14 + r() * 3, Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.45, s)));
    }
    this.instanced(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xf2d4e6, roughness: 1 }), mats, { shadow: false });
  }

  // Small floating islands with red trees, drifting around the spire.
  buildDistant() {
    const r = this.rand;
    for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2, d = R + 30 + r() * 110;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = -6 + r() * 70, rad = 3 + r() * 6;
      floatingRock(this, x, y, z, rad, { solid: false, depth: 2 });
      if (r() < 0.75) cherryTree(this, x + (r() - 0.5) * rad, z + (r() - 0.5) * rad, y, { scale: 0.8 + rad * 0.2, colors: RED, trunk: 0x3a2a2a });
    }
  }

  // The sky orb above the summit, with a light beam down onto the watchtower.
  buildOrb(mtn) {
    const top = new THREE.Vector3(mtn.segs ? 0 : 0, this.summitY + 3, 0);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4c8, fog: false }));
    orb.position.set(-30, this.summitY + 70, -60);
    this.add(orb);
    const glows = [[0xffd27a, 36, 0.9], [0xff8ad0, 90, 0.6], [0xffffff, 16, 1]].map(([c, s, o]) => {
      const sp = glowSprite(c, s, o);
      sp.material.fog = false;
      sp.position.copy(orb.position);
      this.add(sp);
      return sp;
    });
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(11 + i * 5, 0.3, 8, 64), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff9ad8 : 0xffd27a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      ring.position.copy(orb.position);
      this.add(ring);
      rings.push(ring);
    }
    const len = orb.position.distanceTo(top);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.copy(orb.position).add(top).multiplyScalar(0.5);
    beam.lookAt(top);
    beam.rotateX(Math.PI / 2);
    this.add(beam);
    this.onUpdate((dt, time) => {
      rings.forEach((r, i) => { r.rotation.x = time * (0.3 + i * 0.15); r.rotation.y = time * (0.2 - i * 0.1); });
      glows[1].material.opacity = 0.5 + Math.sin(time * 1.5) * 0.15;
    });
  }
}
