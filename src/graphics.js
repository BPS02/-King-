import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------------------------
// Graphics quality presets. Chosen in the in-game settings (press O), saved in this browser.
// ---------------------------------------------------------------------------------------------
export const QUALITY = {
  low:    { label: 'Low',    pixelRatio: 1,   shadows: false, shadowSize: 1024, shadowRadius: 1, tex: '1k', aniso: 2,  bloom: false, ao: false, msaa: 0, lights: 0,  detail: 0.0 },
  medium: { label: 'Medium', pixelRatio: 1,   shadows: true,  shadowSize: 1024, shadowRadius: 2, tex: '1k', aniso: 4,  bloom: true,  ao: false, msaa: 0, lights: 4,  detail: 0.4 },
  high:   { label: 'High',   pixelRatio: 1.5, shadows: true,  shadowSize: 2048, shadowRadius: 3, tex: '2k', aniso: 8,  bloom: true,  ao: false, msaa: 4, lights: 8,  detail: 0.75 },
  ultra:  { label: 'Ultra',  pixelRatio: 2,   shadows: true,  shadowSize: 4096, shadowRadius: 4, tex: '2k', aniso: 16, bloom: true,  ao: true,  msaa: 4, lights: 12, detail: 1.0 },
};
const QKEY = 'kingdom-quality';
export function qualityName() {
  const fromUrl = new URLSearchParams(location.search).get('quality');
  const name = fromUrl || localStorage.getItem(QKEY) || 'high';
  return QUALITY[name] ? name : 'high';
}
export const Q = QUALITY[qualityName()];
export function setQuality(name) { localStorage.setItem(QKEY, name); }

let renderer = null;
export function useRenderer(r) { renderer = r; }

