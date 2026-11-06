import * as THREE from 'three';
import { Stage, fbm, noise, smooth, mix } from '../stage.js';
import {
  portal, torii, stoneLantern, paperLantern, lanternString, lampPost, cherryTree, banner, pagoda, archBridge,
  grassField, paintMat,
} from '../deco.js';
import { pbr, solid, worldUV, qualityName } from '../graphics.js';
import { farMountains } from '../mountain.js';
import { piece, footprint, info, npc, resetCityMaterials } from '../city.js';
import { petalTexture } from '../proctex.js';

// HOSHI CASTLE TOWN - the home base.
// A samurai castle city at golden hour. North is -Z.
//   - Hoshi Castle in the north: moat, red bridge, gatehouse, stone walls, corner turrets and a
//     five-storey keep (lift up to its top balcony).
//   - The town to the south: a grid of merchant streets, Castle Avenue down the middle, a market
//     square with a fire-watch tower, merchant halls, storehouses and a canal with a boat.
//   - West of the castle: the Gate of the Five Peaks, where portals lead to the five mountains.
//   - East of the castle: the temple with its hall and pagoda.
// Five Crown Jewels are hidden around town.

const CITY_Y = 2.5, ISLAND_Y = 3, HON_Y = 10, KEEP_Y = 14;
const CASTLE = { x: 0, z: -45 }, MOAT_IN = 34, MOAT_OUT = 46;
const KEEP = { x: 0, z: -52 };
const CANAL_Z = 100, CANAL_W = 3.5, CANAL_X = 96;
const SIZE = 420, N = 280;

// Streets (axis-aligned rectangles) and city blocks.
const AVENUE = { x0: -6, x1: 6, z0: 1, z1: 128 };
const STREETS = [
  AVENUE,
  { x0: -96, x1: 96, z0: 1, z1: 14 },            // plaza in front of the moat
  { x0: -96, x1: 96, z0: 42, z1: 50 },           // Market Street
  { x0: -96, x1: 96, z0: 80, z1: 88 },           // Canal Street
  { x0: -96, x1: 96, z0: 120, z1: 128 },         // South Road
  { x0: -50, x1: -42, z0: 1, z1: 128 }, { x0: 42, x1: 50, z0: 1, z1: 128 },
  { x0: -96, x1: -88, z0: 1, z1: 128 }, { x0: 88, x1: 96, z0: 1, z1: 128 },
];
const SHRINE = { x0: -96, x1: -52, z0: -90, z1: 1 };   // Gate of the Five Peaks
const TEMPLE = { x0: 52, x1: 96, z0: -90, z1: 1 };
const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
const onStreet = (x, z, m = 0) => STREETS.some((r) => inRect(r, x, z, m));

function cityHeight(x, z) {
  let h = CITY_Y;
  // Green hills around the town, higher behind the castle.
  const out = Math.max(Math.abs(x) - 98, z - 130, -z - 94, 0);
  h += smooth(2, 40, out) * (5 + fbm(x * 0.02 + 3, z * 0.02 + 9) * 30);
  // The moat: a square ring of water around the castle island.
  const sq = Math.max(Math.abs(x - CASTLE.x), Math.abs(z - CASTLE.z));
  if (sq <= MOAT_IN) h = ISLAND_Y;
  else if (sq < MOAT_OUT) h = -3;
  // The canal across the south of town.
  if (Math.abs(z - CANAL_Z) < CANAL_W && Math.abs(x) < CANAL_X) h = -2.5;
  // The sea around the island.
  h = mix(h, -8, smooth(186, 206, Math.hypot(x, z)));
  return h;
}

