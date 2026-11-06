// Hero check: loads the game, plays every move (incl. the sword combo, block and kick),
// and saves screenshots to test-results/hero/.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

const OUT = 'test-results/hero';
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
await page.goto('http://localhost:5199/?level=sakura&quality=low');
await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const anim = () => page.evaluate(() => window.game.player.current?.getClip().name);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const view = (yaw, dist = 4, pitch = 0.2) => page.evaluate(([y, d, p]) => { const c = window.game.cam; c.yaw = y; c.dist = d; c.pitch = p; }, [yaw, dist, pitch]);

console.log('clips', await page.evaluate(() => Object.keys(window.game.player.actions)));
console.log('weapons', await page.evaluate(() => ({ katana: !!window.game.player.katana, shield: !!window.game.player.shield })));
await view(Math.PI * 0.8);
await page.waitForTimeout(800);
await shot('1-idle-weapons');

// 3-hit combo: tap J three times, watch the moves chain.
const seen = [];
const watch = setInterval(async () => { try { const a = await anim(); if (seen.at(-1) !== a) seen.push(a); } catch {} }, 60);
await view(Math.PI * 0.6, 4.5);
// Press like a player does: again during each swing (no slow screenshots in between).
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(i === 0 ? 350 : 450);
}
await shot('2-combo-finisher');
await page.waitForTimeout(2500);
clearInterval(watch);
console.log('combo sequence:', seen.join(' -> '));

await page.keyboard.down('KeyK');
await page.waitForTimeout(900);
console.log('holding block:', await anim());
await view(Math.PI * 0.85, 4);
await page.waitForTimeout(300);
await shot('3-block');
await page.keyboard.up('KeyK');
await page.waitForTimeout(600);
console.log('released block:', await anim());

await page.keyboard.press('KeyL');
await page.waitForTimeout(500);
console.log('kick:', await anim());
await view(Math.PI * 0.5, 4);
await page.waitForTimeout(150);
await shot('4-kick');
await page.waitForTimeout(2000);

await view(0, 6, 0.3);
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
console.log('running:', await anim());
await shot('5-run');
await page.keyboard.up('KeyW');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
