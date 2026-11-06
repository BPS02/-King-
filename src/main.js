import * as THREE from 'three';
import { Input } from './input.js';
import { Player } from './player.js';
import { Minimap } from './minimap.js';
import { Hub } from './levels/hub.js';
import { LEVELS } from './levels/index.js';

// --- Renderer, camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);
const input = new Input(renderer.domElement);
const player = new Player(scene);
const $ = (id) => document.getElementById(id);

// --- Saved progress (stays in this browser) ---
const SAVE_KEY = 'kingdom-progress-v1';
const progress = Object.assign({ jewels: [], stars: [] }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
const save = () => localStorage.setItem(SAVE_KEY, JSON.stringify(progress));

// --- HUD helpers ---
let toastTimer = 0;
function toast(text, seconds = 3) {
  $('toast').textContent = text;
  $('toast').style.opacity = 1;
  toastTimer = seconds;
}
function banner(text) {
  $('banner').textContent = text || '';
  $('banner').style.display = text ? 'block' : 'none';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fade(on) {
  $('fade').style.opacity = on ? 1 : 0;
  await sleep(450);
}

// --- Stage management ---
let stage = null, current = null, minimap = null, busy = false, gemCount = 0;
const cam = { yaw: 0, pitch: 0.3, dist: 8, curDist: 8, target: new THREE.Vector3() };

function updateHud() {
  const gems = `<div class="small">Gems: ${gemCount} / ${stage.gems.length}</div>`;
  if (current === 'hub') {
    $('hud').innerHTML = `<div>Crown Jewels: ${progress.jewels.length} / ${stage.jewels.length}</div>` +
      `<div>Royal Stars: ${progress.stars.length} / ${LEVELS.length}</div>` + gems;
    $('help2').textContent = 'Walk into a glowing portal to enter a level';
  } else {
    $('hud').innerHTML = `<div>${stage.title}</div>` + gems + '<div class="small">Find the Royal Star!</div>';
    $('help2').textContent = 'Esc: back to the Kingdom';
  }
}

async function enter(id, { from = null } = {}) {
  busy = true;
  if (stage) await fade(true);
  banner('');
  if (stage) stage.dispose();
  if (id === 'hub') {
    stage = new Hub(scene, LEVELS, progress);
  } else {
    stage = new (LEVELS.find((l) => l.id === id).Stage)(scene);
  }
  current = id;
  gemCount = 0;
  const back = id === 'hub' && from ? stage.portalSpawn(from) : null;
  player.setLevel(stage, back?.spawn, back?.facing);
  cam.yaw = player.facing + Math.PI;
  cam.target.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  cam.curDist = cam.dist;
  minimap = new Minimap(stage);
  updateHud();
  toast(id === 'hub' ? (from ? 'Back in the Kingdom' : 'Find the Crown Jewels, and enter the portals!') : stage.title, 3.5);
  await fade(false);
  busy = false;
}

async function finishLevel() {
  busy = true;
  if (!progress.stars.includes(current)) progress.stars.push(current);
  save();
  banner('Royal Star!');
  await sleep(2600);
  await enter('hub', { from: current });
}

// --- Start ---
// The hero is the Samurai. Add ?hero=king to the address to play as the King instead.
const params = new URLSearchParams(location.search);
const HEROES = { samurai: ['/models/samurai.glb', 1.75], king: ['/models/king.glb', 1.6] };
const [heroUrl, heroHeight] = HEROES[params.get('hero')] || HEROES.samurai;
$('loading').textContent = 'Loading...';
await player.load(heroUrl, heroHeight);
const startLevel = params.get('level');
await enter(LEVELS.some((l) => l.id === startLevel) ? startLevel : 'hub');
$('loading').remove();

// Expose for debugging / automated tests.
window.game = { player, cam, input, enter, progress, get stage() { return stage; }, get current() { return current; }, get busy() { return busy; } };

const raycaster = new THREE.Raycaster();
const timer = new THREE.Timer();
const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 30);

  cam.yaw -= input.mouseDX * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.mouseDY * 0.004, -0.15, 1.3);

  stage.update(dt);
  player.update(dt, input, cam.yaw);

  if (!busy) {
    // Gems and goal pickups.
    tmp.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
    for (const g of stage.gems) {
      if (g.visible && g.position.distanceTo(tmp) < 0.9) { g.visible = false; gemCount++; updateHud(); }
    }
    for (const j of stage.jewels) {
      if (!j.visible || j.position.distanceTo(tmp) > 1.4) continue;
      j.visible = false;
      if (j.userData.star) {
        finishLevel();
      } else {
        progress.jewels.push(j.userData.name);
        save();
        updateHud();
        toast(`Crown Jewel found: ${j.userData.name}! (${progress.jewels.length}/${stage.jewels.length})`);
        if (progress.jewels.length === stage.jewels.length) banner('Kingdom Restored!');
      }
    }
    // Portals in the hub.
    for (const p of stage.portals) {
      if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.3 && Math.abs(player.pos.y - p.y) < 2.5) { enter(p.id); break; }
    }
    if (input.escapePressed && current !== 'hub') enter('hub', { from: current });
  }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;

  // Camera follow (smoothed), pulled in when a wall is in the way, never below the ground.
  cam.target.lerp(tmp.set(player.pos.x, player.pos.y + 1.2, player.pos.z), 1 - Math.exp(-dt * 8));
  dir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  raycaster.set(cam.target, dir);
  raycaster.far = cam.dist;
  const hit = raycaster.intersectObjects(stage.cameraBlockers, false)[0];
  const want = hit ? Math.max(1.2, hit.distance - 0.4) : cam.dist;
  cam.curDist = want < cam.curDist ? want : cam.curDist + (want - cam.curDist) * (1 - Math.exp(-dt * 3));
  camera.position.copy(cam.target).addScaledVector(dir, cam.curDist);
  const floor = stage.terrainHeight(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(cam.target);

  // Sky follows the camera; shadows follow the king.
  stage.sky.position.copy(camera.position);
  stage.sun.position.copy(player.pos).addScaledVector(stage.sunDir, 45);
  stage.sun.target.position.copy(player.pos);

  minimap.draw(player, cam.yaw);
  input.endFrame();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