export class Hub extends Stage {
  constructor(scene, levels, progress) {
    super(scene, { seed: 1234 });
    resetCityMaterials();
    this.title = 'Hoshi Castle Town';
    this.maxSlope = Infinity;
    this.bounds = { x: 0, z: 0, r: 185 };
    this.map = { x: 0, z: 0, size: SIZE, bg: '#3a7ab0', platform: 'rgba(250,240,225,0.9)' };
    // Golden hour: low warm sun, lanterns already lit.
    this.environment({
      skyTop: 0x4a6cb0, skyMid: 0xf0b890, skyBottom: 0xffd8a8,
      fog: [0xe8c0a0, 120, 430],
      hemi: [0xffe0c0, 0x5a4a3a, 1.2],
      sun: { color: 0xffc890, intensity: 2.8, dir: [-0.55, 0.32, 0.65] },
      physicalSky: { turbidity: 4.5, rayleigh: 2.2, mie: 0.006 },
      env: 'sunset', envIntensity: 0.9, exposure: 0.62,
    });
    this.night = true; this.lanternLights = true;
    this.bloom = 0.45; this.bloomThreshold = 2.2;
    this.ground = (x, z) => this.terrainHeight(x, z);

    this.terrain(SIZE, N, cityHeight, () => {}, {
      layers: ['grass', 'flagstone', 'dirt'],
      tints: [0xc8d890, 0xd8d0c4, 0xd8c8a8],
      rough: [1, 0.75, 1],
      weights: (x, y, z, ny) => {
        if (y < 1.5) return [0, 0, 1];
        if (inRect(AVENUE, x, z) || inRect(STREETS[1], x, z) || (Math.abs(x + 74) < 3 && inRect(SHRINE, x, z)) || (Math.abs(x - 74) < 3 && inRect(TEMPLE, x, z))) return [0, 1, 0];
        if (onStreet(x, z)) return [0, 0.25, 0.75];
        if (Math.max(Math.abs(x - CASTLE.x), Math.abs(z - CASTLE.z)) <= MOAT_IN) return [0.25, 0, 0.75];
        if (ny < 0.75) return [0.3, 0, 0.7];
        const d = Math.max(0, Math.min(1, (noise(x * 0.08, z * 0.08) - 0.55) * 3));
        return [1 - d * 0.6, 0, d * 0.6];
      },
    });
    // Water in the moat, canal and sea.
    this.hazard(0.4, new THREE.MeshPhysicalMaterial({ color: 0x2a5a6a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 1 }));
    this.mapColor = (h) => (h < 0.4 ? [58, 122, 176] : h > 6 ? [110 + h, 150 + h * 0.5, 90] : [196, 186, 166]);

    this.buildCastle();
    this.buildTown();
    this.buildMarket();
    this.buildCanal();
    this.buildShrine(levels, progress);
    this.buildTemple();
    this.buildPeople();
    this.buildNature();
    farMountains(this, 0xc89a90, 0.45, 0, 0, 7);

    this.spawn.set(0, CITY_Y, 30);
    this.spawnFacing = Math.PI;               // looking north at the castle
    for (const j of this.jewels) if (progress.jewels.includes(j.userData.name)) j.visible = false;
  }

  // Where to stand when coming back out of a mountain: just in front of its portal.
  portalSpawn(id) {
    const p = this.portals.find((q) => q.id === id);
    if (!p) return null;
    const x = p.x + Math.sin(p.facing) * 4.5, z = p.z + Math.cos(p.facing) * 4.5;
    return { spawn: new THREE.Vector3(x, this.terrainHeight(x, z), z), facing: p.facing };
  }

