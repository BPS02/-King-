import * as THREE from 'three';
import { noise, smooth, mix, rng } from './stage.js';
import { ASSETS, sampleDetail } from './assets.js';
import { pbr, solid } from './graphics.js';
import { glowSprite } from './toon.js';
import { torii, stoneLantern, jpRoof, roofMat, woodFor, paintMat } from './deco.js';

// ---------------------------------------------------------------------------------------------
// Mountain climb generator.
// A mountain is a steep cone (with Blender-made ridge/erosion detail). A route spirals up it:
//   - TRAIL sections: a walkable bench carved into the slope, rising gently.
//   - LEDGE sections: the slope is too steep to walk, so you jump up rock ledges (Blender rocks).
// Each ledge section ends at a checkpoint lantern. At the top: a shrine and a watchtower.
// ---------------------------------------------------------------------------------------------
export function buildMountain(s, cfg) {
  const {
    H = 70, R = 60, cx = 0, cz = 0, plateau = 12, p = 1.18, seed = 0, detailAmp = 7,
    startAngle = Math.PI / 2, dir = 1, trailSlope = 0.2, ledgeRise = [4.5, 7.5], trailRise = [6, 10],
    rockMat = pbr('mossRock', { tint: 0xc8c4bc, tile: 1.6 }), ledge = null, baseHeight = null,
    onTrail = null, rockSet = ['ledge_wide', 'ledge_round', 'ledge_tall', 'ledge_slab'],
  } = cfg;
  const rand = rng(seed * 977 + 13);
  const Rp = R - plateau;
  const profile = (r) => (r <= plateau ? H : r >= R ? 0 : H * Math.pow(1 - (r - plateau) / Rp, p));
  const rOf = (y) => plateau + Rp * (1 - Math.pow(Math.min(1, Math.max(0, y / H)), 1 / p));
  const polar = (r, th) => new THREE.Vector3(cx + Math.cos(th) * r, 0, cz + Math.sin(th) * r);

  // ---- 1. Plan the route: alternate trail and ledge sections up to the summit. ----
  const segs = [];
  let y = 0, th = startAngle;
  while (y < H - 0.01) {
    const dy = Math.min(H - y, mix(trailRise[0], trailRise[1], rand()));
    const rMid = rOf(y + dy / 2);
    const dth = Math.min(1.7, dy / trailSlope / Math.max(rMid, 8)) * dir;
    segs.push({ type: 'trail', y0: y, y1: y + dy, th0: th, th1: th + dth });
    y += dy; th += dth;
    if (y >= H - 0.01) break;
    const ly = Math.min(H - y - 3, mix(ledgeRise[0], ledgeRise[1], rand()));
    if (ly < 2.5) continue;
    segs.push({ type: 'ledge', y0: y, y1: y + ly, th0: th, th1: th + 0.12 * dir });
    y += ly; th += 0.12 * dir;
  }
  // Dense sample points along trails (for carving the bench into the slope).
  const trailPts = [];
  for (const g of segs) {
    if (g.type !== 'trail') continue;
    const r0 = rOf(g.y0), len = Math.abs(g.th1 - g.th0) * r0 + (g.y1 - g.y0) * 3;
    const n = Math.max(4, Math.ceil(len / 0.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n, yy = mix(g.y0, g.y1, t), pt = polar(rOf(yy), mix(g.th0, g.th1, t));
      pt.y = yy;
      trailPts.push(pt);
    }
  }
  // Ledge climb lines too (the rugged detail is calmed there so rocks aren't buried).
  const ledgePts = [];
  for (const g of segs) {
    if (g.type !== 'ledge') continue;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, yy = mix(g.y0, g.y1, t), pt = polar(rOf(yy) + 1.6, mix(g.th0, g.th1, t));
      pt.y = yy;
      ledgePts.push(pt);
    }
  }
  // Spatial hashes so terrain carving stays fast.
  const CELL = 4;
  const makeGrid = (pts) => {
    const grid = new Map();
    for (const pt of pts) { const k = Math.floor(pt.x / CELL) + ',' + Math.floor(pt.z / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(pt); }
    return (x, z) => {
      let best = null, bd = Infinity;
      const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const list = grid.get((gx + i) + ',' + (gz + j));
        if (!list) continue;
        for (const pt of list) { const d = (pt.x - x) ** 2 + (pt.z - z) ** 2; if (d < bd) { bd = d; best = pt; } }
      }
      return best ? { pt: best, d: Math.sqrt(bd) } : null;
    };
  };
  const nearestTrail = makeGrid(trailPts);
  const nearestRoute = makeGrid([...trailPts, ...ledgePts]);

  // ---- 2. Terrain height: cone + Blender detail, with the trail bench carved in. ----
  const outside = baseHeight || ((x, z) => (noise(x * 0.05, z * 0.05) - 0.5) * 1.2);
  const natural = (x, z) => {
    const r = Math.hypot(x - cx, z - cz);
    const near = nearestRoute(x, z);
    const calm = near ? smooth(4, 9, near.d) : 1;                       // keep the route itself clean
    const rugged = smooth(R + 4, R - 6, r) * smooth(plateau - 2, plateau + 6, r) * calm;
    const det = (sampleDetail(seed, x - cx, z - cz, 200) - 0.5) * 2 * detailAmp * rugged;
    const cone = profile(r);
    // Past the foot, the surrounding land takes over (it may drop away, e.g. into clouds).
    return r >= R ? outside(x, z) + det * 0.3 : Math.max(cone, outside(x, z)) + det;
  };
  s.mountainHeight = (x, z) => {
    const h = natural(x, z), near = nearestTrail(x, z);
    if (!near || near.d > 4.2) return h;
    return mix(near.pt.y, h, smooth(2.0, 4.2, near.d));                 // 4 m wide walkable bench
  };
  s.trailDistance = (x, z) => { const n = nearestTrail(x, z); return n ? n.d : 99; };
  s.routeDistance = (x, z) => { const n = nearestRoute(x, z); return n ? n.d : 99; };   // trails + ledge climbs

  // Info the level and HUD use.
  const summit = new THREE.Vector3(cx, H, cz);
  const first = segs[0];
  const startPos = polar(rOf(0) + 2, first.th0);
  s.mountain = { H, R, cx, cz, segs, summit, rOf, polar, profile };

  // ---- 3. After the terrain exists: ledges, checkpoints, summit. Levels call build(). ----
  const build = () => {
    s.checkpoints = s.checkpoints || [];
    const standPoints = [];   // every place you stand on, in climbing order (for the reachability check)
    for (const g of segs) {
      if (g.type === 'trail') {
        const n = Math.max(2, Math.ceil(Math.abs(g.th1 - g.th0) * rOf(g.y0) / 12));
        for (let i = 0; i <= n; i++) {
          const t = i / n, yy = mix(g.y0, g.y1, t), thh = mix(g.th0, g.th1, t), r = rOf(yy);
          const pt = polar(r, thh); pt.y = yy;
          standPoints.push({ pos: pt, r: 1.8, kind: 'trail' });
          if (onTrail && i < n) {
            const out = new THREE.Vector3(Math.cos(thh), 0, Math.sin(thh));
            onTrail(s, pt, out, t, g);
          }
          if (i > 0 && i % 2 === 0) s.gem(pt.x, yy, pt.z);
        }
        continue;
      }
      // Ledge section: rocks zig-zag up the cliff, each a jump higher.
      const dy = g.y1 - g.y0, n = Math.max(2, Math.ceil(dy / 1.15));
      for (let k = 1; k < n; k++) {
        const t = k / n, yy = g.y0 + dy * t, thh = mix(g.th0, g.th1, t), r = rOf(yy);
        const side = k % 2 ? 1 : -1;
        const out = new THREE.Vector3(Math.cos(thh), 0, Math.sin(thh));
        const tan = new THREE.Vector3(-Math.sin(thh), 0, Math.cos(thh));
        const pos = polar(r, thh).addScaledVector(out, 1.6).addScaledVector(tan, side * 1.35);
        const placed = (ledge || rockLedge)(s, pos.x, pos.z, yy, k, { rand, rockMat, rockSet });
        standPoints.push({ pos: new THREE.Vector3(pos.x, yy, pos.z), r: placed.radius, kind: 'ledge' });
        if (k === n - 1 && rand() < 0.7) s.gem(pos.x, yy, pos.z);
      }
      // Checkpoint lantern where the ledge climb ends.
      const end = polar(rOf(g.y1) - 1.2, g.th1);
      checkpoint(s, end.x, g.y1, end.z);
    }
    const last = segs[segs.length - 1];
    buildSummit(s, summit, last.th1, plateau);
    standPoints.push({ pos: summit.clone(), r: 6, kind: 'summit' });
    s.climbCheck = validateRoute(standPoints);
    scatterRocks(s, cfg, nearestTrail, rand);
    farMountains(s, cfg.farColor ?? 0x9aa6b8, cfg.farHaze ?? 0.5, cx, cz, seed);
  };

  s.summitY = H + WATCHTOWER_H;
  s.spawn.set(startPos.x, 0, startPos.z);
  s.spawnFacing = Math.atan2(-Math.sin(first.th0) * dir, Math.cos(first.th0) * dir);   // face along the trail
  s.bounds = { x: cx, z: cz, r: R + 38 };
  s.map = { ...s.map, x: cx, z: cz, size: (R + 40) * 2 };
  return { build, segs, startPos };
}

