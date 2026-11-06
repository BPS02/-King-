import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Assets made in Blender (see KingdomPlatformer/tools/make_climb_assets.py):
//   rocks.glb          - faceted rocks; "ledge_*" ones have flat tops you can stand on
//   far_mountains.glb  - snow-capped backdrop peaks
//   terrain/detail_N   - ridged, eroded mountain detail heightmaps (257 x 257, values 0..1)
// and KingdomPlatformer/tools/make_city_assets.py:
//   city.glb + city_info.json - castle keep, stone walls, turrets, gatehouse, town houses... with
//                               their sizes and collision boxes
// plus the samurai and king models again, for the guards and the King living in the castle town.
export const ASSETS = { rocks: {}, rockInfo: {}, peaks: [], detail: [], city: {}, cityInfo: {}, npc: {} };

let loading = null;
export function loadAssets() {
  if (loading) return loading;
  const gl = new GLTFLoader();
  loading = (async () => {
    const [rocks, peaks, city, cityInfo, samurai, king] = await Promise.all([
      gl.loadAsync('/models/rocks.glb'), gl.loadAsync('/models/far_mountains.glb'),
      gl.loadAsync('/models/city.glb'), fetch('/models/city_info.json').then((r) => r.json()),
      gl.loadAsync('/models/samurai.glb'), gl.loadAsync('/models/king.glb'),
    ]);
    // Each building is one object (a group with a mesh per material when it uses several).
    for (const o of city.scene.children) ASSETS.city[o.name] = o;
    ASSETS.cityInfo = cityInfo;
    ASSETS.npc = { samurai, king };
    rocks.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      g.computeBoundingBox();
      const b = g.boundingBox;
      ASSETS.rocks[o.name] = g;
      // Size info: how tall it is and how wide its standing area is.
      ASSETS.rockInfo[o.name] = { height: b.max.y, radius: Math.min(b.max.x - b.min.x, b.max.z - b.min.z) / 2 };
    });
    peaks.scene.traverse((o) => { if (o.isMesh) ASSETS.peaks.push(o.geometry); });
    ASSETS.detail = await Promise.all([0, 1, 2, 3, 4].map((i) =>
      fetch(`/terrain/detail_${i}.bin`).then((r) => r.arrayBuffer()).then((b) => new Float32Array(b))));
  })();
  return loading;
}

// Bilinear sample of a detail heightmap, tiled over `span` meters.
export function sampleDetail(index, x, z, span = 220) {
  const d = ASSETS.detail[index % ASSETS.detail.length], N = 257;
  let u = ((x / span) % 1 + 1) % 1 * (N - 1), v = ((z / span) % 1 + 1) % 1 * (N - 1);
  const i = Math.min(N - 2, Math.floor(u)), j = Math.min(N - 2, Math.floor(v));
  u -= i; v -= j;
  const a = d[j * N + i], b = d[j * N + i + 1], c = d[(j + 1) * N + i], e = d[(j + 1) * N + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
}
void THREE;
