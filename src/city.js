import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from './assets.js';
import { pbr, solid } from './graphics.js';
import { plasterMat, paintMat, GOLD, IRON, cloth } from './deco.js';

// Helpers for building the castle town out of the Blender-made pieces in city.glb.
// Every piece is modelled with its FRONT facing +z; `face` turns it to face '+z', '-z', '+x' or '-x'.

const FACE_ROT = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

// The Blender material names, swapped for the game's realistic textured materials.
let MATS = null;
function cityMaterials(night) {
  return {
    m_plaster: plasterMat(0xf4f1ea),
    m_roof: pbr('roofTiles', { tint: 0x8a94a0, rough: 0.85 }),
    m_wood: pbr('hinoki', { tint: 0xd8b48a }),
    m_darkwood: pbr('darkWood'),
    m_stone: pbr('cobble', { tint: 0xcfc8bc, tile: 2.6 }),
    m_gold: GOLD(),
    m_window: solid(0x16120f, { rough: 0.9 }),
    // Paper screens glow warmly from the lamps inside once the sun goes down.
    m_shoji: solid(0xf6e2b8, { rough: 0.95, emissive: 0xffa850, emissiveIntensity: night ? 0.85 : 0.12 }),
    m_red: paintMat(0xb8322a),
    m_cloth_red: cloth(0xa82828),
    m_cloth_blue: cloth(0x24386a),
    m_cloth_white: cloth(0xece6da),
    m_namako: pbr('roofTiles', { tint: 0x5a5e66, tile: 0.9 }),
    m_iron: IRON(),
    m_bronze: solid(0x8a6a3a, { rough: 0.4, metal: 1 }),
  };
}

export function info(name) { return ASSETS.cityInfo[name]; }

// Turn a collision box from the piece's own space into the world.
function turnBox([bx, top, bz, w, h, d], rot) {
  const c = Math.round(Math.cos(rot)), s = Math.round(Math.sin(rot));
  return [bx * c + bz * s, top, -bx * s + bz * c, s ? d : w, h, s ? w : d];
}

// Place a piece. Adds its collision boxes (and invisible camera blockers so the camera
// doesn't slide inside buildings). Returns the object.
export function piece(s, name, x, y, z, face = '+z', { collide = true, camera = true, scale = 1 } = {}) {
  const src = ASSETS.city[name];
  if (!src) { console.warn('city piece missing:', name); return null; }
  MATS ??= cityMaterials(s.night);
  const obj = src.clone();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = MATS[o.material.name] || o.material;
    o.castShadow = o.receiveShadow = true;
  });
  const rot = FACE_ROT[face] ?? face;
  obj.rotation.set(0, rot, 0);
  obj.position.set(x, y, z);
  obj.scale.setScalar(scale);
  s.add(obj);
  if (collide) {
    for (const b of info(name).boxes) {
      const [bx, top, bz, w, h, d] = turnBox(b.map((v) => v * scale), rot);
      s.solidBox(x + bx, y + top, z + bz, w, h, d);
      if (camera && h > 1.5) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
        m.position.set(x + bx, y + top - h / 2, z + bz);
        m.visible = false;                   // never drawn, only stops the camera
        s.add(m);
        s.cameraBlockers.push(m);
      }
    }
  }
  return obj;
}

// Footprint (width along the street, depth) of a piece's main body.
export function footprint(name) {
  const b = info(name).boxes[0];
  return { w: b[3], d: b[5], h: b[1] };
}

export function resetCityMaterials() { MATS = null; }

// ---------------------------------------------------------------------------------------------
// Townspeople: animated copies of the game's characters (samurai guards, the King).
// path: list of points to walk between (back and forth); without a path they stand still.
// ---------------------------------------------------------------------------------------------
export function npc(s, kind, x, y, z, { facing = 0, height = 1.9, clip = 'idle', path = null, speed = 1.3, ground = null } = {}) {
  const gltf = ASSETS.npc[kind];
  if (!gltf) return null;
  const model = cloneSkinned(gltf.scene);
  const box = new THREE.Box3().setFromObject(model);
  const k = height / Math.max(0.01, box.max.y - box.min.y);
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });   // off-screen people are skipped
  const root = new THREE.Group();
  root.add(model);
  root.position.set(x, y, z);
  root.rotation.y = facing;
  root.userData.dynamic = true;               // never merged into the static scenery
  s.add(root);
  const mixer = new THREE.AnimationMixer(model);
  const play = (name) => {
    const c = gltf.animations.find((a) => a.name === name) || gltf.animations.find((a) => a.name === 'idle') || gltf.animations[0];
    if (c) mixer.clipAction(c).play();
  };
  play(path ? 'walk' : clip);
  mixer.update(Math.random() * 3);            // so they don't all move in step
  let leg = 0, pause = 0;
  const pos = root.position;
  s.onUpdate((dt) => {
    mixer.update(dt);
    if (!path) return;
    if (pause > 0) { pause -= dt; return; }
    const to = path[(leg + 1) % path.length];
    const dx = to.x - pos.x, dz = to.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.2) { leg = (leg + 1) % path.length; pause = 0; return; }
    const step = Math.min(d, speed * dt);
    pos.x += (dx / d) * step; pos.z += (dz / d) * step;
    if (ground) pos.y = ground(pos.x, pos.z);
    // Turn smoothly toward where they are walking.
    const want = Math.atan2(dx, dz);
    let diff = want - root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    root.rotation.y += diff * Math.min(1, dt * 6);
  });
  return root;
}
