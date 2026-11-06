import * as THREE from 'three';
import { toonMaterial, glowMaterial, addOutline, glowSprite, outlineMaterial, glowTexture } from './toon.js';
import { noise, rng } from './stage.js';

// Reusable scenery pieces for the levels. Each takes the stage `s` so it can add
// meshes and collision. All collision boxes are axis-aligned, so buildings only
// face +x, -x, +z or -z.

const FACES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

// Curved-looking Japanese roof: a shallow wide eave with a steeper top.
export function jpRoof(w, d, h, color, outline = 0.05) {
  const g = new THREE.Group();
  const R = Math.SQRT1_2;
  const lower = new THREE.CylinderGeometry(R * 0.62, R, h * 0.32, 4, 1).rotateY(Math.PI / 4).translate(0, h * 0.16, 0);
  const upper = new THREE.CylinderGeometry(R * 0.06, R * 0.62, h * 0.68, 4, 1).rotateY(Math.PI / 4).translate(0, h * 0.32 + h * 0.34, 0);
  for (const geo of [lower, upper]) {
    const m = addOutline(new THREE.Mesh(geo, toonMaterial(color)), outline);
    m.castShadow = true;
    g.add(m);
  }
  g.scale.set(w, 1, d);
  return g;
}

// Japanese-style house or shop. Front faces `face`. Returns the wall top height.
export function jpHouse(s, x, z, {
  w = 6, d = 6, h = 4, ground = 0, face = '+x', wall = 0xf3efe6, trim = 0x8a5a33, roof = 0x5a5f7a,
  roofH = 1.6, awning = null, awningStripe = 0xffffff, upper = false, lanterns = null, door = 0x6b4a2e, noren = null, sign = null, window = 0xf6e9c8,
} = {}) {
  const [fx, fz] = FACES[face];
  const top = ground + h;
  s.block(x, top, z, w, h + 0.5, d, wall);
  // Dark corner posts and a beam along the top.
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), toonMaterial(trim));
    post.position.set(x + cx * (w / 2 - 0.1), ground + h / 2, z + cz * (d / 2 - 0.1));
    s.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.35, d + 0.1), toonMaterial(trim));
  beam.position.set(x, top - 0.17, z);
  s.add(beam);

  const r = jpRoof(w + 1.4, d + 1.4, roofH, roof);
  r.position.set(x, top, z);
  s.add(r);
  s.solidBox(x, top + roofH * 0.45, z, w * 0.55, roofH * 0.45, d * 0.55);

  // Things on the front face.
  const half = fx ? w / 2 : d / 2, lat = fx ? d / 2 : w / 2;
  const fcx = x + fx * half, fcz = z + fz * half, rot = Math.atan2(fx, fz);
  const onFront = (along, y, mesh, out = 0.06) => {
    mesh.position.set(fcx + fx * out + -fz * along, y, fcz + fz * out + fx * along);
    mesh.rotation.y = rot;
    s.add(mesh);
    return mesh;
  };
  onFront(0, ground + 1.1, new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.12), toonMaterial(door)));
  if (noren) onFront(0, ground + 2.0, new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 0.06), toonMaterial(noren)), 0.15);
  const rows = upper ? [ground + 1.6, ground + 3.4] : [ground + 1.6];
  for (const wy of rows) for (const side of upper && wy > ground + 2 ? [-1, 0, 1] : [-1, 1]) {
    if (lat < 2.2) break;
    const win = onFront(side * lat * 0.55, wy, new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.1), glowMaterial(window, upper ? 0.7 : 0.25)));
    win.add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.14), toonMaterial(trim)));
    win.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.14), toonMaterial(trim)));
  }
  if (sign) onFront(0, top - 0.75, new THREE.Mesh(new THREE.BoxGeometry(Math.min(3.2, lat * 1.4), 0.8, 0.12), toonMaterial(sign)), 0.12);
  if (awning) {
    // Striped awning you can stand on (a handy step up to the roof).
    const aw = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.5), toonMaterial(i % 2 ? awningStripe : awning));
      strip.position.set(-1.25 + i * 0.5, 0, 0.75);
      aw.add(strip);
    }
    onFront(0, ground + 2.6, aw, 0);
    const ax = fcx + fx * 0.75, az = fcz + fz * 0.75;
    s.solidBox(ax, ground + 2.7, az, fx ? 1.5 : 3, 0.3, fx ? 3 : 1.5);
  }
  if (lanterns) {
    for (let i = -1; i <= 1; i++) {
      const lx = fcx + fx * 0.5 + -fz * i * lat * 0.6, lz = fcz + fz * 0.5 + fx * i * lat * 0.6;
      paperLantern(s, lx, top - 0.6, lz, lanterns, 0.8);
    }
  }
  return top;
}

