import * as THREE from 'three';
import { addOutline } from './toon.js';
import { solid } from './graphics.js';

// Realistic materials: polished steel, lacquer (glossy clear coat), gold fittings, silk wrap.
const STEEL = () => solid(0xb8c0c8, { metal: 1, rough: 0.3 });
const GOLD = () => solid(0xd9a441, { metal: 1, rough: 0.28 });
const LACQUER = (c) => solid(c, { rough: 0.35, clearcoat: 1 });
const SILK = (c) => solid(c, { rough: 0.85 });

// Hand-held props for the hero. Sizes are in meters (world units).
// Each prop's origin is where the hand grips it, so it can be attached straight to a hand/arm bone.

// Katana: slightly curved blade along +Y, handle below the grip, round guard (tsuba).
export function makeKatana() {
  const g = new THREE.Group();
  const steel = STEEL();
  const blade = new THREE.Shape();
  const L = 0.78, W = 0.042, bend = 0.035;
  blade.moveTo(0, 0);
  for (let i = 1; i <= 10; i++) { const t = i / 10; blade.lineTo(-bend * t * t, L * t); }
  blade.lineTo(-bend + W * 0.2, L + 0.05);               // pointed tip
  for (let i = 10; i >= 0; i--) { const t = i / 10; blade.lineTo(-bend * t * t + W * (1 - t * 0.35), L * t); }
  const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.014, bevelEnabled: false });
  bladeGeo.translate(-W / 2, 0.15, -0.007);
  g.add(addOutline(new THREE.Mesh(bladeGeo, steel), 0.004));

  const handle = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.27, 12), LACQUER(0x14101a)), 0.004);
  handle.position.y = 0.005;
  g.add(handle);
  for (let i = 0; i < 5; i++) {   // diamond wrapping on the handle
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, 6, 12), SILK(0x7a1420));
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = -0.1 + i * 0.05;
    g.add(wrap);
  }
  const guard = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24), GOLD()), 0.004);
  guard.position.y = 0.145;
  g.add(guard);
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), GOLD());
  pommel.position.y = -0.135;
  g.add(pommel);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Round lacquered shield with a gold rim and a gold crest. Faces +Z; origin is the arm strap.
export function makeShield() {
  const g = new THREE.Group();
  const R = 0.3;
  const body = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.035, 48), LACQUER(0x0e0a0c)), 0.008);
  body.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 8, 48), GOLD());
  rim.position.z = 0.012;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), GOLD());
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.017;
  // Crest: five gold petals around the boss.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), GOLD());
    petal.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.019);
    g.add(petal);
  }
  g.add(body, rim, boss);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
