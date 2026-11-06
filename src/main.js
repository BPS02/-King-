import * as THREE from 'three';
import { Input } from './input.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Minimap } from './minimap.js';

// --- Renderer, scene, lights ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 90, 260);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);

scene.add(new THREE.HemisphereLight(0xdff3ff, 0x6a8a4a, 1.4));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -25; sc.right = sc.top = 25; sc.near = 1; sc.far = 120;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// --- Game objects ---
const input = new Input(renderer.domElement);
const world = new World(scene);
const player = new Player(scene, world);
const minimap = new Minimap(world);

const $ = (id) => document.getElementById(id);
$('gemTotal').textContent = world.gems.length;
$('jewelTotal').textContent = world.jewels.length;
let gemCount = 0, jewelCount = 0, won = false;

let toastTimer = 0;
function toast(text, seconds = 2.5) {
  $('toast').textContent = text;
  $('toast').style.opacity = 1;
  toastTimer = seconds;
}

// Orbit camera that follows the king.
const cam = { yaw: 0, pitch: 0.3, dist: 8, curDist: 8, target: new THREE.Vector3() };
const raycaster = new THREE.Raycaster();

await player.load('/models/king.glb');
$('loading').remove();
cam.target.copy(player.pos);
toast('Find the 5 Crown Jewels! Follow the golden light beams.', 5);

// Expose for debugging / automated tests.
window.game = { player, world, cam, input };

const timer = new THREE.Timer();
const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 30);

  cam.yaw -= input.mouseDX * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.mouseDY * 0.004, -0.15, 1.3);

  world.update(dt);
  player.update(dt, input, cam.yaw);

  // Collect gems and Crown Jewels.
  tmp.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
  for (const g of world.gems) {
    if (g.visible && g.position.distanceTo(tmp) < 0.9) { g.visible = false; $('gems').textContent = ++gemCount; }
  }
  for (const j of world.jewels) {
    if (j.visible && j.position.distanceTo(tmp) < 1.4) {
      j.visible = false;
      $('jewels').textContent = ++jewelCount;
      toast(`Crown Jewel found: ${j.userData.name}! (${jewelCount}/${world.jewels.length})`);
    }
  }
  if (!won && jewelCount === world.jewels.length) {
    won = true;
    $('banner').style.display = 'block';
  }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;

  // Camera follow (smoothed), pulled in when a wall is in the way, never below the ground.
  cam.target.lerp(tmp.set(player.pos.x, player.pos.y + 1.2, player.pos.z), 1 - Math.exp(-dt * 8));
  dir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  raycaster.set(cam.target, dir);
  raycaster.far = cam.dist;
  const hit = raycaster.intersectObjects(world.cameraBlockers, false)[0];
  const want = hit ? Math.max(1.2, hit.distance - 0.4) : cam.dist;
  cam.curDist = want < cam.curDist ? want : cam.curDist + (want - cam.curDist) * (1 - Math.exp(-dt * 3));
  camera.position.copy(cam.target).addScaledVector(dir, cam.curDist);
  const floor = world.terrainHeight(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(cam.target);

  // Keep the shadow area centered on the player.
  sun.position.set(player.pos.x + 20, player.pos.y + 40, player.pos.z + 15);
  sun.target.position.copy(player.pos);

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
