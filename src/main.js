import * as THREE from 'three';
import { Input, PAD } from './input.js';
import { Music } from './music.js';
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
// Soundtrack (starts on the first click / key press: browsers block sound before that).
const music = new Music();
addEventListener('pointerdown', () => music.start());
addEventListener('keydown', (e) => { music.start(); if (e.code === 'KeyM') toggleMusic(); });
function toggleMusic() {
  music.setEnabled(!music.enabled);
  const b = document.getElementById('musicBtn');
  if (b) { b.textContent = music.enabled ? 'On' : 'Off'; b.classList.toggle('on', music.enabled); }
  toast(music.enabled ? '♪ Music on' : 'Music off', 1.5);
}
function nowPlaying() {
  const el = document.getElementById('np');
  if (!el || !music.enabled) return;
  setTimeout(() => { el.textContent = '♪ ' + music.moodName; el.style.opacity = 1; setTimeout(() => (el.style.opacity = 0), 4500); }, 1500);
}

// Conversation with a townsperson (see "Talking to townspeople" below).
const talk = { who: null, lines: [], i: 0, shown: 0, full: '' };
let voicesOn = localStorage.getItem('kingdom-voices') !== 'off';
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
  closeTalk();
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
  music.setMood(id);
  nowPlaying();
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
  music.jingle(true);
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
window.game = { player, cam, input, enter, progress, renderer, frameTimes, get stage() { return stage; }, get current() { return current; }, get busy() { return busy; }, get post() { return post; }, get talk() { return talk; }, music };

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
        music.jingle(false);
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
      music.chime();
      input.rumble(0.5, 180);
    }
    updateTalk(real);
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

// --- Talking to townspeople (E / Enter, or Triangle on a controller) ---
// Walk up to someone: a prompt appears. Their words are typed into a box and read aloud by the
// browser's built-in text-to-speech (can be switched off in the settings menu).
function pickVoice(person) {
  const all = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en/i.test(v.lang));
  if (!all.length) return null;
  const female = /zira|aria|jenny|susan|hazel|sonia|libby|female|samantha|karen|moira|tessa/i;
  const pool = all.filter((v) => (person.voice?.female ? female.test(v.name) : !female.test(v.name)));
  const list = pool.length ? pool : all;
  let h = 0;
  for (const c of person.name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length];
}
function say(person, text) {
  if (!voicesOn || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(person);
  if (v) u.voice = v;
  u.pitch = person.voice?.pitch ?? 1;
  u.rate = person.voice?.rate ?? 1;
  speechSynthesis.speak(u);
}
function showLine() {
  talk.full = talk.lines[talk.i];
  talk.shown = 0;
  const box = $('dialog');
  box.style.display = 'block';
  box.querySelector('.who').textContent = talk.who.name;
  box.querySelector('.text').textContent = '';
  const key = input.padName ? '△' : 'E';
  box.querySelector('.next').textContent = talk.i < talk.lines.length - 1 ? `${key} ▶ next` : `${key} ✕ close`;
  say(talk.who, talk.full);
}
function openTalk(person) {
  const p = { stars: progress.stars.length, jewels: jewelsFound(), jewelsTotal: stage.jewels.length };
  talk.who = person;
  talk.lines = typeof person.lines === 'function' ? person.lines(p) : person.lines;
  talk.i = 0;
  person.talking = true;
  person.talkTime = 0;
  person.lookAt.copy(player.pos);
  music.duck(true);
  showLine();
}
function nextLine() {
  if (talk.shown < talk.full.length) { talk.shown = talk.full.length; return; }   // first press finishes the typing
  talk.i++;
  if (talk.i >= talk.lines.length) closeTalk(); else showLine();
}
function closeTalk() {
  if (talk.who) talk.who.talking = false;
  talk.who = null;
  music.duck(false);
  $('dialog').style.display = 'none';
  window.speechSynthesis?.cancel();
}
function updateTalk(dt) {
  const prompt = $('talk');
  if (talk.who) {
    prompt.style.display = 'none';
    talk.who.lookAt.copy(player.pos);
    const w = talk.who.root.position;
    if (Math.hypot(player.pos.x - w.x, player.pos.z - w.z) > 5.5) { closeTalk(); return; }   // walked away
    talk.shown = Math.min(talk.full.length, talk.shown + dt * 45);
    $('dialog').querySelector('.text').textContent = talk.full.slice(0, Math.floor(talk.shown));
    if (input.talkPressed) nextLine();
    return;
  }
  let best = null, bestD = 3.2;
  for (const n of stage.npcs || []) {
    const w = n.root.position, d = Math.hypot(player.pos.x - w.x, player.pos.z - w.z);
    if (d < bestD && Math.abs(player.pos.y - w.y) < 2.5) { best = n; bestD = d; }
  }
  if (best) {
    prompt.textContent = `${input.padName ? '△' : 'E'}  Talk to ${best.name}`;
    prompt.style.display = 'block';
    if (input.talkPressed) openTalk(best);
  } else prompt.style.display = 'none';
}
$('dialog').onclick = () => { if (talk.who) nextLine(); };
window.speechSynthesis?.getVoices();   // starts loading the voice list early

// --- Graphics settings menu (press O) ---
function buildSettings() {
  const box = $('settings');
  box.innerHTML = '<div class="title">Graphics Quality</div>' +
    Object.entries(QUALITY).map(([k, v]) => `<button data-q="${k}" class="${k === qualityName() ? 'on' : ''}">${v.label}</button>`).join('') +
    `<div class="title" style="margin-top:14px">Music</div><button id="musicBtn" class="${music.enabled ? 'on' : ''}">${music.enabled ? 'On' : 'Off'}</button>` +
    `<div class="title" style="margin-top:14px">Voices</div><button id="voiceBtn" class="${voicesOn ? 'on' : ''}">${voicesOn ? 'On' : 'Off'}</button>` +
    '<div class="note">Changing quality reloads the game. Press O (or ○ on a controller) to close.</div><div id="fps"></div>';
  box.querySelectorAll('button[data-q]').forEach((b) => b.onclick = () => { setQuality(b.dataset.q); location.search = location.search.replace(/[?&]quality=\w+/, ''); location.reload(); });
}
buildSettings();
$('musicBtn').onclick = () => { music.start(); toggleMusic(); };
$('voiceBtn').onclick = () => {
  voicesOn = !voicesOn;
  localStorage.setItem('kingdom-voices', voicesOn ? 'on' : 'off');
  if (!voicesOn) window.speechSynthesis?.cancel();
  $('voiceBtn').textContent = voicesOn ? 'On' : 'Off';
  $('voiceBtn').classList.toggle('on', voicesOn);
};
addEventListener('keydown', (e) => { if (e.code === 'KeyO') $('settings').classList.toggle('open'); });

// --- PlayStation / game controller extras ---
const PAD_HELP = 'Left stick: move (tilt gently to walk) &nbsp;·&nbsp; ✕: jump &nbsp;·&nbsp; □ or R1: sword (press again for a 3-hit combo) &nbsp;·&nbsp; L1 or L2: block &nbsp;·&nbsp; ○ or R2: kick &nbsp;·&nbsp; Right stick: camera &nbsp;·&nbsp; D-pad ↑↓: zoom &nbsp;·&nbsp; △: talk &nbsp;·&nbsp; M: music &nbsp;·&nbsp; Options: graphics';
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
  if (input.padTaps.size) music.start();
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
