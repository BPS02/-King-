// Graphics check: renders levels at a chosen quality, reports errors / missing assets / frame time,
// and saves screenshots to test-results/graphics/.
// Usage: node tests/graphics.mjs [quality] [level ...]     e.g. node tests/graphics.mjs high sakura
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

const quality = process.argv[2] || 'high';
const levels = process.argv.slice(3).length ? process.argv.slice(3) : ['sakura', 'bamboo', 'lantern', 'volcano', 'sky', 'hub'];
const OUT = 'test-results/graphics';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Ignore any real game controller plugged into this PC (its stick would move the hero).
await page.addInitScript(() => { navigator.getGamepads = () => []; });
const errors = [], missing = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /THREE/.test(m.text()))) errors.push(m.text().slice(0, 300)); });
page.on('response', (r) => { if (r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });

// Every level: the starting view, then a high view looking over the level.
const views = Object.fromEntries(['sakura', 'bamboo', 'lantern', 'volcano', 'sky', 'hub'].map((id) => [id, [['start', null], ['overview', 'ov']]]));
for (const id of levels) {
  await page.goto(`http://localhost:5199/?level=${id === 'hub' ? '' : id}&quality=${quality}`);
  await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  for (const [name, x, y, z, yaw, pitch, dist] of views[id]) {
    if (x === 'ov') {
      await page.evaluate(() => { const c = window.game.cam; c.pitch = 0.45; c.dist = 35; });
      await page.waitForTimeout(1500);
    } else if (x !== null) {
      await page.evaluate(([x, y, z, yaw, pitch, dist]) => {
        const g = window.game, s = g.stage;
        const yy = y ?? s.terrainHeight(x, z);
        g.player.pos.set(x, yy + 0.3, z); g.player.vel.set(0, 0, 0); g.player.lastSafe.set(x, yy + 0.3, z);
        g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; g.cam.target.set(x, yy + 1.2, z);
      }, [x, y, z, yaw, pitch, dist]);
      await page.waitForTimeout(1800);
    }
    await page.screenshot({ path: `${OUT}/${id}-${quality}-${name}.png` });
  }
  const info = await page.evaluate(() => {
    const r = window.game.renderer.info;
    const ft = window.game.frameTimes;
    return { drawCalls: r.render.calls, triangles: r.render.triangles, textures: r.memory.textures, avgFrameMs: +(1000 * ft.reduce((a, b) => a + b, 0) / ft.length).toFixed(1) };
  });
  console.log(id, quality, JSON.stringify(info));
}
console.log('missing files:', missing.length ? missing : 'none');
console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 12) : 'none');
await browser.close();
await server.close();