// A flat-topped Blender rock whose top sits at `top`.
export function rockLedge(s, x, z, top, k, { rand, rockMat, rockSet }) {
  const name = rockSet[Math.floor(rand() * rockSet.length)];
  const geo = ASSETS.rocks[name], info = ASSETS.rockInfo[name];
  const ground = s.terrainHeight(x, z) - 0.5;
  const hgt = Math.max(0.6, top - ground);
  const sxz = 0.95 + rand() * 0.3;
  const m = new THREE.Mesh(geo, rockMat);
  m.scale.set(sxz, hgt / info.height, sxz);
  m.position.set(x, ground, z);
  m.rotation.y = rand() * Math.PI * 2;
  m.castShadow = m.receiveShadow = true;
  s.add(m);
  const radius = Math.max(0.8, info.radius * sxz * 0.85);
  s.solidCyl(x, z, radius, ground, top);
  return { radius };
}

// Stone lantern checkpoint: lights up when you reach it and becomes your respawn point.
function checkpoint(s, x, y, z) {
  stoneLantern(s, x, z, y, 0.9, 0xffc870);
  const flame = glowSprite(0xffb050, 3.2, 0.9);
  flame.position.set(x, y + 1.45, z);
  flame.visible = false;
  flame.userData.dynamic = true;
  s.add(flame);
  s.checkpoints.push({ pos: new THREE.Vector3(x, y, z), done: false, flame });
}

