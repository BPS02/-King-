import * as THREE from 'three';
import { Stage, fbm, noise, smooth } from '../stage.js';
import { toonMaterial, glowMaterial, addOutline, glowSprite } from '../toon.js';
import { jpHouse, jpRoof, lampPost, lanternString, torii, cherryTree, stoneLantern, paperLantern } from '../deco.js';

// Level 1 - Sakura Village (sunny shrine town).
// Run up the lantern-lit shopping street (or across the rooftops), climb the stone stairs
// through the red torii gate, then hop up the floating lanterns above the shrine to the Royal Star.

function height(x, z) {
  const ax = Math.abs(x);
  let h = smooth(16, 34, ax) * (3 + fbm(x * 0.05, z * 0.05) * 8);
  const plateau = smooth(-71.5, -72.8, z) * 8 * (1 - smooth(30, 40, ax));
  h = Math.max(h, plateau);
  h += smooth(-100, -116, z) * 10 + smooth(18, 32, z) * 6;
  return h;
}

export class SakuraLevel extends Stage {
  constructor(scene) {
    super(scene, { seed: 11 });
    this.title = 'Sakura Village';
    this.bounds = { x: 0, z: -45, r: 72 };
    this.map = { x: 0, z: -45, size: 150, bg: '#8fd46a', platform: 'rgba(255,240,245,0.9)' };
    this.environment({
      skyTop: 0x2f7fe8, skyMid: 0x8cc8ff, skyBottom: 0xd8efff,
      fog: [0xd8efff, 70, 200],
      hemi: [0xffffff, 0x9a8a7a, 1.3],
      sun: { color: 0xfff0d8, intensity: 2.3, dir: [0.6, 1, 0.4] },
    });

    const tileA = new THREE.Color(0xd2cfd8), tileB = new THREE.Color(0xbcb8c6), grass = new THREE.Color(0x8fd46a), grass2 = new THREE.Color(0x6fbf5a), petal = new THREE.Color(0xf7c9d8);
    this.terrain(260, 130, height, (x, y, z, ny, c) => {
      const street = Math.abs(x) < 6 && z > -58 && z < 16;
      const plaza = Math.abs(x) < 11 && z < -72.5 && z > -100 && y > 7.5;
      if (street || plaza) c.copy(((Math.floor(x / 1.4) + Math.floor(z / 1.4)) & 1) ? tileA : tileB);
      else if (ny < 0.7) c.setHex(0xa08a7a);
      else if (noise(x * 0.3, z * 0.3) > 0.72) c.copy(petal);
      else c.copy(grass).lerp(grass2, noise(x * 0.1, z * 0.1));
    });
    this.mapColor = (h) => (h > 7.5 ? [200, 196, 210] : [143 - h * 3, 212 - h * 3, 106 - h * 2]);

    this.buildStreet();
    this.buildStairs();
    this.buildShrine();
    this.buildTrees();
    this.particles({ count: 380, box: { x0: -26, x1: 26, y0: 0, y1: 16, z0: -105, z1: 16 }, color: 0xffb3cf, size: 0.17, mode: 'fall', speed: 0.9, additive: false, opacity: 0.95 });

    this.spawn.set(0, 0, 10);
  }

  buildStreet() {
    const walls = [0xf2a7b5, 0xf3efe6, 0xbfe3c0, 0xc9c0e6, 0xf6d7a7];
    const roofs = [0x5a5f7a, 0xb5814a, 0x4a5a6e];
    const right = [[2, 4.0], [-9, 5.2], [-20, 4.2], [-31, 5.4], [-42, 4.4]];
    const left = [[0, 4.4], [-11, 5.6], [-22, 4.6], [-33, 5.2], [-44, 4.0]];
    const make = (side, list) => list.forEach(([z, h], i) => {
      const top = jpHouse(this, side * 9, z, {
        w: 6, d: 8, h, face: side > 0 ? '-x' : '+x',
        wall: walls[(i + (side > 0 ? 0 : 2)) % walls.length], roof: roofs[i % roofs.length], trim: 0x8a5a33,
        awning: i % 2 === 0 ? 0xf2c94c : null, lanterns: i % 2 ? 0xe0303a : null, sign: 0xf6e7c8,
      });
      this.gem(side * 9, top + 0.72, z);
    });
    make(1, right);
    make(-1, left);

    for (const z of [4, -7, -18, -29, -40, -51]) {
      const a = lampPost(this, -4.6, z, 0), b = lampPost(this, 4.6, z, 0);
      lanternString(this, new THREE.Vector3(a.x, a.y + 0.6, a.z), new THREE.Vector3(b.x, b.y + 0.6, b.z), 4);
    }
    for (let z = 4; z > -54; z -= 4) this.gem(Math.sin(z * 0.3) * 2, 0, z);
    // A shrine bell tower and a stone wash basin for a bit of life in the street.
    stoneLantern(this, -4.5, -55, 0, 1.2);
    stoneLantern(this, 4.5, -55, 0, 1.2);
  }

