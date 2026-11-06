// Climb test: for each mountain level, checks the route (every jump possible), stands the hero
// on each ledge and checkpoint, walks up the watchtower stairs, and saves screenshots.
// Usage: node tests/climb.mjs [level ...]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

const levels = process.argv.slice(2).length ? process.argv.slice(2) : ['sakura', 'bamboo', 'lantern', 'volcano', 'sky'];
const OUT = 'test-results/climb';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Ignore any real game controller plugged into this PC (its stick would move the hero).
await page.addInitScript(() => { navigator.getGamepads = () => []; });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

async function place(x, y, z, yaw, pitch = 0.3, dist = 9) {
  await page.evaluate(([x, y, z, yaw, pitch, dist]) => {
    const g = window.game; g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0); g.player.lastSafe.set(x, y, z);
    if (yaw !== null) { g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; }
    g.cam.target.set(x, y + 1.2, z);
  }, [x, y, z, yaw, pitch, dist]);
}
const state = () => page.evaluate(() => { const p = window.game.player; return { y: +p.pos.y.toFixed(2), grounded: p.grounded }; });

for (const id of levels) {
  await page.goto(`http://localhost:5199/?level=${id}&quality=low`);
  await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const s = window.game.stage;
    const ledges = s.platforms.filter((p) => p.kind === 'cyl' && p.r > 0.75 && p.r < 2 && p.top > 1);
    return { check: s.climbCheck, summit: s.summitY, ledges: ledges.length, checkpoints: s.checkpoints.map((c) => c.pos.toArray()) };
  });
  console.log(`${id}: route steps ${info.check.steps}, problems ${JSON.stringify(info.check.problems)}, ledges ${info.ledges}, checkpoints ${info.checkpoints.length}, summit ${info.summit}`);
  await page.screenshot({ path: `${OUT}/${id}-1-trailhead.png` });

  // Stand on every checkpoint.
  let ok = 0;
  for (const [x, y, z] of info.checkpoints) {
    await place(x, y + 0.4, z, null);
    await page.waitForTimeout(250);
    const st = await state();
    if (st.grounded && Math.abs(st.y - y) < 0.6) ok++; else console.log('  checkpoint not solid', x.toFixed(1), y.toFixed(1), z.toFixed(1), st);
  }
  console.log(`  checkpoints solid: ${ok}/${info.checkpoints.length}`);

  // A cliff view mid-mountain (at the second checkpoint).
  const mid = info.checkpoints[Math.min(1, info.checkpoints.length - 1)];
  if (mid) { await place(mid[0], mid[1] + 0.3, mid[2], 0.6, 0.15, 10); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${id}-2-cliff.png` }); }

  // Summit: walk up the watchtower stairs to the star.
  const tower = await page.evaluate(() => { const s = window.game.stage, t = s.towerStairs; return { foot: t.foot.toArray(), dir: t.dir.toArray(), H: s.mountain.H }; });
  // Camera behind the hero, looking up the stairs; then walk forward up them.
  const yaw = Math.atan2(-tower.dir[0], -tower.dir[2]);
  await place(tower.foot[0], tower.H + 0.3, tower.foot[2], yaw, 0.3, 8);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${id}-3-summit.png` });
  await page.evaluate(() => { window.maxY = 0; window.tr = setInterval(() => { window.maxY = Math.max(window.maxY, window.game.player.pos.y); }, 100); });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(5000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  const maxY = await page.evaluate(() => window.maxY);
  console.log(`  watchtower stairs: highest point ${maxY.toFixed(1)} m (platform ${tower.H + 6} m) -> ${maxY > tower.H + 5.8 ? 'OK' : 'FAILED'}`);
  await page.screenshot({ path: `${OUT}/${id}-4-tower.png` });
  const end = await page.evaluate(() => ({ y: +window.game.player.pos.y.toFixed(1), current: window.game.current, banner: document.getElementById('banner').textContent }));
  console.log(`  walked up the watchtower: reached y ${end.y} (platform ${tower.H + 6}), banner "${end.banner}"`);
}
console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 8) : 'none');
await browser.close();
await server.close();
