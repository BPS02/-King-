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

export function toonMaterial(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

// Black outline drawn by pushing back-faces outward along their normals ("inverted hull").
// Works for skinned meshes too, because the push happens before skinning.
export function outlineMaterial(thickness) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1c1430, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = 'uniform float outlineThickness;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;'
    );
  };
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
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  mesh.add(o);
  return mesh;
}