  buildStairs() {
    torii(this, 0, -56, 0, { span: 7, h: 6.5, color: 0xe8432f });
    for (let i = 1; i <= 16; i++) {
      const z = -57.5 - (i - 1);
      this.block(0, i * 0.5, z, 6, i * 0.5 + 0.6, 1.02, i % 2 ? 0xa9a6b2 : 0x9d9aa8, { outline: 0.02 });
      if (i % 4 === 0) this.gem(0, i * 0.5, z);
    }
    // Red railings along both sides.
    const len = Math.hypot(16, 8), ang = Math.atan2(8, 16);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, len), toonMaterial(0xd8342a));
      rail.position.set(side * 3.25, 5, -65);
      rail.rotation.x = ang;
      this.add(rail);
      for (let i = 0; i <= 8; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1, 0.14), toonMaterial(0xd8342a));
        post.position.set(side * 3.25, i + 0.5 + 0.35, -57 - i * 2);
        this.add(post);
      }
    }
  }

  buildShrine() {
    const cz = -88, g = 8, wall = 0xf4ede4, red = 0xd8342a, roof = 0x3d4250;
    stoneLantern(this, -4.5, -77, g); stoneLantern(this, 4.5, -77, g);
    stoneLantern(this, -4.5, -81, g); stoneLantern(this, 4.5, -81, g);

    this.block(0, g + 5, cz, 12, 5.5, 8, wall);
    for (const x of [-6, -3, 3, 6]) {
      const col = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5, 10), toonMaterial(red)), 0.03);
      col.position.set(x, g + 2.5, cz + 4.05);
      this.add(col);
    }
    const doors = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 0.12), toonMaterial(red));
    doors.position.set(0, g + 1.8, cz + 4.04);
    this.add(doors);
    const band = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.5, 8.2), toonMaterial(red));
    band.position.set(0, g + 4.75, cz);
    this.add(band);
    const r1 = jpRoof(14.5, 10.5, 1.0, roof);
    r1.position.set(0, g + 5, cz);
    this.add(r1);
    this.solidBox(0, g + 5.4, cz, 14, 0.5, 10);

    this.block(0, g + 8.4, cz, 8, 3.05, 6, wall);
    const band2 = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.4, 6.2), toonMaterial(red));
    band2.position.set(0, g + 8.2, cz);
    this.add(band2);
    const r2 = jpRoof(9.5, 7.5, 2.6, roof);
    r2.position.set(0, g + 8.4, cz);
    this.add(r2);
    this.solidBox(0, g + 9.6, cz, 4, 1.2, 3);
    for (const x of [-4.5, 4.5]) paperLantern(this, x, g + 3.8, cz + 4.7, 0xe0303a, 1.3);

    // Floating lanterns spiral up around the shrine to the golden platform.
    const steps = [
      [10, -80, 9.6], [10.5, -83.2, 11.2], [9.4, -86.4, 12.8],
      ...[0, 1, 2, 3].map((k) => { const a = -0.2 - k * 0.55; return [Math.cos(a) * 6, cz + Math.sin(a) * 6, 15 + k * 1.4]; }),
    ];
    for (const [x, z, y] of steps) {
      this.floatingLantern(x, y, z, 0.9, 0xe8432f);
      this.gem(x, y, z, 0xffd84a);
    }
    this.floatingLantern(0, 20.4, cz - 2.6, 1.5, 0xffc93a);
    this.jewel(0, 20.4, cz - 2.6, 'Royal Star', { star: true });
  }

  floatingLantern(x, y, z, r, color) {
    const g = new THREE.Group();
    const body = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.5, 18), glowMaterial(color, 0.55)), 0.04);
    body.position.y = -0.25;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 24), toonMaterial(0x222222));
    rim.rotation.x = Math.PI / 2;
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 6), toonMaterial(0xffd84a));
    tassel.position.y = -0.8;
    tassel.rotation.x = Math.PI;
    g.add(body, rim, tassel, glowSprite(color, r * 3.2, 0.4));
    g.position.set(x, y, z);
    this.add(g);
    const ph = x * 3 + z;
    this.onUpdate((dt, t) => { g.rotation.y = Math.sin(t + ph) * 0.2; });
    this.solidCyl(x, z, r, y - 0.5, y);
  }

  buildTrees() {
    const pinks = [0xffb7d0, 0xff9cc2, 0xffd1e3];
    const r = this.rand;
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? 1 : -1, x = side * (15 + r() * 8), z = 12 - r() * 70;
      cherryTree(this, x, z, this.terrainHeight(x, z), { scale: 1.1 + r() * 0.5, colors: pinks });
    }
    for (const [x, z] of [[-6, -62], [6, -66], [-6.5, -70], [6.5, -60]]) cherryTree(this, x, z, this.terrainHeight(x, z), { scale: 1.2, colors: pinks });
    for (const [x, z] of [[-12, -80], [13, -92], [-13, -95], [9, -100], [-8, -102], [15, -78]]) cherryTree(this, x, z, 8, { scale: 1.5, colors: pinks });
  }
}