export function paperLantern(s, x, y, z, color = 0xe0303a, scale = 1, halo = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), glowMaterial(color, 0.7));
  body.scale.y = 1.3;
  const cap = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10);
  const c1 = new THREE.Mesh(cap, toonMaterial(0x222222)); c1.position.y = 0.45;
  const c2 = new THREE.Mesh(cap, toonMaterial(0x222222)); c2.position.y = -0.45;
  g.add(body, c1, c2);
  if (halo) g.add(glowSprite(color, 2.4, 0.5));
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  s.add(g);
  return g;
}

// A sagging string with lanterns hanging from it.
export function lanternString(s, a, b, n, color = 0xe0303a) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 0.6, 0)));
  }
  s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 })));
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    paperLantern(s, p.x, p.y - Math.sin(t * Math.PI) * 0.6 - 0.45, p.z, color, 0.7, i % 2 === 0);
  }
}

export function lampPost(s, x, z, ground, h = 4.2, light = 0xfff0b0) {
  s.pillar(x, z, 0.1, ground, ground + h, 0x2b2b30, null, { segments: 8, blockCamera: false });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.55), toonMaterial(0x2b2b30));
  head.position.set(x, ground + h + 0.3, z);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), glowMaterial(light, 1));
  lamp.position.copy(head.position);
  const capm = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 4).rotateY(Math.PI / 4), toonMaterial(0x2b2b30));
  capm.position.set(x, ground + h + 0.85, z);
  const halo = glowSprite(light, 2.6, 0.55);
  halo.position.copy(head.position);
  s.add(lamp, capm, halo);
  return head.position;
}

export function stoneLantern(s, x, z, ground, scale = 1, light = 0xffd27a) {
  const g = new THREE.Group();
  const stone = toonMaterial(0x9a96a0);
  const parts = [
    [new THREE.CylinderGeometry(0.45, 0.55, 0.3, 8), 0.15],
    [new THREE.CylinderGeometry(0.16, 0.2, 0.9, 8), 0.75],
    [new THREE.BoxGeometry(0.7, 0.15, 0.7), 1.25],
    [new THREE.ConeGeometry(0.62, 0.45, 4).rotateY(Math.PI / 4), 1.8],
  ];
  for (const [geo, y] of parts) { const m = addOutline(new THREE.Mesh(geo, stone), 0.03); m.position.y = y; m.castShadow = true; g.add(m); }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45), glowMaterial(light, 0.9));
  lamp.position.y = 1.52;
  g.add(lamp);
  g.position.set(x, ground, z);
  g.scale.setScalar(scale);
  s.add(g);
  s.solidCyl(x, z, 0.5 * scale, ground, ground + 2 * scale);
}

// Red shrine gate. Its top beam is walkable. axis = 'x' means the beam runs along X.
export function torii(s, x, z, ground, { span = 6, h = 6, color = 0xe03a2a, axis = 'x', top = 0x2a2226 } = {}) {
  const ax = axis === 'x' ? 1 : 0, az = 1 - ax;
  for (const side of [-1, 1]) {
    const px = x + ax * side * span / 2, pz = z + az * side * span / 2;
    s.pillar(px, pz, 0.32, ground, ground + h, color, null, { segments: 12 });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.8, 12), toonMaterial(0x222222));
    foot.position.set(px, ground + 0.4, pz);
    s.add(foot);
  }
  const L = span + 2.4;
  s.block(x, ground + h + 0.7, z, ax ? L : 0.8, 0.45, az ? L : 0.8, top);
  s.block(x, ground + h + 0.25, z, ax ? L - 0.4 : 0.6, 0.25, az ? L - 0.4 : 0.6, color, { outline: 0.03 });
  s.block(x, ground + h - 1.1, z, ax ? span + 0.9 : 0.4, 0.35, az ? span + 0.9 : 0.4, color, { outline: 0.03 });
}

