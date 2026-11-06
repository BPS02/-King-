import * as THREE from 'three';

// A 3-step gradient gives the flat, anime-style shading bands.
let gradient;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

// Plain colored toon materials are shared (cached) so big levels stay fast.
const toonCache = new Map();
export function toonMaterial(color, extra = null) {
  if (!extra) {
    if (!toonCache.has(color)) toonCache.set(color, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() }));
    return toonCache.get(color);
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

// Glowing toon material (lanterns, lava, crystals). Also cached.
const glowCache = new Map();
export function glowMaterial(color, intensity = 0.8) {
  const key = color + ':' + intensity;
  if (!glowCache.has(key)) glowCache.set(key, toonMaterial(color, { emissive: color, emissiveIntensity: intensity }));
  return glowCache.get(key);
}

// Black outline drawn by pushing back-faces outward along their normals ("inverted hull").
// Works for skinned and instanced meshes too.
const outlineCache = new Map();
export function outlineMaterial(thickness, color = 0x1c1430) {
  const key = thickness + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = 'uniform float outlineThickness;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;'
    );
  };
  mat.customProgramCacheKey = () => 'outline' + thickness;
  outlineCache.set(key, mat);
  return mat;
}

// Convert every mesh in a loaded model to toon shading and add an outline copy.
export function makeToon(root, outlineThickness) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const old = mesh.material;
    mesh.material = new THREE.MeshToonMaterial({
      map: old.map || null,
      color: old.map ? 0xffffff : old.color,
      gradientMap: toonGradient(),
    });
    mesh.castShadow = true;
    mesh.frustumCulled = false;

    let outline;
    if (mesh.isSkinnedMesh) {
      outline = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(outlineThickness));
      outline.bind(mesh.skeleton, mesh.bindMatrix);
    } else {
      outline = new THREE.Mesh(mesh.geometry, outlineMaterial(outlineThickness));
    }
    outline.frustumCulled = false;
    mesh.parent.add(outline);
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
  }
}

// Outline helper for simple level meshes.
export function addOutline(mesh, thickness = 0.04) {
  mesh.add(new THREE.Mesh(mesh.geometry, outlineMaterial(thickness)));
  return mesh;
}

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
