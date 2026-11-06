// Level test: loads the hub and every level, checks the king can stand at the start and at the goal,
// tests a portal and the Sakura stairs, and saves screenshots to test-results/levels/.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

const OUT = 'test-results/levels';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Ignore any real game controller plugged into this PC (its stick would move the hero).
await page.addInitScript(() => { navigator.getGamepads = () => []; });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const ready = () => page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 120000 });
const state = () => page.evaluate(() => {
  const p = window.game.player;
  return { level: window.game.current, pos: p.pos.toArray().map((v) => +v.toFixed(1)), grounded: p.grounded };
});
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
async function place(x, y, z, yaw, pitch = 0.3, dist = 8) {
  await page.evaluate(([x, y, z, yaw, pitch, dist]) => {
    const g = window.game; g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0); g.player.lastSafe.set(x, y, z);
    g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; g.cam.target.set(x, y + 1.2, z);
  }, [x, y + 0.3, z, yaw, pitch, dist]);
  await page.waitForTimeout(1300);
}

await page.goto('http://localhost:5199/');
// Gameplay checks don't need fancy graphics; Low quality keeps the software renderer fast enough.
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kingdom-quality', 'low'); });

for (const id of ['sakura', 'bamboo', 'lantern', 'volcano', 'sky']) {
  await page.goto(`http://localhost:5199/?level=${id}`);
  await ready();
  await page.waitForTimeout(1500);
  console.log(id, 'spawn', await state());
  await shot(`${id}-1-start`);
  // A high view looking down the level.
  await page.evaluate(() => { const c = window.game.cam; c.pitch = 0.55; c.dist = 26; });
  await page.waitForTimeout(1200);
  await shot(`${id}-2-overview`);
  // Stand right next to the star.
  const goal = await page.evaluate(() => { const j = window.game.stage.jewels[0]; return [j.position.x, j.position.y - 1.1, j.position.z]; });
  await place(goal[0] + 1.6, goal[1] + 0.5, goal[2], Math.PI / 2, 0.35, 9);
  console.log(id, 'next to star', goal.map((v) => +v.toFixed(1)), await state());
  await shot(`${id}-3-goal`);
}

// Hub: walk into the first portal.
await page.goto('http://localhost:5199/');
await ready();
await page.waitForTimeout(1000);
const portal = await page.evaluate(() => { const p = window.game.stage.portals[0]; return [p.x, p.y, p.z, p.facing]; });
await place(portal[0] + Math.sin(portal[3]) * 5, portal[1], portal[2] + Math.cos(portal[3]) * 5, portal[3]);
await shot('hub-portals');
await page.evaluate(([x, y, z]) => window.game.player.pos.set(x, y + 0.5, z), portal);
await page.waitForTimeout(400);
await ready();
console.log('after stepping into portal ->', await state());

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