// ---- Summit: a small mountain shrine (hokora) and a wooden watchtower (yagura). ----
export const WATCHTOWER_H = 6;
function buildSummit(s, c, arrive, plateau) {
  const g = c.y;
  const ax = Math.cos(arrive), az = Math.sin(arrive);
  // Shrine gate where the trail arrives, its beam across the path.
  const gx = c.x + ax * (plateau - 2), gz = c.z + az * (plateau - 2);
  torii(s, gx, gz, g, { span: 3.4, h: 3.6, color: 0xc0301e, axis: Math.abs(ax) > Math.abs(az) ? 'z' : 'x' });
  stoneLantern(s, c.x + ax * (plateau - 4.5) - az * 2.4, c.z + az * (plateau - 4.5) + ax * 2.4, g, 0.9);
  stoneLantern(s, c.x + ax * (plateau - 4.5) + az * 2.4, c.z + az * (plateau - 4.5) - ax * 2.4, g, 0.9);
  // Stairs run out from the tower along the axis that points away from the gate.
  const useX = Math.abs(az) >= Math.abs(ax);           // gate mostly north/south -> stairs along x
  const sd = useX ? (ax >= 0 ? -1 : 1) : (az >= 0 ? -1 : 1);
  const S = useX ? new THREE.Vector3(sd, 0, 0) : new THREE.Vector3(0, 0, sd);
  // Hokora: little wooden shrine on a stone base, with a sacred rope (opposite the stairs).
  const hx = c.x - S.x * 6 + (useX ? 0 : 3), hz = c.z - S.z * 6 + (useX ? 3 : 0);
  s.block(hx, g + 0.6, hz, 2.2, 0.9, 2.2, 0, { material: pbr('mossRock', { tint: 0xc8c4bc, tile: 1.2 }) });
  s.block(hx, g + 1.9, hz, 1.4, 1.3, 1.2, 0, { material: pbr('darkWood') });
  const hr = jpRoof(2.0, 1.8, 0.9, 0x6a5040);
  hr.position.set(hx, g + 1.9, hz);
  s.add(hr);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 24, Math.PI), solid(0xd8c89a, { rough: 0.9 }));
  rope.position.set(hx, g + 1.75, hz + 0.62);
  rope.rotation.z = Math.PI;
  s.add(rope);
  for (const dx of [-0.35, 0, 0.35]) {   // shide: white paper streamers
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.01), solid(0xffffff, { rough: 0.9 }));
    paper.position.set(hx + dx, g + 1.38 + Math.abs(dx) * 0.4, hz + 0.66);
    s.add(paper);
  }
  // Yagura: a log watchtower in the middle of the summit.
  const tx = c.x, tz = c.z, top = g + WATCHTOWER_H, half = 2.1;
  const log = pbr('bark', { tint: 0xb8a088 });
  for (const [ix, iz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    s.pillar(tx + ix * half, tz + iz * half, 0.2, g - 0.5, top + 2.6, 0, null, { segments: 10, material: log, blockCamera: false });
  for (const yy of [g + 1.8, g + 3.9]) for (const [bx, bz, w, d] of [[0, half, half * 2, 0.16], [0, -half, half * 2, 0.16], [half, 0, 0.16, half * 2], [-half, 0, 0.16, half * 2]]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), log);
    brace.position.set(tx + bx, yy, tz + bz);
    s.add(brace);
  }
  s.block(tx, top, tz, half * 2 + 0.6, 0.3, half * 2 + 0.6, 0, { material: pbr('hinoki', { tint: 0xd8b890 }) });
  const roof = jpRoof(half * 2 + 2, half * 2 + 2, 1.8, 0x5a4a3a);
  roof.position.set(tx, top + 2.6, tz);
  s.add(roof);
  // Stairs: low wooden steps (walkable without jumping) from the ground up to the platform edge.
  const steps = Math.ceil(WATCHTOWER_H / 0.55), run = 0.62;
  const side = useX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const stepMat = pbr('hinoki', { tint: 0xc8a880 });
  for (let i = 1; i <= steps; i++) {
    const sy = g + (WATCHTOWER_H * i) / steps;
    const dist = half + 0.3 + (steps - i) * run + run / 2;
    const p = new THREE.Vector3(tx, 0, tz).addScaledVector(S, dist).addScaledVector(side, half - 0.6);
    s.block(p.x, sy, p.z, useX ? run + 0.02 : 1.2, 0.25, useX ? 1.2 : run + 0.02, 0, { material: stepMat, blockCamera: false });
  }
  // Railings on the platform (open on the stairs side).
  for (const [bx, bz, w, d] of [[0, half + 0.25, half * 2 + 0.5, 0.08], [0, -half - 0.25, half * 2 + 0.5, 0.08], [half + 0.25, 0, 0.08, half * 2 + 0.5], [-half - 0.25, 0, 0.08, half * 2 + 0.5]]) {
    if ((useX && Math.sign(bx) === sd) || (!useX && Math.sign(bz) === sd)) continue;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), woodFor(0x6a4a30));
    rail.position.set(tx + bx, top + 0.9, tz + bz);
    s.add(rail);
    s.solidBox(tx + bx, top + 1.0, tz + bz, Math.max(w, 0.3), 1.0, Math.max(d, 0.3));   // railings stop you falling off
  }
  const foot = new THREE.Vector3(tx, g, tz).addScaledVector(S, half + 0.3 + steps * run + 1.2).addScaledVector(side, half - 0.6);
  s.towerStairs = { foot, dir: S.clone().negate() };
  s.jewel(tx, top, tz, 'Royal Star', { star: true });
  s.lightSpot(tx, top + 1.5, tz, 0xffd27a, 4, 10);
}