// ---------------------------------------------------------------------------------------------
// PBR texture library (CC0 textures from Poly Haven, see public/textures/CREDITS.md).
// Each set has color, normal (OpenGL) and ARM (R = ambient occlusion, G = roughness, B = metalness).
// ---------------------------------------------------------------------------------------------
const loader = new THREE.TextureLoader();
const sets = new Map();
function textureSet(key) {
  if (sets.has(key)) return sets.get(key);
  const base = `/textures/${key}/${Q.tex}_`;
  const load = (name, srgb) => {
    const t = loader.load(base + name + '.jpg');
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(Q.aniso, renderer ? renderer.capabilities.getMaxAnisotropy() : 4);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const set = { color: load('color', true), normal: load('normal', false), arm: load('arm', false) };
  sets.set(key, set);
  return set;
}
export const textureSetFor = (key) => textureSet(key);
// Same image, different tiling: cheap clones that share the GPU upload.
const tiled = new Map();
function tiledSet(key, tile) {
  const id = key + '@' + tile;
  if (tiled.has(id)) return tiled.get(id);
  const s = textureSet(key), r = 1 / tile;
  const c = (t) => { const k = t.clone(); k.repeat.set(r, r); k.needsUpdate = true; return k; };
  const out = { color: c(s.color), normal: c(s.normal), arm: c(s.arm) };
  tiled.set(id, out);
  return out;
}

// Real-world size (meters) one copy of each texture covers.
export const TILE = {
  flagstone: 2.4, cobble: 1.6, roofTiles: 1.6, plaster: 2.5, hinoki: 1.6, darkWood: 1.8, wood: 1.2, bark: 1.0,
  grass: 3.0, dirt: 3.0, forestGround: 3.0, mossRock: 2.2, darkRock: 3.0, ash: 3.5, snow: 4.0,
};

// A textured PBR material. `tint` multiplies the texture color (great for painted wood, lacquer...).
// `textureColor:false` keeps only the surface detail (normal + roughness) and uses a solid paint color.
const matCache = new Map();
export function pbr(key, { tint = 0xffffff, tile = TILE[key] || 2, rough = 1, metal = 0, normal = 1, textureColor = true, emissive = 0x000000, emissiveIntensity = 0, side = THREE.FrontSide, physical = null } = {}) {
  const id = JSON.stringify([key, tint, tile, rough, metal, normal, textureColor, emissive, emissiveIntensity, side, physical]);
  if (matCache.has(id)) return matCache.get(id);
  const t = tiledSet(key, tile);
  const Mat = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Mat({
    color: tint, map: textureColor ? t.color : null, normalMap: t.normal, normalScale: new THREE.Vector2(normal, normal),
    roughnessMap: t.arm, roughness: rough, metalnessMap: metal > 0 ? t.arm : null, metalness: metal,
    aoMap: t.arm, aoMapIntensity: 0.8, emissive, emissiveIntensity, side, ...(physical || {}),
  });
  m.userData.worldUV = true;   // tells the stage to generate real-world-scaled texture coordinates
  matCache.set(id, m);
  return m;
}

// Untextured PBR (paint, metal, lacquer, cloth).
export function solid(color, { rough = 0.7, metal = 0, emissive = 0x000000, emissiveIntensity = 1, clearcoat = 0, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  const id = JSON.stringify(['solid', color, rough, metal, emissive, emissiveIntensity, clearcoat, side, transparent, opacity]);
  if (matCache.has(id)) return matCache.get(id);
  const Mat = clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Mat({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity, side, transparent, opacity, ...(clearcoat ? { clearcoat, clearcoatRoughness: 0.15 } : {}) });
  matCache.set(id, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Texture coordinates in real-world meters, so textures never stretch.
// Flat faces get a planar mapping aligned to the face (roof tile rows stay horizontal);
// cylinders get a wrap-around mapping.
// ---------------------------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
export function worldUV(geometry, scale = new THREE.Vector3(1, 1, 1)) {
  if (geometry.userData.worldUV) return geometry;
  const isCyl = geometry.type === 'CylinderGeometry' || geometry.type === 'ConeGeometry';
  let g = geometry;
  if (!isCyl && g.index) {
    // Planar per-face mapping needs separate vertices per face.
    const ni = g.toNonIndexed();
    g.setIndex(null);
    for (const name of Object.keys(ni.attributes)) g.setAttribute(name, ni.attributes[name]);
  }
  const pos = g.attributes.position, n = pos.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), uDir = new THREE.Vector3(), vDir = new THREE.Vector3(), p = new THREE.Vector3();
  if (isCyl) {
    const prm = g.parameters, r = ((prm.radiusTop ?? 0) + (prm.radiusBottom ?? prm.radius ?? 1)) / 2 * Math.max(scale.x, scale.z);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i).multiply(scale);
      const flatTop = Math.abs(g.attributes.normal.getY(i)) > 0.9;
      if (flatTop) { uv[i * 2] = p.x; uv[i * 2 + 1] = p.z; }
      else { uv[i * 2] = (Math.atan2(p.z, p.x) / (Math.PI * 2) + 0.5) * 2 * Math.PI * Math.max(r, 0.05); uv[i * 2 + 1] = p.y; }
    }
  } else {
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, i).multiply(scale); b.fromBufferAttribute(pos, i + 1).multiply(scale); c.fromBufferAttribute(pos, i + 2).multiply(scale);
      nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      if (Math.abs(nrm.y) > 0.92) { uDir.set(1, 0, 0); vDir.set(0, 0, 1); }
      else { uDir.crossVectors(UP, nrm).normalize(); vDir.crossVectors(nrm, uDir).normalize(); }
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, i + k).multiply(scale);
        uv[(i + k) * 2] = p.dot(uDir); uv[(i + k) * 2 + 1] = p.dot(vDir);
      }
    }
    g.computeVertexNormals();
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.userData.worldUV = true;
  return g;
}

// Run after building: gives every textured mesh real-world UVs (taking its scale into account).
export function prepareMeshes(root) {
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => m?.userData?.worldUV)) return;
    o.getWorldScale(s);
    worldUV(o.geometry, s.clone());
  });
}

