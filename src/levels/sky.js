import * as THREE from 'three';
import { Stage } from '../stage.js';
import { toonMaterial, addOutline, glowSprite } from '../toon.js';
import { floatingRock, cherryTree, pagoda, stoneLantern } from '../deco.js';

// Level 5 - Sky Temple (floating islands above a sea of clouds).
// Island-hop on drifting rocks and moving platforms up to the great temple,
// then climb its six roofs to the Royal Star beneath the glowing sky orb.

const RED = [0xe0283c, 0xff4a5a, 0xc81e32];

export class SkyLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 55 });
    this.title = 'Sky Temple';
    this.maxSlope = 1.1;
    this.map = { x: 0, z: -50, size: 150, bg: '#f0c0dc', platform: 'rgba(90,60,120,0.75)' };
    this.environment({
      skyTop: 0x5a3a9a, skyMid: 0xe890c8, skyBottom: 0xffd6e8,
      fog: [0xf0c0dc, 60, 260],
      hemi: [0xffe0f0, 0x7a5a9a, 1.25],
      sun: { color: 0xffe6c0, intensity: 2.0, dir: [0.1, 1, -0.5] },
    });
    this.hazard(-13, new THREE.MeshBasicMaterial({ color: 0xf8e0ee }), 0);

    this.buildClouds();
    this.buildPath();
    this.buildTemple();
    this.buildOrb();
    this.buildDistant();
    this.particles({ count: 260, box: { x0: -25, x1: 25, y0: -2, y1: 30, z0: -115, z1: 12 }, color: 0xffd0f0, size: 0.3, mode: 'float', speed: 0.8 });

    this.spawn.set(0, 0, 6);
  }

  buildClouds() {
    const mats = [], r = this.rand;
    for (let i = 0; i < 420; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 260, s = 6 + r() * 10;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, -14 + r() * 3, -50 + Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.45, s)));
    }
    this.instanced(new THREE.IcosahedronGeometry(1, 2), toonMaterial(0xfff2f8), mats, { shadow: false });
  }

  buildPath() {
    const rock = (x, y, z, r, opts = {}) => { floatingRock(this, x, y, z, r, { top: 0xeee8f5, rock: 0x5a4a6a, ...opts }); this.gem(x, y, z, 0xff7ac0); };
    floatingRock(this, 0, 0, 6, 6, { depth: 1.4 });
    cherryTree(this, -3.5, 7.5, 0, { scale: 1.3, colors: RED, trunk: 0x3a2a2a });
    stoneLantern(this, 3.5, 8.5, 0, 1, 0xffc0e0);
    rock(3, 0.8, -3.5, 2.5);
    rock(-1, 1.8, -9.5, 2);
    this.mover(new THREE.Vector3(-1, 1.8, -13.6), new THREE.Vector3(-1, 1.8, -23), 6, 2.4, 2.4, 0xf3b6e0);
    rock(-1, 2.2, -27.5, 3);
    cherryTree(this, -2.2, -28.5, 2.2, { scale: 0.9, colors: RED, trunk: 0x3a2a2a });
    rock(4.5, 3.4, -31.5, 1.8);
    rock(9, 4.6, -35.5, 1.8);
    this.mover(new THREE.Vector3(13, 4.6, -39), new THREE.Vector3(13, 10, -39), 7, 2.4, 2.4, 0xffd84a);
    floatingRock(this, 13, 10.6, -44.5, 3);
    cherryTree(this, 15.2, -45.5, 10.6, { scale: 0.9, colors: RED, trunk: 0x3a2a2a });
    stoneLantern(this, 14.8, -42.5, 10.6, 0.9, 0xffc0e0);
    rock(9, 11.4, -48.5, 1.4);
    rock(4.5, 12.2, -51, 1.4);
    rock(0, 13, -53.5, 1.4);
    this.mover(new THREE.Vector3(0, 13, -57.4), new THREE.Vector3(0, 13, -74.5), 8, 2.4, 2.4, 0xf3b6e0);
  }

  buildTemple() {
    const g = 13.5, cz = -95;
    floatingRock(this, 0, g, cz, 18, { depth: 1.2 });
    const p = pagoda(this, 0, cz - 5, g, {
      tiers: 6, half: 7, shrink: 0.9, tierH: 1.8, firstH: 3.2, overhang: 1.4,
      wall: 0xb8323a, roof: 0x3a2a3a, trim: 0xe0b040, lanterns: 0xffb0d0, steps: '+z',
    });
    for (let i = 0; i < 5; i++) {
      const y = g + 3.2 + 0.35 + i * 1.8, e = 7 - i * 0.9 + 1.4 - 0.4;
      this.gem(-e, y, cz - 5, 0xff7ac0);
    }
    this.jewel(0, p.top, cz - 5 + 1.2, 'Royal Star', { star: true, beamColor: 0xfff0b0 });
    for (const [x, z] of [[-12, -86], [12, -86], [-14, -100], [14, -100], [-11, -106], [11, -106]])
      cherryTree(this, x, z, g, { scale: 1.4, colors: RED, trunk: 0x3a2a2a });
    for (const x of [-4, 4]) for (const z of [-82, -86]) stoneLantern(this, x, z, g, 1, 0xffc0e0);
    this.temple = { x: 0, z: cz - 5, top: p.top };
  }

  buildOrb() {
    const t = this.temple, oy = 70, oz = t.z - 20;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4c8, fog: false }));
    orb.position.set(0, oy, oz);
    this.add(orb);
    const glows = [[0xffd27a, 30, 0.9], [0xff8ad0, 70, 0.6], [0xffffff, 14, 1]].map(([c, s, o]) => {
      const sp = glowSprite(c, s, o);
      sp.material.fog = false;
      sp.position.copy(orb.position);
      this.add(sp);
      return sp;
    });
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9 + i * 4, 0.25, 8, 64), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff9ad8 : 0xffd27a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      ring.position.copy(orb.position);
      this.add(ring);
      rings.push(ring);
    }
    // Light beam from the orb down to the temple top.
    const from = orb.position.clone(), to = new THREE.Vector3(t.x, t.top + 3, t.z);
    const len = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.lookAt(to);
    beam.rotateX(Math.PI / 2);
    this.add(beam);
    this.onUpdate((dt, time) => {
      rings.forEach((r, i) => { r.rotation.x = time * (0.3 + i * 0.15); r.rotation.y = time * (0.2 - i * 0.1); });
      glows[1].material.opacity = 0.5 + Math.sin(time * 1.5) * 0.15;
    });
  }

  buildDistant() {
    const r = this.rand;
    for (let i = 0; i < 22; i++) {
      const a = r() * Math.PI * 2, d = 70 + r() * 90;
      const x = Math.cos(a) * d, z = -50 + Math.sin(a) * d, y = -4 + r() * 40, rad = 3 + r() * 6;
      if (Math.abs(x) < 45 && z < 50 && z > -135) continue; // keep the play path clear
      floatingRock(this, x, y, z, rad, { solid: false, depth: 2 });
      if (r() < 0.7) cherryTree(this, x + (r() - 0.5) * rad, z + (r() - 0.5) * rad, y, { scale: 0.8 + rad * 0.2, colors: RED, trunk: 0x3a2a2a });
      else {
        const roof = new THREE.Group();
        const post = addOutline(new THREE.Mesh(new THREE.BoxGeometry(rad * 0.6, rad * 0.5, rad * 0.6), toonMaterial(0xb8323a)), 0.05);
        post.position.y = rad * 0.25;
        roof.add(post);
        roof.position.set(x, y, z);
        this.add(roof);
      }
    }
    // The tree helpers add collision; distant rocks are unreachable so that's harmless.
  }
}
