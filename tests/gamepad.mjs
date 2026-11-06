// Controller check: plugs a pretend PlayStation controller into the page and drives the hero with it.
// Usage: node tests/gamepad.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  const pad = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad;
  window.__press = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  navigator.getGamepads = () => [pad];
});
await page.goto('http://localhost:5197/?level=sakura&quality=low');
await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 180000 });
await page.waitForTimeout(800);
const state = () => page.evaluate(() => { const g = window.game, p = g.player; return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), anim: p.currentName || Object.entries(p.actions).find(([, a]) => a === p.current)?.[0], yaw: +g.cam.yaw.toFixed(2), dist: +g.cam.dist.toFixed(2), speed: +Math.hypot(p.vel.x, p.vel.z).toFixed(2) }; });
const tap = async (i, ms = 450) => { await page.evaluate((i) => window.__press(i, true), i); await page.waitForTimeout(ms); await page.evaluate((i) => window.__press(i, false), i); };
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) process.exitCode = 1; };

const help = await page.evaluate(() => document.getElementById('helpKeys').textContent);
ok('controller help shown', help.includes('Left stick'), help.slice(0, 40));
const help2 = await page.evaluate(() => document.getElementById('help2').textContent);
ok('back hint uses Create button', help2.includes('Create'), help2);

let a = await state();
await page.evaluate(() => { const g = window.game; g.cam.yaw = g.player.facing + Math.PI; window.__pad.axes[1] = -1; });     // left stick fully forward (along the trail)
// Wait until he is up to speed (the slow test renderer can stall for a moment after the camera turns).
await page.waitForFunction(() => Math.hypot(window.game.player.vel.x, window.game.player.vel.z) > 6, null, { timeout: 10000 }).catch(() => {});
let b = await state();
await page.evaluate(() => { window.__pad.axes[1] = 0; });
const ran = b.speed;
ok('left stick runs', ran > 4 && b.anim === 'run', `${ran} m/s, anim ${b.anim}`);
await page.waitForTimeout(600);

a = await state();
await page.evaluate(() => { window.__pad.axes[1] = -0.4; });   // gentle tilt
await page.waitForFunction(() => Math.hypot(window.game.player.vel.x, window.game.player.vel.z) > 0.8, null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(600);
b = await state();
await page.evaluate(() => { window.__pad.axes[1] = 0; });
const walked = b.speed;
ok('gentle tilt walks (slower than running)', walked > 0.8 && walked < ran * 0.7 && b.anim === 'walk', `${walked} m/s, anim ${b.anim}`);
await page.waitForTimeout(600);

a = await state();
await page.evaluate(() => window.__press(0, true));          // hold Cross
let peak = a.y;
for (let i = 0; i < 6; i++) { await page.waitForTimeout(80); peak = Math.max(peak, (await state()).y); }
await page.evaluate(() => window.__press(0, false));
ok('Cross jumps', peak > a.y + 0.8, `rose ${(peak - a.y).toFixed(2)} m`);
await page.waitForTimeout(1500);

await page.evaluate(() => window.__press(2, true));           // Square (checked while the swing is playing)
await page.waitForFunction(() => /hit/.test(Object.entries(window.game.player.actions).find(([, a]) => a === window.game.player.current)?.[0] || ''), null, { timeout: 3000 }).catch(() => {});
b = await state();
await page.evaluate(() => window.__press(2, false));
ok('Square swings the sword', /hit|attack/.test(b.anim), b.anim);
await page.waitForTimeout(1500);

a = await state();
await page.evaluate(() => { window.__pad.axes[2] = 1; });      // right stick right
await page.waitForTimeout(600);
await page.evaluate(() => { window.__pad.axes[2] = 0; });
b = await state();
ok('right stick turns camera', Math.abs(b.yaw - a.yaw) > 0.5, `${a.yaw} -> ${b.yaw}`);

a = await state();
await page.evaluate(() => window.__press(13, true));            // D-pad down = zoom out
await page.waitForTimeout(500);
await page.evaluate(() => window.__press(13, false));
b = await state();
ok('D-pad zooms', b.dist > a.dist + 0.3, `${a.dist} -> ${b.dist}`);

await tap(9);                                                   // Options
await page.waitForTimeout(200);
ok('Options opens graphics menu', await page.evaluate(() => document.getElementById('settings').classList.contains('open')));
a = await state();
await page.evaluate(() => { window.__pad.axes[1] = -1; });
await page.waitForTimeout(600);
await page.evaluate(() => { window.__pad.axes[1] = 0; });
b = await state();
ok('hero stays put while menu is open', Math.hypot(b.x - a.x, b.z - a.z) < 0.3);
await tap(13); await page.waitForTimeout(150);
const focus = await page.evaluate(() => document.querySelector('#settings button.focus')?.textContent);
ok('D-pad highlights a menu button', !!focus, focus);
await tap(1);                                                   // Circle closes
await page.waitForTimeout(200);
ok('Circle closes menu', !(await page.evaluate(() => document.getElementById('settings').classList.contains('open'))));

await tap(8);                                                   // Create = back to hub
await page.waitForFunction(() => window.game.current === 'hub' && !window.game.busy, null, { timeout: 120000 }).catch(() => {});
ok('Create returns to the Kingdom', await page.evaluate(() => window.game.current) === 'hub');
await page.screenshot({ path: 'test-results/gamepad-hub.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close(); await server.close();
