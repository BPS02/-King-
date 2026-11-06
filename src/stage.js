import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { toonMaterial, addOutline, glowMaterial, glowTexture } from './toon.js';
import { Q, pbr, textureSetFor, prepareMeshes, mergeStatic, TILE } from './graphics.js';

// ---------- Math helpers shared by all levels ----------
export function hash(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { s += amp * noise(x * f, z * f); f *= 2; amp *= 0.5; }
  return s / 0.9375;
}
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A Stage is one playable place (the kingdom hub or a level).
// It owns everything it builds (inside this.root) so it can be thrown away when you leave.
//
// Collision shapes the player understands:
//   box: { minX, maxX, minZ, maxZ, top, bottom }
//   cyl: { x, z, r, top, bottom }
//   terrain: terrainHeight(x, z)
export class Stage {
  constructor(scene, { seed = 1 } = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.platforms = [];
    this.gems = [];
    this.jewels = [];
    this.movers = [];
    this.cameraBlockers = [];
    this.portals = [];
    this.updaters = [];
    this.time = 0;
    this.rand = rng(seed);
    this.hazardY = -30;          // fall below this and you respawn
    this.bounds = null;          // { x, z, r } keeps the player inside
    this.maxSlope = 1.1;         // ground steeper than this blocks you (cliffs)
    this.spawn = new THREE.Vector3();
    this.spawnFacing = Math.PI;  // facing -Z
    this.heights = null;
    this.map = { x: 0, z: 0, size: 200, bg: '#1d1a2e', platform: 'rgba(255,255,255,0.55)' };
    this.title = '';
    this.lightSpots = [];        // lantern positions; the nearest few get real lights
    this.finalizers = [];        // run once after the level is built (batching, UVs...)
    this.envName = 'day';        // HDR sky used for reflections / ambient light
    this.envIntensity = 1;
    this.exposure = 1;
    this.night = false;          // lamps and lanterns glow (and cast light) only at night
  }

  add(...objs) { this.root.add(...objs); return objs[0]; }
  onUpdate(fn) { this.updaters.push(fn); }
  onFinalize(fn) { this.finalizers.push(fn); }

  // A glowing light source (lantern, lamp, lava...). Only the nearest few become real lights.
  lightSpot(x, y, z, color = 0xffa04a, intensity = 6, range = 12) {
    this.lightSpots.push({ pos: new THREE.Vector3(x, y, z), color, intensity, range });
  }

  // Called once after building: batch instanced details and give textured meshes real-world UVs.
  finalize() {
    for (const fn of this.finalizers) fn();
    prepareMeshes(this.root);
    // Everything that moves, gets picked up, or blocks the camera stays a separate object.
    const keep = new Set([...this.cameraBlockers, ...this.gems, ...this.jewels, ...this.movers.map((m) => m.mesh)]);
    if (this.terrainMesh) keep.add(this.terrainMesh);
    if (this.sky) keep.add(this.sky);
    this.mergeInfo = mergeStatic(this.root, keep);
    this.root.traverse((o) => {
      // Glows, particles, lines and see-through things go on layer 1, which the
      // ambient-occlusion pass skips (it would draw them as solid shapes).
      if (o.isSprite || o.isPoints || o.isLine || (o.material && !Array.isArray(o.material) && o.material.transparent)) o.layers.set(1);
      if (!o.isMesh) return;
      if (!Q.shadows) { o.castShadow = false; o.receiveShadow = false; }
    });
  }