// Visual boulders and crags scattered over the slopes (kept away from the route).
function scatterRocks(s, cfg, nearestTrail, rand) {
  const { H, R, cx, cz } = s.mountain;
  const mat = cfg.rockMat || pbr('mossRock', { tint: 0xc8c4bc, tile: 1.6 });
  const kinds = ['boulder_a', 'boulder_b', 'crag', 'pebble'];
  const per = Object.fromEntries(kinds.map((k) => [k, []]));
  for (let i = 0, tries = 0; i < 160 && tries < 2000; tries++) {
    const a = rand() * Math.PI * 2, r = 10 + rand() * (R + 20);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const near = nearestTrail(x, z);
    if (near && near.d < 6) continue;
    const y = s.terrainHeight(x, z);
    if (y < (s.hazardY ?? -30) + 1) continue;
    const kind = kinds[Math.floor(rand() * (r > R ? 4 : 3))];
    const sc = (kind === 'pebble' ? 1.5 : 1) * (0.8 + rand() * 1.4) * (r > R ? 0.8 : 1);
    per[kind].push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.3, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6.3, 0)), new THREE.Vector3(sc, sc * (0.8 + rand() * 0.6), sc)));
    if (kind !== 'pebble' && r > R - 6) s.solidCyl(x, z, ASSETS.rockInfo[kind].radius * sc * 0.8, y - 1, y + ASSETS.rockInfo[kind].height * sc * 0.8);
    i++;
  }
  for (const k of kinds) if (per[k].length) s.instanced(ASSETS.rocks[k], mat, per[k]);
  void H;
}