export function cherryTree(s, x, z, ground, { scale = 1, colors = [0xffb7d0, 0xff9cc2, 0xffd1e3], trunk = 0x5a3a2a, seed = 1 } = {}) {
  const r = rng(Math.floor(x * 73 + z * 31 + seed));
  const g = new THREE.Group();
  const t = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 3.2, 8).translate(0, 1.6, 0), toonMaterial(trunk)), 0.04);
  t.rotation.z = (r() - 0.5) * 0.3;
  t.castShadow = true;
  g.add(t);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.8, 6).translate(0, 0.9, 0), toonMaterial(trunk));
    b.position.y = 2.4;
    b.rotation.z = (i ? 1 : -1) * (0.6 + r() * 0.3);
    b.rotation.y = r() * Math.PI;
    g.add(b);
  }
  const n = 6 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 0.6 + r() * 1.4;
    const blob = addOutline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.6, 1), toonMaterial(colors[i % colors.length])), 0.04);
    blob.position.set(Math.cos(a) * d, 3.4 + r() * 1.3, Math.sin(a) * d);
    blob.scale.y = 0.75;
    blob.castShadow = true;
    g.add(blob);
  }
  g.position.set(x, ground, z);
  g.scale.setScalar(scale);
  s.add(g);
  s.solidCyl(x, z, 0.4 * scale, ground - 1, ground + 3 * scale);
  return g;
}

// Open wooden pavilion with a walkable roof.
export function pavilion(s, x, z, ground, { w = 4, d = 4, h = 3.2, post = 0x6b4a2e, roof = 0x4a3a2a, lanterns = null } = {}) {
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    s.pillar(x + cx * w / 2, z + cz * d / 2, 0.18, ground, ground + h, post, null, { segments: 8, blockCamera: false });
  const r = jpRoof(w + 1.6, d + 1.6, 1.5, roof);
  r.position.set(x, ground + h, z);
  s.add(r);
  s.solidBox(x, ground + h + 0.35, z, w + 1.4, 0.45, d + 1.4);
  s.solidBox(x, ground + h + 1.0, z, w * 0.5, 0.6, d * 0.5);
  if (lanterns) for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    paperLantern(s, x + cx * (w / 2 + 0.3), ground + h - 0.5, z + cz * (d / 2 + 0.3), lanterns, 0.7);
}

// Climbable tiered pagoda. Each roof eave is a ledge; jump from eave to eave to the top.
export function pagoda(s, x, z, ground, {
  tiers = 5, half = 4.5, shrink = 0.8, tierH = 1.6, overhang = 1.3, firstH = 2.8,
  wall = 0x7a4a2a, roof = 0x3d4a48, trim = 0xe0b040, lanterns = null, steps = '+z',
} = {}) {
  let y = ground, hb = half;
  for (let i = 0; i < tiers; i++) {
    hb = half - i * shrink;
    const bodyH = i === 0 ? firstH : tierH - 0.35;
    s.block(x, y + bodyH, z, hb * 2, bodyH + 0.05, hb * 2, wall);
    // Rails / balcony stripe.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(hb * 2 + 0.1, 0.18, hb * 2 + 0.1), toonMaterial(trim));
    stripe.position.set(x, y + bodyH * 0.35, z);
    s.add(stripe);
    y += bodyH;
    const e = hb + overhang;
    const R = Math.SQRT2;
    const eave = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(hb * R, e * R, 0.45, 4, 1).rotateY(Math.PI / 4), toonMaterial(roof)), 0.05);
    eave.position.set(x, y + 0.2, z);
    eave.castShadow = true;
    s.add(eave);
    s.solidBox(x, y + 0.35, z, e * 2, 0.4, e * 2);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), toonMaterial(trim));
      tip.position.set(x + cx * e, y + 0.3, z + cz * e);
      s.add(tip);
      if (lanterns && i < tiers - 1) paperLantern(s, x + cx * (e - 0.2), y - 0.5, z + cz * (e - 0.2), lanterns, 0.55, false);
    }
    y += 0.35;
  }
  // Golden spire on top.
  const spire = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 3.4, 8), toonMaterial(trim)), 0.03);
  spire.position.set(x, y + 1.7, z);
  s.add(spire);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32 - i * 0.03, 0.06, 6, 12), toonMaterial(trim));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.6 + i * 0.45, z);
    s.add(ring);
  }
  s.solidCyl(x, z, 0.3, y, y + 3.4);
  // Crates to reach the first eave.
  const [fx, fz] = FACES[steps], e0 = half + overhang;
  s.block(x + fx * (e0 + 0.9), ground + 2.2, z + fz * (e0 + 0.9), 1.4, 2.2, 1.4, 0xa0703f);
  s.block(x + fx * (e0 + 2.4) + fz * 1.2, ground + 1.1, z + fz * (e0 + 2.4) + fx * 1.2, 1.4, 1.1, 1.4, 0xa0703f);
  return { top: y, half: hb + overhang };
}