  // ---------- Sky, fog and lights ----------
  environment({ skyTop, skyMid, skyBottom, fog, hemi, sun, stars = 0, physicalSky = null, env = 'day', envIntensity = 1, exposure = 1 }) {
    this.envName = env; this.envIntensity = envIntensity; this.exposure = exposure;
    this.sunDir = new THREE.Vector3(...sun.dir).normalize();
    if (physicalSky) {
      // Physically based daylight sky (scattering), lined up with the sun light.
      const sky = new Sky();
      sky.scale.setScalar(600);
      const u = sky.material.uniforms;
      u.turbidity.value = physicalSky.turbidity ?? 3;
      u.rayleigh.value = physicalSky.rayleigh ?? 1.2;
      u.mieCoefficient.value = physicalSky.mie ?? 0.004;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(this.sunDir);
      // The raw sun disc is thousands of times brighter than the scenery, and bloom smeared it over
      // the whole screen (facing the sun turned everything white). Cap the sky's brightness so the sun
      // is a crisp bright spot with only a small glow.
      sky.material.fragmentShader = sky.material.fragmentShader.replace(
        'vec3 texColor = ( Lin + L0 ) * 0.04 + sundiscColor',
        'vec3 skyGlow = ( Lin + L0 ) * 0.04; skyGlow *= min( 1.0, 1.4 / max( 1e-4, max( skyGlow.r, max( skyGlow.g, skyGlow.b ) ) ) );\n' +
        '\t\t\tvec3 texColor = skyGlow + min( sundiscColor, vec3( 6.0 ) )');
      if (!sky.material.fragmentShader.includes('skyGlow')) console.warn('Sky shader patch did not apply');
      sky.frustumCulled = false;
      sky.layers.set(1);
      this.sky = this.add(sky);
      this.scene.background = new THREE.Color(skyBottom);
      this.scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
      this.addLights(hemi, sun);
      return;
    }
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(skyTop) },
        mid: { value: new THREE.Color(skyMid ?? skyBottom) },
        bottom: { value: new THREE.Color(skyBottom) },
      },
      vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vDir;',
        'void main(){',
        '  float h = normalize(vDir).y;',
        '  vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bottom, mid, smoothstep(-0.15, 0.12, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(550, 32, 16), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.sky.layers.set(1);
    this.add(this.sky);

    if (stars) {
      const pts = new Float32Array(stars * 3);
      const r = rng(7);
      for (let i = 0; i < stars; i++) {
        const a = r() * Math.PI * 2, y = 0.08 + r() * 0.92, rr = Math.sqrt(1 - y * y);
        pts.set([Math.cos(a) * rr * 500, y * 500, Math.sin(a) * rr * 500], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
      p.layers.set(1);
      this.sky.add(p);
    }

    this.scene.background = new THREE.Color(skyBottom);
    this.scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);

    this.addLights(hemi, sun);
  }

  addLights(hemi, sun) {
    // The HDR environment now provides most of the ambient light, so the hemisphere fill is softer.
    this.add(new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2] * 0.45));
    const s = new THREE.DirectionalLight(sun.color, sun.intensity * 1.3);
    s.castShadow = Q.shadows;
    s.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    s.shadow.radius = Q.shadowRadius;
    const sc = s.shadow.camera, ext = Q.shadowSize >= 4096 ? 32 : 25;
    sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.near = 1; sc.far = 160;
    s.shadow.bias = -0.0003;
    s.shadow.normalBias = 0.03;
    s.shadow.camera.layers.enableAll();   // foliage cards (layer 2) still cast shadows
    this.sun = s;
    this.add(s, s.target);
  }

  // ---------- Terrain ----------
  // splat: { layers: [keyA, keyB, keyC], weights: (x, y, z, normalY) => [a, b, c], tints: [colorA, colorB, colorC] }
  // blends three real PBR textures across the ground. Without splat, colorFn paints vertex colors.
  terrain(size, n, heightFn, colorFn, splat = null) {
    const W = n + 1, half = size / 2, step = size / n;
    this.tSize = size; this.tN = n;
    this.heights = new Float32Array(W * W);
    for (let gz = 0; gz < W; gz++) for (let gx = 0; gx < W; gx++)
      this.heights[gz * W + gx] = heightFn(-half + gx * step, -half + gz * step);

    const geo = new THREE.PlaneGeometry(size, size, n, n);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = Math.round((pos.getX(i) + half) / step), gz = Math.round((pos.getZ(i) + half) / step);
      pos.setY(i, this.heights[gz * W + gx]);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), c);
      c.toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    let material;
    if (splat) {
      const w = new Float32Array(pos.count * 3), uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        w.set(splat.weights(x, y, z, nrm.getY(i)), i * 3);
        uv[i * 2] = x; uv[i * 2 + 1] = -z;      // texture coordinates in meters
      }
      geo.setAttribute('splat', new THREE.BufferAttribute(w, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      material = splatMaterial(splat.layers, splat.tiles, splat.tints, splat.rough);
    } else {
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.terrainMesh = this.add(mesh);
    return mesh;
  }

  terrainHeight(x, z) {
    if (!this.heights) return -Infinity;
    const n = this.tN, W = n + 1, half = this.tSize / 2, step = this.tSize / n;
    const fx = Math.min(n - 1e-4, Math.max(0, (x + half) / step));
    const fz = Math.min(n - 1e-4, Math.max(0, (z + half) / step));
    const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz;
    const h = this.heights;
    const a = h[gz * W + gx], b = h[gz * W + gx + 1], c = h[(gz + 1) * W + gx], d = h[(gz + 1) * W + gx + 1];
    return mix(mix(a, b, tx), mix(c, d, tx), tz);
  }

  // A big flat surface you must not fall into (water, lava, mist, clouds).
  hazard(y, material, killDepth = 0.7) {
    const geo = new THREE.PlaneGeometry(1600, 1600);
    geo.rotateX(-Math.PI / 2);
    const m = this.add(new THREE.Mesh(geo, material));
    m.position.y = y;
    m.receiveShadow = true;
    this.hazardY = y - killDepth;
    return m;
  }

  // ---------- Building blocks ----------
  block(x, top, z, w, h, d, color = 0xd9d2e3, { invisible = false, blockCamera = true, material = null, outline = 0.04 } = {}) {
    const p = { kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top, bottom: top - h, w, h, d };
    if (!invisible) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || toonMaterial(color));
      if (outline) addOutline(m, outline);
      m.position.set(x, top - h / 2, z);
      m.castShadow = m.receiveShadow = true;
      this.add(m);
      p.mesh = m;
      if (blockCamera) this.cameraBlockers.push(m);
    }
    this.platforms.push(p);
    return p;
  }

  // Collision only (for shapes that are drawn some other way).
  solidBox(x, top, z, w, h, d) { return this.block(x, top, z, w, h, d, 0, { invisible: true }); }
  solidCyl(x, z, r, bottom, top) { const p = { kind: 'cyl', x, z, r, top, bottom }; this.platforms.push(p); return p; }

  pillar(x, z, r, bottom, top, color = 0xd9d2e3, topColor = null, { segments = 20, blockCamera = true, material = null } = {}) {
    const h = top - bottom;
    const m = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, segments), material || toonMaterial(color)));
    m.position.set(x, bottom + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    this.add(m);
    if (topColor !== null) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.3, segments), toonMaterial(topColor));
      cap.position.set(x, top - 0.14, z);
      cap.receiveShadow = true;
      this.add(cap);
    }
    if (blockCamera) this.cameraBlockers.push(m);
    return this.solidCyl(x, z, r, bottom, top);
  }

  island(x, y, z, r, { top = 0xffffff, rock = 0xc8b8a8 } = {}) {
    const g = new THREE.Group();
    const t = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.5, 24), pbr('grass', { tint: top })));
    t.position.y = -0.25;
    t.receiveShadow = t.castShadow = true;
    const k = addOutline(new THREE.Mesh(new THREE.ConeGeometry(r * 0.92, r * 1.6, 9), pbr('mossRock', { tint: rock })));
    k.rotation.x = Math.PI;
    k.position.y = -0.5 - r * 0.8;
    k.castShadow = true;
    g.add(t, k);
    g.position.set(x, y, z);
    this.add(g);
    return this.solidCyl(x, z, r, y - 0.5, y);
  }

  // A platform that slides between two points (can go up/down too) and carries the player.
  mover(a, b, period, w = 2.2, d = 2.2, color = 0xf3b6e0) {
    const p = this.block(a.x, a.y, a.z, w, 0.5, d, color);
    Object.assign(p, { a, b, period, cur: a.clone(), delta: new THREE.Vector3() });
    this.movers.push(p);
    return p;
  }

  gem(x, y, z, color = 0xff4d6d) {
    const m = addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), glowMaterial(color, 0.35)), 0.025);
    m.position.set(x, y + 0.8, z);
    m.userData.baseY = m.position.y;
    this.add(m);
    this.gems.push(m);
    return m;
  }

  // Big goal pickup with a light beam you can see from far away.
  // star:true makes it a Royal Star (the goal of a level) instead of a Crown Jewel.
  jewel(x, y, z, name, { star = false, beamColor = 0xfff1a0 } = {}) {
    const g = new THREE.Group();
    let geo;
    if (star) {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.32 : 0.75;
        i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      geo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
      geo.center();
    } else {
      geo = new THREE.OctahedronGeometry(0.6);
      geo.scale(1, 1.4, 1);
    }
    const gem = addOutline(new THREE.Mesh(geo, glowMaterial(0xffd84a, 0.45)), 0.04);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 120, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    beam.position.y = 60;
    g.add(gem, beam);
    g.position.set(x, y + 1.1, z);
    g.userData = { name, gem, star };
    this.add(g);
    this.jewels.push(g);
    return g;
  }

  // Many copies of the same shape drawn in one go (trees, bamboo, rocks).
  instanced(geo, mat, matrices, { outline = 0, shadow = true, colors = null } = {}) {
    const n = matrices.length;
    const im = new THREE.InstancedMesh(geo, mat, n);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = shadow;
    im.receiveShadow = true;
    this.add(im);
    void outline; // outlines were part of the old cartoon look
    return im;
  }

  // Floating glowing dots: fireflies ('float'), petals/ash ('fall'), embers ('rise').
  particles({ count, box, color, size = 0.25, mode = 'float', speed = 1, opacity = 1, additive = true, texture = null }) {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), seed = new Float32Array(count);
    const r = rng(count * 31 + 7), base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = mix(box.x0, box.x1, r());
      pos[i * 3 + 1] = mix(box.y0, box.y1, r());
      pos[i * 3 + 2] = mix(box.z0, box.z1, r());
      seed[i] = r() * 100;
      base.toArray(col, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size, map: texture || glowTexture(), vertexColors: true, transparent: !texture, opacity, depthWrite: !!texture,
      alphaTest: texture ? 0.5 : 0, blending: additive && !texture ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = this.add(new THREE.Points(g, mat));
    pts.frustumCulled = false;
    this.onUpdate((dt, t) => {
      for (let i = 0; i < count; i++) {
        const k = i * 3, s = seed[i];
        if (mode === 'float') {
          pos[k] += Math.sin(t * 0.7 + s) * dt * 0.6 * speed;
          pos[k + 1] += Math.cos(t * 0.9 + s * 1.3) * dt * 0.4 * speed;
          pos[k + 2] += Math.sin(t * 0.5 + s * 0.7) * dt * 0.6 * speed;
          const blink = Math.max(0, Math.sin(t * 2 + s * 5)) ** 2;
          col[k] = base.r * blink; col[k + 1] = base.g * blink; col[k + 2] = base.b * blink;
        } else if (mode === 'fall') {
          pos[k + 1] -= dt * speed * (0.6 + (s % 1) * 0.6);
          pos[k] += Math.sin(t + s) * dt * 0.8;
          pos[k + 2] += Math.cos(t * 0.8 + s) * dt * 0.4;
          if (pos[k + 1] < box.y0) pos[k + 1] = box.y1;
        } else {
          pos[k + 1] += dt * speed * (0.6 + (s % 1) * 0.8);
          pos[k] += Math.sin(t * 2 + s) * dt * 0.5;
          if (pos[k + 1] > box.y1) pos[k + 1] = box.y0;
          const flick = 0.6 + 0.4 * Math.sin(t * 8 + s * 3);
          col[k] = base.r * flick; col[k + 1] = base.g * flick; col[k + 2] = base.b * flick;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    });
    return pts;
  }

  // ---------- Per-frame ----------
  update(dt) {
    this.time += dt;
    for (const p of this.movers) {
      const t = (Math.sin((this.time / p.period) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      const prev = p.cur.clone();
      p.cur.lerpVectors(p.a, p.b, t);
      p.delta.subVectors(p.cur, prev);
      p.minX += p.delta.x; p.maxX += p.delta.x;
      p.minZ += p.delta.z; p.maxZ += p.delta.z;
      p.top += p.delta.y; p.bottom += p.delta.y;
      p.mesh.position.set(p.cur.x, p.cur.y - p.h / 2, p.cur.z);
    }
    for (const g of this.gems) {
      if (!g.visible) continue;
      g.rotation.y += dt * 2;
      g.position.y = g.userData.baseY + Math.sin(this.time * 3 + g.position.x) * 0.12;
    }
    for (const j of this.jewels) {
      if (!j.visible) continue;
      j.userData.gem.rotation.y += dt * 1.5;
      j.userData.gem.position.y = Math.sin(this.time * 2) * 0.2;
    }
    for (const fn of this.updaters) fn(dt, this.time);
  }

  // ---------- Collision queries ----------
  // Highest platform top under (x,z) that is at or below y.
  groundBelow(x, z, y, radius) {
    let best = null;
    for (const p of this.platforms) {
      if (p.top > y + 0.05 || (best && p.top <= best.top)) continue;
      let inside;
      if (p.kind === 'cyl') inside = Math.hypot(x - p.x, z - p.z) <= Math.max(0.2, p.r - 0.1);
      else inside = x >= p.minX - radius * 0.5 && x <= p.maxX + radius * 0.5 && z >= p.minZ - radius * 0.5 && z <= p.maxZ + radius * 0.5;
      if (inside) best = p;
    }
    return best;
  }

  // Push the player out of the sides of things. Ledges lower than `step` are stepped onto instead.
  resolveWalls(pos, radius, height, step = 0) {
    for (const p of this.platforms) {
      if (pos.y >= p.top - 0.05 - step || pos.y + height <= p.bottom) continue;
      if (p.kind === 'cyl') {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), min = p.r + radius;
        if (d < min && d > 1e-5) { pos.x = p.x + (dx / d) * min; pos.z = p.z + (dz / d) * min; }
      } else {
        const cx = Math.max(p.minX, Math.min(pos.x, p.maxX));
        const cz = Math.max(p.minZ, Math.min(pos.z, p.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
        if (d < radius && d > 1e-5) { pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius; }
      }
    }
  }

  ceilingAbove(pos, radius, height) {
    for (const p of this.platforms) {
      if (p.kind !== 'box') continue;
      if (pos.x < p.minX || pos.x > p.maxX || pos.z < p.minZ || pos.z > p.maxZ) continue;
      if (pos.y + height > p.bottom && pos.y < p.bottom) return p;
    }
    return null;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const l of this.extraLights || []) l.dispose?.();
  }
}

// ---------- Ground material that blends three PBR textures ----------
// Each terrain vertex carries 3 weights (attribute "splat"); textures are sampled in meters.
function splatMaterial(keys, tiles = null, tints = null, rough = null) {
  const L = keys.map((k) => textureSetFor(k));
  const reps = keys.map((k, i) => 1 / ((tiles && tiles[i]) || TILE[k] || 3));
  const m = new THREE.MeshStandardMaterial({ map: L[0].color, normalMap: L[0].normal, roughnessMap: L[0].arm, aoMap: L[0].arm, aoMapIntensity: 0.7, roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.mapB = { value: L[1].color }; sh.uniforms.mapC = { value: L[2].color };
    sh.uniforms.norB = { value: L[1].normal }; sh.uniforms.norC = { value: L[2].normal };
    sh.uniforms.armB = { value: L[1].arm }; sh.uniforms.armC = { value: L[2].arm };
    sh.uniforms.splatRep = { value: new THREE.Vector3(...reps) };
    const tc = (keys.map((k, i) => new THREE.Color((tints && tints[i]) ?? 0xffffff)));
    sh.uniforms.roughMul = { value: new THREE.Vector3(...(rough || [1, 1, 1])) };
    sh.uniforms.tintA = { value: tc[0] }; sh.uniforms.tintB = { value: tc[1] }; sh.uniforms.tintC = { value: tc[2] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vWorldUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSplat = splat;\nvWorldUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D mapB; uniform sampler2D mapC; uniform sampler2D norB; uniform sampler2D norC;
uniform sampler2D armB; uniform sampler2D armC; uniform vec3 splatRep; uniform vec3 tintA; uniform vec3 tintB; uniform vec3 tintC; uniform vec3 roughMul;
varying vec3 vSplat; varying vec2 vWorldUv;
vec3 splatW() { vec3 w = max(vSplat, 0.0); return w / max(w.x + w.y + w.z, 1e-4); }
vec4 splat3(sampler2D a, sampler2D b, sampler2D c) {
  vec3 w = splatW();
  vec4 r = vec4(0.0);
  if (w.x > 0.001) r += texture2D(a, vWorldUv * splatRep.x) * w.x;
  if (w.y > 0.001) r += texture2D(b, vWorldUv * splatRep.y) * w.y;
  if (w.z > 0.001) r += texture2D(c, vWorldUv * splatRep.z) * w.z;
  return r;
}`)
      .replace('#include <map_fragment>', 'vec3 sw = splatW();' + String.fromCharCode(10) + 'diffuseColor *= splat3(map, mapB, mapC) * vec4(tintA * sw.x + tintB * sw.y + tintC * sw.z, 1.0);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * splat3(roughnessMap, armB, armC).g * dot(splatW(), roughMul);')
      .replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv ).r', 'splat3(aoMap, armB, armC).r'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', 'vec3 mapN = splat3(normalMap, norB, norC).xyz * 2.0 - 1.0;'));
  };
  m.customProgramCacheKey = () => 'splat3';
  return m;
}
