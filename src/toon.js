import * as THREE from 'three';

// Material helpers. The game started cel-shaded ("toon"); it now renders with physically based
// (PBR) materials. The old function names are kept so all the level code still works.

// Plain colored PBR material (cached so big levels stay fast).
const cache = new Map();
export function toonMaterial(color, extra = null) {
  if (!extra) {
    if (!cache.has(color)) cache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 }));
    return cache.get(color);
  }
  const { gradientMap, ...rest } = extra;
  void gradientMap;
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...rest });
}

// Glowing material (paper lanterns, lava, crystals). Bright enough to trigger bloom.
const glowCache = new Map();
export function glowMaterial(color, intensity = 0.8) {
  const key = color + ':' + intensity;
  if (!glowCache.has(key)) glowCache.set(key, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity * 2.2, roughness: 0.6 }));
  return glowCache.get(key);
}

// Outlines belonged to the cartoon look; in the realistic style they are switched off.
export function outlineMaterial(thickness, color = 0x1c1430) {
  return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, visible: false });
}
export function addOutline(mesh) { return mesh; }
export function toonGradient() { return null; }

// Prepare a loaded character for realistic rendering: keep ALL of its original PBR maps
// (color, normal, metal/roughness), add a lacquer-like clear coat, and enable shadows.
export function makeHero(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    const m = new THREE.MeshPhysicalMaterial({
      map: old.map, normalMap: old.normalMap, normalScale: old.normalScale?.clone() ?? new THREE.Vector2(1, 1),
      roughnessMap: old.roughnessMap, metalnessMap: old.metalnessMap, aoMap: old.aoMap, emissiveMap: old.emissiveMap,
      color: old.color?.clone() ?? new THREE.Color(1, 1, 1), roughness: old.roughness ?? 1, metalness: old.metalness ?? 0,
      emissive: old.emissive?.clone() ?? new THREE.Color(0, 0, 0),
      clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 1.1,
    });
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = 8;
    o.material = m;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  });
}
// Kept for compatibility with older code.
export const makeToon = (root) => makeHero(root);

// Soft round glow used for lantern halos, fireflies, embers, the sky orb...
let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.set(size, size, 1);
  return s;
}