// Floating rock island with jagged underside.
export function floatingRock(s, x, y, z, r, { top = 0xeee8f5, rock = 0x5a4a6a, depth = 2.2, solid = true } = {}) {
  const g = new THREE.Group();
  const t = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, 0.5, 18), toonMaterial(top)), 0.04);
  t.position.y = -0.25;
  t.receiveShadow = t.castShadow = true;
  let geo = new THREE.ConeGeometry(r * 0.95, r * depth, 9, 4).rotateX(Math.PI);
  geo = geo.toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    if (vy > r * depth * 0.45) continue; // keep the top ring flat
    const n = noise(vx * 1.7 + x, vz * 1.7 + vy + z) - 0.5;
    p.setXYZ(i, vx * (1 + n * 0.5), vy + n * r * 0.3, vz * (1 + n * 0.5));
  }
  geo.computeVertexNormals();
  const k = addOutline(new THREE.Mesh(geo, toonMaterial(rock)), 0.04);
  k.position.y = -0.5 - r * depth / 2;
  k.castShadow = true;
  g.add(t, k);
  g.position.set(x, y, z);
  s.add(g);
  if (solid) s.solidCyl(x, z, r, y - 0.6, y);
  return g;
}

// Arched bridge along the Z axis, made of small walkable steps.
export function archBridge(s, x, z0, z1, base, { width = 3, rise = 1.6, color = 0xb8322a, deck = 0x6b4a2e } = {}) {
  const n = 14, len = (z0 - z1) / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, z = z0 - len * (i + 0.5);
    const top = base + 0.25 + Math.sin(t * Math.PI) * rise;
    s.block(x, top, z, width, 0.4, len + 0.04, deck, { outline: 0.02, blockCamera: false });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), toonMaterial(color));
      post.position.set(x + side * (width / 2 - 0.08), top + 0.5, z);
      s.add(post);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len + 0.05), toonMaterial(color));
      rail.position.set(x + side * (width / 2 - 0.08), top + 0.95, z);
      s.add(rail);
    }
  }
}

export function standingStone(s, x, z, ground, h, r, color = 0x2e2a30) {
  const m = addOutline(new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), toonMaterial(color)), 0.04);
  m.scale.set(r, h / 2, r * 0.8);
  m.position.set(x, ground + h / 2 - 0.2, z);
  m.rotation.set((noise(x, z) - 0.5) * 0.2, noise(z, x) * 3, (noise(x + 3, z) - 0.5) * 0.2);
  m.castShadow = true;
  s.add(m);
  s.cameraBlockers.push(m);
  s.solidCyl(x, z, r * 0.75, ground - 1, ground + h * 0.92);
}

// Pole with a cloth banner that sways in the wind.
export function banner(s, x, z, ground, color = 0xb8222a, h = 4.5) {
  s.pillar(x, z, 0.08, ground, ground + h, 0x2a2226, null, { segments: 6, blockCamera: false });
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.9).translate(0, -1.1, 0.5), toonMaterial(color));
  cloth.position.set(x, ground + h - 0.2, z);
  s.add(cloth);
  const ph = x + z;
  s.onUpdate((dt, t) => { cloth.rotation.y = Math.sin(t * 1.7 + ph) * 0.25; });
}

// Bamboo stalks (instanced). spots: [{ x, z, y, h }]
export function bambooGrove(s, spots) {
  const geo = new THREE.CylinderGeometry(0.13, 0.16, 1, 7, 64).translate(0, 0.5, 0);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const light = new THREE.Color(0x6fbf52), top = new THREE.Color(0x9ad86e), node = new THREE.Color(0x2f5e2a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), row = Math.round(y * 64);
    if (row % 8 === 0) c.copy(node); else c.copy(light).lerp(top, y);
    c.toArray(cols, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mats = [], leafMats = [], leafCols = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const r = rng(spots.length);
  const lc1 = new THREE.Color(0x2f7a3a), lc2 = new THREE.Color(0x4f9e42);
  for (const b of spots) {
    e.set((r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08);
    q.setFromEuler(e);
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y - 0.3, b.z), q, new THREE.Vector3(1, b.h, 1)));
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2, hy = b.y + b.h * (0.62 + k * 0.15);
      m.compose(new THREE.Vector3(b.x + Math.cos(a) * 0.7, hy, b.z + Math.sin(a) * 0.7),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0.3)), new THREE.Vector3(1.3, 0.35, 0.8));
      leafMats.push(m.clone());
      leafCols.push(lc1.clone().lerp(lc2, r()));
    }
    s.solidCyl(b.x, b.z, 0.2, b.y - 1, b.y + b.h);
  }
  s.instanced(geo, toonMaterial(0xffffff, { vertexColors: true }), mats, { outline: 0.03 });
  s.instanced(new THREE.IcosahedronGeometry(1, 0), toonMaterial(0xffffff), leafMats, { colors: leafCols, shadow: false });
}