// Blender-made snowy peaks ringing the horizon, softened by distance haze.
export function farMountains(s, color, haze, cx, cz, seed) {
  if (!ASSETS.peaks.length) return;
  const r = rng(seed * 31 + 5), fogCol = new THREE.Color(color);
  ASSETS.peaks.forEach((geo, gi) => {
    const g = geo.clone();
    const col = g.attributes.color;
    if (col) for (let i = 0; i < col.count; i++) {
      const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).lerp(fogCol, haze);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: !!col, roughness: 1, fog: false });
    const mats = [];
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2, d = 330 + r() * 120, w = 150 + r() * 120;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.cos(a) * d, -20, cz + Math.sin(a) * d),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6.3, 0)), new THREE.Vector3(w, 110 + r() * 90, w)));
    }
    const im = s.instanced(g, mat, mats, { shadow: false });
    im.receiveShadow = false;
    im.frustumCulled = false;
    void gi;
  });
}

// Checks that every step of the climb is a possible jump (rise and gap), and reports problems.
function validateRoute(points) {
  const problems = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.kind === 'trail' && (b.kind === 'trail' || b.kind === 'summit')) continue;   // walking on the ground
    const rise = b.pos.y - a.pos.y;
    const gap = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) - a.r - b.r;
    if (rise > 1.7 || gap > 2.8) problems.push({ i, rise: +rise.toFixed(2), gap: +gap.toFixed(2), from: a.kind, to: b.kind });
  }
  return { steps: points.length, problems };
}
void paintMat; void roofMat;
