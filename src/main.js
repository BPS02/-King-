import * as THREE from 'three';
import { Input, PAD } from './input.js';
import { Player } from './player.js';
import { Minimap } from './minimap.js';
import { Hub } from './levels/hub.js';
import { LEVELS } from './levels/index.js';
import { Q, QUALITY, qualityName, setQuality, useRenderer, loadEnvironment, LightPool, makeComposer } from './graphics.js';
import { loadAssets } from './assets.js';

// --- Renderer, camera ---
// Realistic rendering: filmic tone mapping, sRGB output, soft shadows, quality-scaled resolution.
const renderer = new THREE.WebGLRenderer({ antialias: Q.msaa === 0 && Q.pixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
useRenderer(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);
camera.layers.enable(1);   // layer 1 = sky, layer 2 = foliage cards (both hidden from the ambient-occlusion pass)
camera.layers.enable(2);
const post = makeComposer(renderer, scene, camera);
const lightPool = new LightPool(scene);
const frameTimes = [];   // recent frame durations, for the FPS readout
let altTimer = 0;
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
// Camera follows close behind the hero. Mouse wheel zooms (saved in this browser).
const ZOOM_KEY = 'kingdom-zoom';
const startDist = +localStorage.getItem(ZOOM_KEY) || 5.2;
const cam = { yaw: 0, pitch: 0.24, dist: startDist, curDist: startDist, target: new THREE.Vector3() };

// Crown Jewels found in the current town (older saves may hold names from the previous hub).
const jewelsFound = () => stage.jewels.filter((j) => progress.jewels.includes(j.userData.name)).length;

function updateHud() {
  const gems = `<div class="small">Gems: ${gemCount} / ${stage.gems.length}</div>`;
  if (current === 'hub') {
    $('hud').innerHTML = `<div>${stage.title}</div><div class="small">Crown Jewels: ${jewelsFound()} / ${stage.jewels.length}</div>` +
      `<div class="small">Royal Stars: ${progress.stars.length} / ${LEVELS.length}</div>` + gems;
    $('help2').textContent = 'The Gate of the Five Peaks (west of the castle) leads to the mountains';
  } else {
    $('hud').innerHTML = `<div>${stage.title}</div>` + gems + (stage.summitY ? '<div class="small" id="alt"></div>' : '<div class="small">Find the Royal Star!</div>');
    $('help2').textContent = input.padName ? 'Create button: back to the Kingdom' : 'Esc: back to the Kingdom';
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
  stage.finalize();
  // Image-based lighting from the level's HDR sky (reflections on metal, lacquer and wet stone).
  scene.environment = await loadEnvironment(stage.envName);
  scene.environmentIntensity = stage.envIntensity;
  renderer.toneMappingExposure = stage.exposure;
  if (post.bloom) { post.bloom.strength = stage.bloom ?? 0.35; post.bloom.threshold = stage.bloomThreshold ?? 1.0; }
  renderer.info.autoReset = false;
  current = id;
  gemCount = 0;
  const back = id === 'hub' && from ? stage.portalSpawn(from) : null;
  player.setLevel(stage, back?.spawn, back?.facing);
  cam.yaw = player.facing + Math.PI;
  cam.target.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  cam.curDist = cam.dist;
  minimap = new Minimap(stage);
  updateHud();
  toast(id === 'hub' ? (from ? 'Back in Hoshi Castle Town' : 'Welcome to Hoshi Castle Town! Find the 5 Crown Jewels, or take a gate to the mountains.') : stage.title, 4);
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
const HEROES = { samurai: ['/models/samurai.glb', 1.95], king: ['/models/king.glb', 1.6] };
const [heroUrl, heroHeight] = HEROES[params.get('hero')] || HEROES.samurai;
$('loading').textContent = 'Loading...';
await Promise.all([player.load(heroUrl, heroHeight), loadAssets()]);
const startLevel = params.get('level');
await enter(LEVELS.some((l) => l.id === startLevel) ? startLevel : 'hub');
$('loading').remove();

// Expose for debugging / automated tests.
window.game = { player, cam, input, enter, progress, renderer, frameTimes, get stage() { return stage; }, get current() { return current; }, get busy() { return busy; }, get post() { return post; } };

const raycaster = new THREE.Raycaster();
const timer = new THREE.Timer();
const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
function frame() {
  timer.update();
  // Fixed-size physics steps: if a frame takes long (slow PC, heavy scene), run several small
  // steps so the game never slows down or tunnels through platforms.
  const real = Math.min(timer.getDelta(), 0.25);
  const steps = Math.max(1, Math.ceil(real / (1 / 30) - 1e-6));
  const dt = real / steps;
  frameTimes.push(real);
  if (frameTimes.length > 60) frameTimes.shift();

  input.pollGamepad(real);
  padFrame();
  if (input.wheel) {
    cam.dist = THREE.MathUtils.clamp(cam.dist * Math.pow(1.1, input.wheel / 100), 2.5, 14);
    localStorage.setItem(ZOOM_KEY, cam.dist.toFixed(2));
  }
  cam.yaw -= input.mouseDX * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.mouseDY * 0.004, -0.15, 1.3);

  for (let i = 0; i < steps; i++) {
    stage.update(dt);
    player.update(dt, input, cam.yaw);
    input.clearPresses();   // a key press counts once, not once per step
  }

  if (!busy) {
    // Gems and goal pickups.
    tmp.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
    for (const g of stage.gems) {
      if (g.visible && g.position.distanceTo(tmp) < 0.9) { g.visible = false; gemCount++; updateHud(); input.rumble(0.2, 60); }
    }
    for (const j of stage.jewels) {
      if (!j.visible || j.position.distanceTo(tmp) > 1.4) continue;
      j.visible = false;
      input.rumble(0.8, 350);
      if (j.userData.star) {
        finishLevel();
      } else {
        progress.jewels.push(j.userData.name);
        save();
        updateHud();
        toast(`Crown Jewel found: ${j.userData.name}! (${jewelsFound()}/${stage.jewels.length})`);
        if (jewelsFound() === stage.jewels.length) banner('All Crown Jewels found!');
      }
    }
    // Portals in the hub.
    for (const p of stage.portals) {
      if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.3 && Math.abs(player.pos.y - p.y) < 2.5) { enter(p.id); break; }
    }
    if (input.escapePressed && current !== 'hub') enter('hub', { from: current });
    // Checkpoint lanterns: light up when reached and become the respawn point.
    for (const c of stage.checkpoints || []) {
      if (c.done || Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z) > 3 || Math.abs(player.pos.y - c.pos.y) > 2) continue;
      c.done = true;
      c.flame.visible = true;
      player.lastSafe.set(c.pos.x, c.pos.y + 0.2, c.pos.z);
      toast('Checkpoint!', 1.6);
      input.rumble(0.5, 180);
    }
    // Altitude meter for mountain climbs.
    if (stage.summitY && (altTimer -= dt * steps) <= 0) {
      altTimer = 0.2;
      const el = document.getElementById('alt');
      const alt = Math.max(0, Math.round(player.pos.y)), top = Math.round(stage.summitY);
      if (el) el.innerHTML = `⛰ Altitude ${alt} m / ${top} m<div class="bar"><div style="width:${Math.min(100, (alt / top) * 100)}%"></div></div>`;
    }
  }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;

  // Camera follow (smoothed), pulled in when a wall is in the way, never below the ground.
  cam.target.lerp(tmp.set(player.pos.x, player.pos.y + 1.2, player.pos.z), 1 - Math.exp(-dt * 8));
  dir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  raycaster.set(cam.target, dir);
  raycaster.far = cam.dist;
  const hit = raycaster.intersectObjects(stage.cameraBlockers, false)[0];
  let want = hit ? Math.max(1.2, hit.distance - 0.4) : cam.dist;
  // Steep mountain slopes: march along the camera line and stop before it goes into the ground.
  if (stage.heights) for (let d = 0.6; d < want; d += 0.4) {
    const px = cam.target.x + dir.x * d, py = cam.target.y + dir.y * d, pz = cam.target.z + dir.z * d;
    if (py < stage.terrainHeight(px, pz) + 0.35) { want = Math.max(1.2, d - 0.4); break; }
  }
  cam.curDist = want < cam.curDist ? want : cam.curDist + (want - cam.curDist) * (1 - Math.exp(-dt * 3));
  camera.position.copy(cam.target).addScaledVector(dir, cam.curDist);
  const floor = stage.terrainHeight(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(cam.target);

  // Sky follows the camera; shadows follow the king.
  stage.sky.position.copy(camera.position);
  stage.sun.position.copy(player.pos).addScaledVector(stage.sunDir, 60);
  stage.sun.target.position.copy(player.pos);
  lightPool.update(dt, stage.lanternLights ? stage.lightSpots : [], player.pos);

  minimap.draw(player, cam.yaw);
  input.endFrame();
  renderer.info.reset();
  post.sync();
  post.composer.render(real);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.composer.setSize(innerWidth, innerHeight);
});

// --- Graphics settings menu (press O) ---
function buildSettings() {
  const box = $('settings');
  box.innerHTML = '<div class="title">Graphics Quality</div>' +
    Object.entries(QUALITY).map(([k, v]) => `<button data-q="${k}" class="${k === qualityName() ? 'on' : ''}">${v.label}</button>`).join('') +
    '<div class="note">Changing quality reloads the game. Press O (or ○ on a controller) to close.</div><div id="fps"></div>';
  box.querySelectorAll('button').forEach((b) => b.onclick = () => { setQuality(b.dataset.q); location.search = location.search.replace(/[?&]quality=\w+/, ''); location.reload(); });
}
buildSettings();
addEventListener('keydown', (e) => { if (e.code === 'KeyO') $('settings').classList.toggle('open'); });

// --- PlayStation / game controller extras ---
const PAD_HELP = 'Left stick: move (tilt gently to walk) &nbsp;·&nbsp; ✕: jump &nbsp;·&nbsp; □ or R1: sword (press again for a 3-hit combo) &nbsp;·&nbsp; L1 or L2: block &nbsp;·&nbsp; ○ or R2: kick &nbsp;·&nbsp; Right stick: camera &nbsp;·&nbsp; D-pad ↑↓: zoom &nbsp;·&nbsp; Options: graphics';
let lastPad = null, menuIndex = 0;
function padFrame() {
  // Show controller help when one is plugged in, keyboard help when it's unplugged.
  if (input.padName !== lastPad) {
    if (input.padName && lastPad === null) toast('🎮 Controller connected!', 2.5);
    lastPad = input.padName;
    const keysHelp = $('helpKeys');
    keysHelp.dataset.keys ??= keysHelp.innerHTML;
    keysHelp.innerHTML = input.padName ? PAD_HELP : keysHelp.dataset.keys;
    if (stage) updateHud();
  }
  if (!input.padName) return;
  const box = $('settings');
  if (input.padTap(PAD.OPTIONS)) {
    box.classList.toggle('open');
    menuIndex = Math.max(0, Object.keys(QUALITY).indexOf(qualityName()));
  }
  if (!box.classList.contains('open')) return;
  // Menu open: D-pad / left stick pick a quality, ✕ chooses it, ○ closes. The hero doesn't move.
  const buttons = [...box.querySelectorAll('button')];
  if (input.padTap(PAD.UP) || input.padTap(PAD.LEFT)) menuIndex = (menuIndex + buttons.length - 1) % buttons.length;
  if (input.padTap(PAD.DOWN) || input.padTap(PAD.RIGHT)) menuIndex = (menuIndex + 1) % buttons.length;
  buttons.forEach((b, i) => b.classList.toggle('focus', i === menuIndex));
  if (input.padTap(PAD.CROSS)) buttons[menuIndex]?.click();
  if (input.padTap(PAD.CIRCLE)) box.classList.remove('open');
  input.clearPresses();
  input.escapePressed = false;
  input.wheel = 0; input.mouseDX = 0; input.mouseDY = 0;
  input.padStick = { x: 0, y: 0 }; input.padTilt = 0;
}
$('gear').onclick = () => $('settings').classList.toggle('open');
setInterval(() => {
  if (!frameTimes.length) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const el = document.getElementById('fps');
  if (el) el.textContent = `${Math.round(1 / avg)} FPS · ${Q.label}`;
}, 500);