// Big distant volcano with glowing lava streaks and a smoke plume. Purely scenery.
export function volcano(s, x, z, r, h) {
  let geo = new THREE.ConeGeometry(r, h, 64, 16, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    const t = (vy + h / 2) / h;                      // 0 bottom .. 1 top
    const a = Math.atan2(vz, vx);
    const crater = t > 0.92 ? 0.82 : 1;               // flatten the tip into a crater
    const n = 1 + (noise(a * 4, t * 6) - 0.5) * 0.35 * (1 - t * 0.5);
    pos.setXYZ(i, vx * n * crater + (crater < 1 ? vx * 0.0 : 0), Math.min(vy, h * 0.42), vz * n * crater);
  }
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p2 = geo.attributes.position, n2 = geo.attributes.normal, cols = new Float32Array(p2.count * 3);
  const L = new THREE.Vector3(0.4, 0.6, 0.7).normalize(), c = new THREE.Color(), rock = new THREE.Color(0x7a6670), lava = new THREE.Color(0xff8a2a), hot = new THREE.Color(0xffd26a);
  for (let i = 0; i < p2.count; i++) {
    const vx = p2.getX(i), vy = p2.getY(i), vz = p2.getZ(i);
    const t = (vy + h / 2) / h, a = Math.atan2(vz, vx);
    const lit = Math.max(0, n2.getX(i) * L.x + n2.getY(i) * L.y + n2.getZ(i) * L.z);
    const band = lit > 0.6 ? 1 : lit > 0.25 ? 0.72 : 0.5;
    c.copy(rock).multiplyScalar(band);
    const streak = Math.abs(Math.sin(a * 5 + noise(a * 3, t * 4) * 3));
    if (t > 0.35 && streak > 0.93 - (t - 0.35) * 0.3) c.copy(t > 0.8 ? hot : lava);
    c.toArray(cols, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.position.set(x, h / 2 - 2, z);
  s.add(m);
  const top = h * 0.92 - 2;
  const glow = glowSprite(0xff7a2a, r * 0.9, 0.9);
  glow.material.fog = false;
  glow.position.set(x, top, z);
  s.add(glow);
  // Smoke plume: soft gray puffs that rise, grow and fade, then start again.
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5a4a50, transparent: true, depthWrite: false, fog: false }));
    s.add(sp);
    puffs.push({ sp, t: i / 26 });
  }
  s.onUpdate((dt) => {
    for (const p of puffs) {
      p.t = (p.t + dt * 0.045) % 1;
      const k = p.t;
      p.sp.position.set(x + Math.sin(k * 3 + p.t * 20) * 6 + k * 30, top + k * h * 0.9, z + Math.cos(k * 5) * 4);
      const size = r * (0.25 + k * 0.9);
      p.sp.scale.set(size, size, 1);
      p.sp.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.9;
      p.sp.material.color.setHex(k < 0.15 ? 0xff8a3a : 0x5a4a50);
    }
  });
}

// Glowing portal ring that leads to a level. Stands upright, facing `facing` (radians).
export function portal(s, x, z, ground, { id, name, color, done = false, facing = 0 }) {
  s.pillar(x, z, 2.2, ground - 1, ground + 0.3, 0xbdb3c9, 0x9a90a8, { blockCamera: false });
  const g = new THREE.Group();
  const ring = addOutline(new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.24, 10, 40), glowMaterial(done ? 0xffd84a : color, 0.6)), 0.05);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const swirl = glowSprite(color, 3.6, 0.8);
  g.add(ring, disc, swirl);
  g.position.set(x, ground + 2.2, z);
  g.rotation.y = facing;
  s.add(g);

  // Floating name label.
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 10; ctx.strokeStyle = '#3a2a6b';
  const text = (done ? '★ ' : '') + name;
  ctx.strokeText(text, 256, 80);
  ctx.fillStyle = done ? '#ffd84a' : '#ffffff';
  ctx.fillText(text, 256, 80);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  label.scale.set(5, 1.25, 1);
  label.position.set(x, ground + 4.9, z);
  s.add(label);

  s.onUpdate((dt, t) => {
    disc.material.opacity = 0.45 + Math.sin(t * 3) * 0.15;
    swirl.material.rotation = t;
    ring.rotation.z = t * 0.4;
  });
  const p = { id, name, x, z, y: ground, facing };
  s.portals.push(p);
  return p;
}

export { FACES };
// Silence "unused" warnings for helpers some levels don't use.
void outlineMaterial;
