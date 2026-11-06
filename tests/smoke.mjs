// Smoke test: starts the dev server, explores the open world, saves screenshots to test-results/.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

fs.mkdirSync('test-results', { recursive: true });
const server = await createServer({ server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5199/');
await page.waitForFunction(() => window.game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
const state = () => page.evaluate(() => {
  const p = window.game.player;
  return { pos: p.pos.toArray().map((v) => +v.toFixed(1)), grounded: p.grounded, anim: p.current?.getClip().name };
});
const shot = (n) => page.screenshot({ path: `test-results/${n}.png` });
// Drop the king just above a spot and let him land.
async function visit(name, x, y, z, yaw = 0) {
  await page.evaluate(([x, y, z, yaw]) => {
    const g = window.game; g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0);
    g.cam.yaw = yaw; g.cam.target.set(x, y, z);
  }, [x, y + 0.5, z, yaw]);
  await page.waitForTimeout(1200);
  console.log(name, await state());
  await shot(name);
}

console.log('jewels', await page.evaluate(() => window.game.world.jewels.map((j) => [j.userData.name, ...j.position.toArray().map((v) => +v.toFixed(1))])));
console.log('spawn', await state());
await shot('1-spawn');

await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.down('Space');
await page.waitForTimeout(300);
await page.keyboard.up('Space');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
console.log('after run+jump', await state());
await shot('2-village-run');

const W = await page.evaluate(() => {
  const w = window.game.world, c = { x: 0, z: -32 };
  return { castleBase: w.terrainHeight(c.x, c.z), peak: w.peak };
});
await visit('3-castle-approach', 0, W.castleBase, -14, 0);
await visit('4-castle-wall-top', 0, W.castleBase + 6, -30, 0.6);
const j = await page.evaluate(() => Object.fromEntries(window.game.world.jewels.map((j) => [j.userData.name, j.position.toArray()])));
await visit('5-lake', j['Lake Isle'][0] + 20, 1, j['Lake Isle'][2] + 6, 1.2);
await visit('6-forest-stump', j['Old Stump'][0], j['Old Stump'][1] - 5, j['Old Stump'][2] + 9, 0);
await visit('7-sky-spiral', j['Sky Spiral'][0], j['Sky Spiral'][1] - 1.1, j['Sky Spiral'][2], 2.2);
await visit('8-mountain-peak', W.peak.x, W.peak.h, W.peak.z, 3.14);

// Wide view from high above the kingdom.
await page.evaluate(() => { const g = window.game; g.cam.pitch = 0.9; g.cam.dist = 120; g.player.pos.set(0, 10, 10); g.cam.target.set(0, 10, 10); });
await page.waitForTimeout(1500);
await shot('9-overview');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
