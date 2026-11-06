// Castle-town check: every Crown Jewel can be reached, the castle lift carries the hero up,
// and screenshots of the main sights go to test-results/city/.
// Usage: node tests/city.mjs [quality]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
const q = process.argv[2] || 'low';
fs.mkdirSync('test-results/city', { recursive: true });
const server = await createServer({ server: { port: 5195 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Ignore any real game controller plugged into this PC (its stick would move the hero).
await page.addInitScript(() => { navigator.getGamepads = () => []; });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:5195/?quality=${q}`);
await page.evaluate(() => localStorage.removeItem('kingdom-progress-v1'));
await page.goto(`http://localhost:5195/?quality=${q}`);
await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 240000 });
await page.waitForTimeout(1000);
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) process.exitCode = 1; };
const st = () => page.evaluate(() => { const p = window.game.player; return { y: +p.pos.y.toFixed(2), x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), grounded: p.grounded }; });
const drop = async (x, y, z, ms = 1500) => {
  await page.evaluate(([x, y, z]) => { const g = window.game; g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0); g.player.lastSafe.set(x, y, z); g.cam.target.set(x, y + 1.2, z); }, [x, y, z]);
  await page.waitForTimeout(ms);
  return st();
};
const jewels = await page.evaluate(() => Object.fromEntries(window.game.stage.jewels.map((j) => [j.userData.name, j.position.toArray()])));
console.log('jewels', Object.keys(jewels).join(', '));

// 1. Castle lift: stand on it at the bottom and ride to the keep balcony.
const lift = await page.evaluate(() => { const m = window.game.stage.movers[0]; return { a: m.a.toArray(), b: m.b.toArray() }; });
await page.waitForFunction(() => { const m = window.game.stage.movers[0]; return m.cur.y < m.a.y + 0.6; }, null, { timeout: 60000 });
await drop(lift.a[0], lift.a[1] + 0.6, lift.a[2], 300);
await page.waitForFunction(() => { const m = window.game.stage.movers[0]; return m.cur.y > m.b.y - 0.3; }, null, { timeout: 60000 });
let s = await st();
ok('castle lift carries the hero to the top', Math.abs(s.y - lift.b[1]) < 0.6 && s.grounded, JSON.stringify(s));
// Walk the walkway: stand on it, then on the balcony next to the jewel.
const kj = jewels['Castle Keep'];
s = await drop((kj[0] + lift.b[0]) / 2 + 2, lift.b[1] + 0.5, lift.b[2]);
ok('walkway to the keep balcony is solid', s.grounded && Math.abs(s.y - lift.b[1]) < 0.4, JSON.stringify(s));
s = await drop(kj[0] + 1.5, kj[1], kj[2]);
ok('keep balcony is solid', s.grounded && Math.abs(s.y - (kj[1] - 1.1)) < 0.4, JSON.stringify(s));
await page.evaluate(() => { const c = window.game.cam; c.yaw = 0.6; c.pitch = 0.25; c.dist = 9; });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'test-results/city/keep-balcony.png' });

// 2. Other jewels: stand where each one sits.
for (const name of ['Fire Watchtower', 'Storehouse Roof', 'Pagoda Top']) {
  const j = jewels[name];
  s = await drop(j[0] + (name === 'Pagoda Top' ? 0.6 : 0.8), j[1], j[2]);
  ok(`${name}: ground under the jewel`, s.grounded && Math.abs(s.y - (j[1] - 1.1)) < 0.6, JSON.stringify(s));
}
// Fire-tower stairs: every step at most 0.6 higher than the last (walkable) and the lookout is open where they arrive.
const stairs = await page.evaluate(() => {
  const s = window.game.stage, T = s.towerTop;
  return s.platforms.filter((p) => p.kind === 'box' && Math.abs((p.minX + p.maxX) / 2 - T.x) < 3.6 && Math.abs((p.minZ + p.maxZ) / 2 - T.z) < 3.6 && p.h < 0.3 && p.top > 2.6)
    .map((p) => p.top).sort((a, b) => a - b);
});
const rises = stairs.slice(1).map((v, i) => v - stairs[i]);
ok('fire-tower stairs are walkable', stairs.length > 20 && Math.max(...rises) <= 0.6, `${stairs.length} steps, max rise ${Math.max(...rises).toFixed(2)}`);
// Storehouse crates: each a jump of at most 1.6.
const crates = await page.evaluate(() => window.game.stage.platforms.filter((p) => p.kind === 'box' && Math.abs(p.w - 1.5) < 0.01 && Math.abs(p.d - 1.5) < 0.01).map((p) => p.top).sort((a, b) => a - b));
const roof = jewels['Storehouse Roof'][1] - 1.1;
ok('storehouse crates climb to the roof', crates.length === 5 && Math.max(...[...crates, roof].map((v, i, a) => (i ? v - a[i - 1] : v - 2.5))) <= 1.6, crates.join(' -> ') + ' -> roof ' + roof);
// 3. The boat: drop onto it and ride.
const boat = await page.evaluate(() => { const m = window.game.stage.movers[1]; return m.cur.toArray(); });
s = await drop(boat[0], boat[1] + 0.8, boat[2], 600);
const s2 = await st();
await page.waitForTimeout(1500);
const s3 = await st();
ok('boat deck carries the hero', s2.grounded && Math.abs(s3.x - s2.x) > 0.5, `${JSON.stringify(s2)} -> x ${s3.x}`);
await page.screenshot({ path: 'test-results/city/boat.png' });
// 4. Castle stairs are walkable (rise <= 0.6) from the gate up to the keep.
const steps = await page.evaluate(() => window.game.stage.platforms.filter((p) => p.kind === 'box' && Math.abs((p.minX + p.maxX) / 2) < 0.1 && p.w > 3.9 && p.w < 4.5 && p.d < 1.2).map((p) => p.top).sort((a, b) => a - b));
const sr = steps.slice(1).map((v, i) => v - steps[i]);
ok('castle stairs are walkable', steps.length > 15 && Math.max(...sr) <= 0.6, `${steps.length} steps up to ${steps[steps.length - 1]}`);

// Screenshots of the sights.
const views = [['castle', 0, null, 22, Math.PI * 0, 0.18, 18], ['honmaru', 0, 10, -28, 0, 0.2, 12], ['market', -24, null, 48, 0, 0.35, 16], ['canal', 20, null, 92, -2.2, 0.3, 14], ['temple', 74, null, -8, 0, 0.2, 18], ['town-high', 0, null, 70, 0.3, 0.75, 70]];
for (const [n, x, y, z, yaw, pitch, dist] of views) {
  await page.evaluate(([x, y, z, yaw, pitch, dist]) => {
    const g = window.game, yy = y ?? g.stage.terrainHeight(x, z);
    g.player.pos.set(x, yy + 0.2, z); g.player.vel.set(0, 0, 0); g.player.lastSafe.set(x, yy + 0.2, z);
    g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; g.cam.target.set(x, yy + 1.2, z);
  }, [x, y, z, yaw, pitch, dist]);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `test-results/city/${n}.png` });
}
console.log('errors:', errors.length ? [...new Set(errors)] : 'none');
await browser.close(); await server.close();