  // ---------------------------------------------------------------- the castle
  buildCastle() {
    const C = CASTLE, stone = pbr('cobble', { tint: 0xcfc8bc, tile: 2.6 });
    // Stone walls lining the moat (outer bank and island), so it reads as a real castle moat.
    for (const [half, top, inner] of [[MOAT_OUT, CITY_Y + 0.1, false], [MOAT_IN, ISLAND_Y + 0.1, true]]) {
      const t = 1.4, o = inner ? half + t / 2 : half - t / 2, L = half * 2 + (inner ? t * 2 : 0);
      this.block(C.x, top, C.z - o, L, top + 3.5, t, 0, { material: stone, outline: 0 });
      this.block(C.x, top, C.z + o, L, top + 3.5, t, 0, { material: stone, outline: 0 });
      this.block(C.x - o, top, C.z, t, top + 3.5, L, 0, { material: stone, outline: 0 });
      this.block(C.x + o, top, C.z, t, top + 3.5, L, 0, { material: stone, outline: 0 });
    }
    // Red bridge over the moat into the gatehouse.
    const south = C.z + MOAT_OUT + 1, isl = C.z + MOAT_IN - 0.5;
    archBridge(this, C.x, south, isl, CITY_Y + 0.3, { width: 5, rise: 1.4, color: 0xb02a22 });
    piece(this, 'gatehouse', C.x, ISLAND_Y, isl - 3.0, '+z');
    // Island walls with a gap for the gate, corner turrets on small stone bases.
    const edge = MOAT_IN - 1.2;
    this.wallLine(C.x - edge, C.z + edge, C.x - 7.5, C.z + edge, ISLAND_Y);
    this.wallLine(C.x + 7.5, C.z + edge, C.x + edge, C.z + edge, ISLAND_Y);
    this.wallLine(C.x - edge, C.z - edge, C.x + edge, C.z - edge, ISLAND_Y);
    this.wallLine(C.x - edge, C.z - edge, C.x - edge, C.z + edge, ISLAND_Y);
    this.wallLine(C.x + edge, C.z - edge, C.x + edge, C.z + edge, ISLAND_Y);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = C.x + sx * (edge - 3.5), z = C.z + sz * (edge - 3.5);
      piece(this, 'ishigaki_small', x, ISLAND_Y, z);
      piece(this, 'turret', x, ISLAND_Y + 1.6, z, sz > 0 ? '+z' : '-z');
    }
    // The main bailey (honmaru) on its great curved stone wall, with a gravel top.
    piece(this, 'ishigaki_honmaru', C.x, ISLAND_Y, C.z);
    this.block(C.x, HON_Y + 0.02, C.z, 39.6, 0.1, 39.6, 0, { material: pbr('dirt', { tint: 0xd8ccb0 }), outline: 0, blockCamera: false });
    // Stone stairs up the wall, from the gate to the honmaru.
    this.stairs(C.x, C.z + 31, C.z + 20, ISLAND_Y, HON_Y, 4.4, stone);
    // Walls around the honmaru edge (gap for the stairs), turrets on its corners.
    const he = 19.4;
    this.wallLine(C.x - he, C.z + he, C.x - 3, C.z + he, HON_Y);
    this.wallLine(C.x + 3, C.z + he, C.x + he, C.z + he, HON_Y);
    this.wallLine(C.x - he, C.z - he, C.x + he, C.z - he, HON_Y);
    this.wallLine(C.x - he, C.z - he, C.x - he, C.z + he, HON_Y);
    this.wallLine(C.x + he, C.z - he, C.x + he, C.z + he, HON_Y);
    for (const sx of [-1, 1]) {
      piece(this, 'turret', C.x + sx * 14.5, HON_Y, C.z + 14.5, '+z');
      piece(this, 'turret', C.x + sx * 14.5, HON_Y, C.z - 15.5, '-z');
    }
    // The keep on its own stone base.
    piece(this, 'ishigaki_keep', KEEP.x, HON_Y, KEEP.z);
    this.stairs(KEEP.x, KEEP.z + 15, KEEP.z + 8.5, HON_Y, KEEP_Y, 4, stone);
    piece(this, 'castle_keep', KEEP.x, KEEP_Y, KEEP.z, '+z');
    const balcony = KEEP_Y + info('castle_keep').balcony;
    // A wooden lift on the east side up to the keep's top balcony, with a walkway across.
    const lx = KEEP.x + 14;
    const lift = this.mover(new THREE.Vector3(lx, HON_Y + 0.25, KEEP.z), new THREE.Vector3(lx, balcony, KEEP.z), 16, 2.4, 2.4, 0x8a5a33);
    lift.mesh.material = pbr('hinoki', { tint: 0xc8a070 });
    const dw = pbr('darkWood'), red = paintMat(0xb02a22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.pillar(lx + sx * 1.5, KEEP.z + sz * 1.5, 0.14, HON_Y, balcony + 2.6, 0, null, { segments: 6, material: dw, blockCamera: false });
    }
    this.block(lx, balcony + 2.7, KEEP.z, 3.4, 0.25, 3.4, 0, { material: dw, blockCamera: false });
    const wx0 = KEEP.x + 5.6, wx1 = lx - 1.2;
    this.block((wx0 + wx1) / 2, balcony, KEEP.z, wx1 - wx0, 0.3, 1.8, 0, { material: dw, blockCamera: false });
    for (const sz of [-1, 1]) this.block((wx0 + wx1) / 2, balcony + 1.0, KEEP.z + sz * 0.95, wx1 - wx0, 1.0, 0.12, 0, { material: red, blockCamera: false });
    this.jewel(KEEP.x, balcony, KEEP.z + 4.2, 'Castle Keep');
    this.liftFoot = { x: lx, z: KEEP.z };
    // Banners and lanterns in the courtyard.
    for (const sx of [-1, 1]) {
      banner(this, C.x + sx * 4, C.z + 26, ISLAND_Y, 0xf0ece0, 5.5);
      stoneLantern(this, C.x + sx * 4, C.z + 12.5, HON_Y, 1.1);
      paperLantern(this, C.x + sx * 2.6, ISLAND_Y + 4.0, isl - 0.2, 0xffe2a0, 1.1);
    }
    for (let i = 0; i < 6; i++) this.gem(C.x + (i % 2 ? 1.2 : -1.2), ISLAND_Y + 0.6 + i * 1.1, C.z + 29.5 - i * 1.7);
  }

  // Plaster walls with little tile roofs, made from 10 m pieces, between two points (along x or z).
  wallLine(x0, z0, x1, z1, y) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const n = Math.max(1, Math.round(L / 10)), k = L / (n * 10);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      piece(this, 'plaster_wall', x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, alongX ? '+z' : '+x', { scale: 1 });
      void k;
    }
  }

  // Straight stone stairs along z, climbing from y0 (at z0) to y1 (at z1).
  stairs(x, z0, z1, y0, y1, width, mat) {
    const n = Math.ceil((y1 - y0) / 0.5), run = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const top = y0 + ((y1 - y0) * (i + 1)) / n, zc = z0 + run * (i + 0.5);
      this.block(x, top, zc, width, top - y0 + 0.5, Math.abs(run) + 0.02, 0, { material: mat, outline: 0, blockCamera: false });
    }
  }

  // ---------------------------------------------------------------- town blocks
  buildTown() {
    const r = this.rand;
    const kinds = ['house_dark', 'house_white', 'house_shop', 'house_wide', 'house_dark', 'house_shop'];
    const lanternColors = [0xe0303a, 0xfff1d6, 0xff8a3a];
    let lanterns = 0;
    this.houses = [];
    // A row of houses along one edge of a block. The fronts face `face`.
    const row = (a0, a1, fixed, face, { gapEvery = 22 } = {}) => {
      let a = a0 + 0.3, sinceGap = 0;
      while (true) {
        const name = kinds[Math.floor(r() * kinds.length)];
        const f = footprint(name);
        if (a + f.w > a1 - 0.3) break;
        if (sinceGap > gapEvery && a1 - a > 10) { a += 3.2; sinceGap = 0; continue; }    // an alley
        const c = a + f.w / 2;
        const along = face === '+z' || face === '-z';
        const off = (face === '+z' || face === '+x') ? -f.d / 2 : f.d / 2;
        const x = along ? c : fixed + off, z = along ? fixed + off : c;
        piece(this, name, x, CITY_Y, z, face);
        this.houses.push({ x, z, face, name });
        // Some houses hang a lantern by the door.
        if (r() < 0.35 && lanterns < 70) {
          const [fx, fz] = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] }[face];
          const fx2 = x + fx * (f.d / 2 + 1.3), fz2 = z + fz * (f.d / 2 + 1.3);
          const side = (r() < 0.5 ? -1 : 1) * 1.4;
          paperLantern(this, fx2 + (fz ? side : 0), CITY_Y + 2.45, fz2 + (fx ? side : 0), lanternColors[lanterns % 3], 0.75, lanterns % 2 === 0);
          lanterns++;
        }
        a += f.w + 0.25; sinceGap += f.w;
      }
    };
    // Each block: [x0, x1, z0, z1, which edges get houses]
    const blocks = [
      [6, 42, 14, 42, 'nsew'], [-42, -6, 14, 42, 'nsew'], [50, 88, 14, 42, 'nsew'], [-88, -50, 14, 42, 'nsew'],
      [6, 42, 50, 80, 'nsew'], [50, 88, 50, 80, 'nsew'], [-88, -50, 50, 80, 'nsew'],
      [6, 42, 88, 96.5, 'n'], [-42, -6, 88, 96.5, 'n'], [50, 88, 88, 96.5, 'n'], [-88, -50, 88, 96.5, 'n'],
      [6, 42, 103.5, 120, 'sew'], [-42, -6, 103.5, 120, 'sew'], [50, 88, 103.5, 120, 'sew'], [-88, -50, 103.5, 120, 'sew'],
    ];
    for (const [x0, x1, z0, z1, edges] of blocks) {
      const depth = 8.6;
      if (edges.includes('n')) row(x0, x1, z0, '-z');
      if (edges.includes('s')) row(x0, x1, z1, '+z');
      const za = edges.includes('n') ? z0 + depth : z0 + 1, zb = edges.includes('s') ? z1 - depth : z1 - 1;
      if (edges.includes('w') && zb - za > 8) row(za, zb, x0, '-x');
      if (edges.includes('e') && zb - za > 8) row(za, zb, x1, '+x');
    }
    // Merchant halls facing the avenue / Market Street in the middle-east block.
    // (That block's houses already line it; two big halls stand in its courtyard.)
    piece(this, 'merchant_hall', 24, CITY_Y, 66, '-z');
    piece(this, 'storehouse', 20, CITY_Y, 28, '+z');
    piece(this, 'storehouse', 28, CITY_Y, 28, '+z');

    // Castle Avenue: lamp posts with strings of lanterns across the street, and banners.
    for (let z = 20; z <= 116; z += 12) {
      if (Math.abs(z - 46) < 5 || Math.abs(z - 84) < 5 || Math.abs(z - CANAL_Z) < 6) continue;
      const a = lampPost(this, -3.8, z, CITY_Y, 4.6, 0xffd9a0);
      const b = lampPost(this, 3.8, z, CITY_Y, 4.6, 0xffd9a0);
      lanternString(this, new THREE.Vector3(a.x, a.y + 0.4, a.z), new THREE.Vector3(b.x, b.y + 0.4, b.z), 4, z % 24 ? 0xe0303a : 0xff8a3a);
    }
    for (let z = 16; z <= 118; z += 8) {
      if (Math.abs(z - 46) < 5 || Math.abs(z - 84) < 5 || Math.abs(z - CANAL_Z) < 6) continue;
      if (z % 16) banner(this, -4.3, z + 4, CITY_Y, 0x24386a, 5); else banner(this, 4.3, z + 4, CITY_Y, 0xb8222a, 5);
    }
    // Gems down the avenue and along the streets.
    for (let z = 20; z <= 116; z += 9) this.gem(z % 2 ? 1.8 : -1.8, CITY_Y, z);
    for (let x = -84; x <= 84; x += 12) if (Math.abs(x) > 8) this.gem(x, CITY_Y, 46);
  }

  // ---------------------------------------------------------------- market square + fire tower
  buildMarket() {
    const M = { x: -24, z: 65 };
    // Stalls in rows around a big cherry tree.
    const stalls = [[-36, 56, '+z'], [-30, 56, '+z'], [-18, 56, '+z'], [-12, 56, '+z'],
      [-36, 75, '-z'], [-30, 75, '-z'], [-18, 75, '-z'], [-12, 75, '-z'], [-39, 65.5, '+x'], [-9, 65.5, '-x']];
    for (const [x, z, f] of stalls) piece(this, 'market_stall', x, CITY_Y, z, f);
    cherryTree(this, M.x - 4, M.z, CITY_Y, { scale: 1.3 });
    for (const [x, z] of [[-40, 52], [-8, 52], [-40, 78], [-8, 78]]) stoneLantern(this, x, z, CITY_Y, 1);
    for (const z of [53, 77]) {
      lanternString(this, new THREE.Vector3(-40, CITY_Y + 4.2, z), new THREE.Vector3(-8, CITY_Y + 4.2, z), 8, 0xe0303a);
      for (const x of [-40, -8]) this.pillar(x, z, 0.1, CITY_Y, CITY_Y + 4.3, 0, null, { segments: 6, material: pbr('darkWood'), blockCamera: false });
    }
    // Fire-watch tower: stairs wrap around the outside up to the lookout. Crown Jewel on top.
    const T = { x: M.x + 9, z: M.z };
    piece(this, 'fire_tower', T.x, CITY_Y, T.z, '+z', { collide: false });
    const top = CITY_Y + 12, wood = pbr('hinoki', { tint: 0xc8a070 });
    this.block(T.x, top + 0.1, T.z, 4.2, 0.3, 4.2, 0, { invisible: true });
    let lastSide = 0;
    for (let i = 0, y = CITY_Y; y < top - 0.05; i++) {
      // Walk around the square tower: each step 0.42 higher, on the outside of the frame.
      const t = i * 0.9, side = Math.floor(t / 4.4) % 4, u = (t % 4.4) - 2.2;
      const R = 2.85;
      const [x, z] = [[T.x + u, T.z + R], [T.x + R, T.z - u], [T.x - u, T.z - R], [T.x - R, T.z + u]][side];
      y = Math.min(top, y + 0.42);
      this.block(x, y, z, side % 2 ? 1.0 : 1.4, 0.25, side % 2 ? 1.4 : 1.0, 0, { material: wood, outline: 0, blockCamera: false });
      if (i % 3 === 0) this.pillar(x, z, 0.06, CITY_Y, y, 0, null, { segments: 5, material: pbr('darkWood'), blockCamera: false });
      lastSide = side;
    }
    // Railings around the lookout, open on the side where the stairs arrive.
    const rails = [[0, 2.05, 4.2, 0.15], [2.05, 0, 0.15, 4.2], [0, -2.05, 4.2, 0.15], [-2.05, 0, 0.15, 4.2]];
    rails.forEach(([dx, dz, w, d], side) => { if (side !== lastSide) this.solidBox(T.x + dx, top + 1.2, T.z + dz, w, 1.1, d); });
    this.towerTop = { x: T.x, y: top, z: T.z, lastSide };
    this.jewel(T.x, top + 0.1, T.z, 'Fire Watchtower');
  }

  // ---------------------------------------------------------------- canal, bridges, boat
  buildCanal() {
    const stone = pbr('cobble', { tint: 0xbfb8ac, tile: 2.6 });
    for (const sz of [-1, 1]) this.block(0, CITY_Y + 0.1, CANAL_Z + sz * (CANAL_W + 0.6), CANAL_X * 2, 6, 1.2, 0, { material: stone, outline: 0, blockCamera: false });
    for (const sx of [-1, 1]) this.block(sx * (CANAL_X + 0.6), CITY_Y + 0.1, CANAL_Z, 1.2, 6, CANAL_W * 2 + 2.4, 0, { material: stone, outline: 0 });
    for (const x of [0, -46, 46, -92, 92]) {
      if (Math.abs(x) > 90) continue;
      archBridge(this, x, CANAL_Z + CANAL_W + 1.5, CANAL_Z - CANAL_W - 1.5, CITY_Y + 0.15, { width: x ? 4 : 7, rise: 1.5, color: x ? 0x6b4a2e : 0xb02a22 });
    }
    // Stone landing steps down to the water.
    for (const x of [-24, 24, -68, 68]) {
      this.block(x, 1.7, CANAL_Z - CANAL_W + 0.8, 3, 4, 1.6, 0, { material: stone, outline: 0, blockCamera: false });
      this.block(x, 1.05, CANAL_Z - CANAL_W + 1.9, 3, 3.5, 0.8, 0, { material: stone, outline: 0, blockCamera: false });
    }
    // Willow-like cherry trees along the canal.
    for (let x = -84; x <= 84; x += 14) {
      if (Math.abs(x) < 10 || Math.abs(Math.abs(x) - 46) < 6) continue;
      cherryTree(this, x, CANAL_Z - CANAL_W - 3.2, CITY_Y, { scale: 0.75, colors: [0xffc8dc, 0xffb0cc, 0xffe0ec] });
    }
    // A boat drifting up and down the canal, with a Crown Jewel aboard.
    // A full trip there and back takes 2.5 minutes: a slow drift (about 2 m/s).
    const boat = this.mover(new THREE.Vector3(-80, 0.75, CANAL_Z), new THREE.Vector3(80, 0.75, CANAL_Z), 150, 4.0, 1.6, 0x8a5a33);
    boat.mesh.material = new THREE.MeshBasicMaterial({ visible: false });
    const model = piece(this, 'boat', 0, 0, 0, '+z', { collide: false });
    this.root.remove(model);
    model.position.set(0, -0.1, 0);
    boat.mesh.add(model);
    boat.mesh.userData.dynamic = true;
    const lantern = paperLantern(this, 0, 0, 0, 0xff8a3a, 0.6, false);
    this.root.remove(lantern);
    lantern.position.set(1.6, 1.5, 0);
    boat.mesh.add(lantern);
    const j = this.jewel(-80, 0.75, CANAL_Z, 'Canal Boat');
    this.onUpdate(() => j.position.set(boat.cur.x - 0.6, boat.cur.y + 1.1, boat.cur.z));
  }

  // ---------------------------------------------------------------- Gate of the Five Peaks
  buildShrine(levels, progress) {
    const S = SHRINE, px = -74;
    // A path of torii gates leading north between the portals.
    for (let z = -4; z >= -64; z -= 10) torii(this, px, z, this.terrainHeight(px, z), { span: 5, h: 5, color: 0xd8342a, axis: 'x' });
    const spots = [[-1, -14], [1, -28], [-1, -42], [1, -56], [-1, -70]];
    levels.forEach((lv, i) => {
      const [side, z] = spots[i];
      const x = px + side * 9;
      const facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;      // facing the path
      portal(this, x, z, this.terrainHeight(x, z), { id: lv.id, name: lv.name, color: lv.color, done: progress.stars.includes(lv.id), facing });
      stoneLantern(this, x + side * -2.2, z - 3.2, this.terrainHeight(x - side * 2.2, z - 3.2), 1, lv.color);
      stoneLantern(this, x + side * -2.2, z + 3.2, this.terrainHeight(x - side * 2.2, z + 3.2), 1, lv.color);
    });
    // Big stone lanterns and cherry trees around the grounds.
    for (let z = -10; z >= -84; z -= 16) {
      cherryTree(this, S.x0 + 6, z, this.terrainHeight(S.x0 + 6, z), { scale: 1.1 });
      cherryTree(this, S.x1 - 4, z - 6, this.terrainHeight(S.x1 - 4, z - 6), { scale: 0.9 });
    }
    // A shrine hall at the end of the path.
    piece(this, 'temple_hall', px, CITY_Y, -84 + 6, '+z', { scale: 0.7 });
    this.portalCenter = { x: px, z: -40 };
    for (let z = -8; z >= -80; z -= 8) this.gem(px, CITY_Y, z);
  }

  // ---------------------------------------------------------------- temple grounds
  buildTemple() {
    const T = TEMPLE, tx = 74;
    torii(this, tx, -4, CITY_Y, { span: 7, h: 7, color: 0xc8301e, axis: 'x' });
    piece(this, 'temple_hall', tx, CITY_Y, -62, '+z');
    for (const sx of [-1, 1]) {
      for (const z of [-16, -30, -44]) stoneLantern(this, tx + sx * 4, z, CITY_Y, 1.2);
    }
    // Five-storey pagoda; its eaves can be climbed. Crown Jewel on top.
    const pg = pagoda(this, 58, -26, CITY_Y, { tiers: 5, half: 3.6, shrink: 0.45, tierH: 1.6, firstH: 2.8, wall: 0x8a3a2a, roof: 0x3a4044, steps: '+x', lanterns: 0xffa060 });
    this.jewel(58 + 1.0, pg.top, -26, 'Pagoda Top');
    for (let z = -8; z >= -84; z -= 14) {
      cherryTree(this, T.x1 - 5, z, this.terrainHeight(T.x1 - 5, z), { scale: 1.0 });
    }
    // Storehouses with a stack of crates: climb onto the roofs for the last Crown Jewel.
    const K = { x: 86, z: 60 };
    void K;
    const crate = pbr('hinoki', { tint: 0xb89060 });
    const sx = 69, sz = 65;                                           // courtyard of the east-middle block
    piece(this, 'storehouse', sx, CITY_Y, sz, '+z');
    const route = [[sx - 5.8, sz + 5.5, 1.0], [sx - 6.3, sz + 3.5, 2.0], [sx - 6.3, sz + 1.5, 3.0], [sx - 5.6, sz - 0.2, 4.0], [sx - 4.1, sz - 0.2, 5.0]];
    for (const [x, z, h] of route) this.block(x, CITY_Y + h, z, 1.5, h, 1.5, 0, { material: crate, outline: 0 });
    this.jewel(sx, CITY_Y + 6.5, sz, 'Storehouse Roof');
  }

  // ---------------------------------------------------------------- people
  buildPeople() {
    const C = CASTLE, isl = C.z + MOAT_IN - 0.5;
    // Samurai guards at the bridge and the gate.
    for (const sx of [-1, 1]) {
      npc(this, 'samurai', C.x + sx * 3.6, CITY_Y, C.z + MOAT_OUT + 2.5, { facing: 0, height: 1.95 });
      npc(this, 'samurai', C.x + sx * 3.2, ISLAND_Y, isl + 0.4, { facing: 0, height: 1.95 });
    }
    // The King waits in the castle courtyard in front of the keep.
    npc(this, 'king', KEEP.x, HON_Y, KEEP.z + 18, { facing: 0, height: 1.6 });
    // Samurai patrols walking the streets (fewer on Low quality).
    const g = this.ground;
    if (qualityName() === 'low') {
      npc(this, 'samurai', -3, CITY_Y, 20, { path: [{ x: -3, z: 20 }, { x: -3, z: 118 }], ground: g, speed: 1.4 });
      return;
    }
    npc(this, 'samurai', -3, CITY_Y, 20, { path: [{ x: -3, z: 20 }, { x: -3, z: 118 }], ground: g, speed: 1.4 });
    npc(this, 'samurai', 3, CITY_Y, 112, { path: [{ x: 3, z: 112 }, { x: 3, z: 18 }], ground: g, speed: 1.3 });
    npc(this, 'samurai', -80, CITY_Y, 46, { path: [{ x: -80, z: 46 }, { x: 80, z: 46 }], ground: g, speed: 1.5 });
    npc(this, 'samurai', 46, CITY_Y, 110, { path: [{ x: 46, z: 110 }, { x: 46, z: 20 }, { x: -46, z: 20 }, { x: -46, z: 110 }], ground: g, speed: 1.4 });
    npc(this, 'samurai', -74, CITY_Y, -6, { path: [{ x: -74, z: -6 }, { x: -74, z: -78 }], ground: g, speed: 1.1 });
  }

  // ---------------------------------------------------------------- trees, grass, petals
  buildNature() {
    // Cherry trees in the plaza in front of the moat.
    for (let x = -88; x <= 88; x += 13) {
      if (Math.abs(x) < 9) continue;
      cherryTree(this, x, 4.5, CITY_Y, { scale: 0.9 + (Math.abs(x) % 3) * 0.1 });
    }
    // Pine-like trees on the hills around the town.
    const spots = [];
    for (let tries = 0; tries < 9000 && spots.length < 520; tries++) {
      const x = (this.rand() * 2 - 1) * 180, z = (this.rand() * 2 - 1) * 180;
      const h = this.terrainHeight(x, z);
      if (h < 4 || Math.abs(x) < 100 && z > -96 && z < 132) continue;
      spots.push({ x, z, h, s: 0.9 + this.rand() * 0.9, hue: this.rand() });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6).translate(0, 1.1, 0);
    const leafGeo = new THREE.ConeGeometry(1.5, 3.6, 7).translate(0, 3.6, 0);
    const mats = [], cols = [];
    const a = new THREE.Color(0x3a6a3a), b = new THREE.Color(0x2a4a30);
    for (const t of spots) {
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.h - 0.1, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.hue * 6), new THREE.Vector3(t.s, t.s * (0.9 + t.hue * 0.4), t.s)));
      cols.push(a.clone().lerp(b, t.hue));
    }
    this.instanced(worldUV(trunkGeo), pbr('bark'), mats);
    this.instanced(leafGeo, solid(0xffffff, { rough: 0.9 }), mats, { colors: cols });
    // Grass tufts in the castle grounds and the shrine/temple grounds.
    grassField(this, 5000, { x0: -96, x1: 96, z0: -92, z1: 2 }, (x, z) => {
      const y = this.terrainHeight(x, z);
      if (y < 2.4 || onStreet(x, z, 1) || Math.abs(x + 74) < 4 || Math.abs(x - 74) < 4) return null;
      const sq = Math.max(Math.abs(x - CASTLE.x), Math.abs(z - CASTLE.z));
      if (sq > MOAT_IN - 2 && sq < MOAT_OUT + 2) return null;
      if (sq < 25) return null;
      return y;
    });
    // Drifting cherry petals.
    this.particles({ count: 500, box: { x0: -96, x1: 96, y0: 1, y1: 22, z0: -90, z1: 125 }, color: 0xffc8dc, size: 0.32, mode: 'fall', speed: 0.5, additive: false, opacity: 0.9, texture: petalTexture() });
  }
}
void fbm;