// ---------------------------------------------------------------------------------------------
// Image-based lighting from HDR skies (gives metal, lacquer and wet stone believable reflections).
// ---------------------------------------------------------------------------------------------
const envCache = new Map();
export function loadEnvironment(name) {
  if (envCache.has(name)) return envCache.get(name);
  const p = new HDRLoader().loadAsync(`/hdri/${name}.hdr`).then((hdr) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(hdr).texture;
    hdr.dispose(); pm.dispose();
    return env;
  });
  envCache.set(name, p);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Lantern light pool: levels register many light spots; only the nearest few get a real light.
// ---------------------------------------------------------------------------------------------
export class LightPool {
  constructor(scene) {
    this.lights = [];
    for (let i = 0; i < Q.lights; i++) {
      const l = new THREE.PointLight(0xffa04a, 0, 14, 2);
      scene.add(l);
      this.lights.push(l);
    }
    this.timer = 0;
  }
  update(dt, spots, center) {
    if (!this.lights.length) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    const near = spots.map((s) => [s, s.pos.distanceToSquared(center)]).sort((a, b) => a[1] - b[1]);
    this.lights.forEach((l, i) => {
      const s = near[i]?.[0];
      if (!s || near[i][1] > 60 * 60) { l.intensity = 0; return; }
      l.position.copy(s.pos); l.color.setHex(s.color); l.intensity = s.intensity; l.distance = s.range;
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Post-processing: ambient occlusion (Ultra), bloom for glowing lanterns/lava, tone mapping.
// ---------------------------------------------------------------------------------------------
export function makeComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null, bloom = null;
  let aoCamera = null;
  if (Q.ao) {
    // AO sees everything except the sky (layer 1), otherwise the far sky dome gets shaded.
    aoCamera = camera.clone();
    aoCamera.layers.set(0);
    ao = new GTAOPass(scene, aoCamera, size.x, size.y);
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }
  if (Q.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, 0.92);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  // Call every frame before rendering so the AO camera follows the real one.
  const sync = () => { if (aoCamera) { aoCamera.position.copy(camera.position); aoCamera.quaternion.copy(camera.quaternion); aoCamera.projectionMatrix.copy(camera.projectionMatrix); aoCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse); aoCamera.updateMatrixWorld(); } };
  return { composer, bloom, ao, sync };
}

// ---------------------------------------------------------------------------------------------
// Merge static scenery that shares a material into one mesh per material: far fewer draw calls.
// Objects marked with userData.dynamic (or inside such a group), instanced meshes, and meshes the
// camera collides with are left alone.
// ---------------------------------------------------------------------------------------------
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function mergeStatic(root, keep = new Set()) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const isDynamic = (o) => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic || keep.has(p)) return true; return false; };
  const sources = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.visible) return;
    if (o.material.transparent || o.geometry.attributes.position.count > 60000 || isDynamic(o)) return;
    sources.push(o);
  });
  for (const o of sources) {
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const sig = Object.keys(g.attributes).sort().join(',');
    const key = o.material.uuid + '|' + sig;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], cast: false, receive: false });
    const b = buckets.get(key);
    b.geos.push(g); b.cast ||= o.castShadow; b.receive ||= o.receiveShadow;
  }
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) { b.geos.forEach((g) => g.dispose()); continue; }
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const m = new THREE.Mesh(geo, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive;
    m.matrixAutoUpdate = false;
    root.add(m);
    merged++;
  }
  // Remove the originals that went into merged meshes.
  const mergedKeys = new Set([...buckets.entries()].filter(([, b]) => b.geos.length >= 2).map(([k]) => k));
  for (const o of sources) {
    const g0 = o.geometry;
    const sig = Object.keys((g0.index ? g0 : g0).attributes).sort().join(',');
    if (mergedKeys.has(o.material.uuid + '|' + sig)) o.parent.remove(o);
  }
  return { sources: sources.length, merged };
}
