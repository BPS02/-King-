// Townspeople check: walk up to the King and a patrolling watchman, talk with E, read every line,
// check they stop and turn to face you, and that walking away ends the conversation.
// Usage: node tests/talk.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
fs.mkdirSync('test-results/city', { recursive: true });
const server = await createServer({ server: { port: 5192 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Ignore any real game controller plugged into this PC (its stick would move the hero).
await page.addInitScript(() => { navigator.getGamepads = () => []; });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto('http://localhost:5192/?quality=low');
await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 240000 });
await page.waitForTimeout(800);
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) process.exitCode = 1; };
const ui = () => page.evaluate(() => ({
  prompt: document.getElementById('talk').style.display === 'block' ? document.getElementById('talk').textContent : null,
  open: document.getElementById('dialog').style.display === 'block',
  who: document.querySelector('#dialog .who').textContent,
  text: document.querySelector('#dialog .text').textContent,
}));
const stand = async (x, y, z, ms = 900) => {
  await page.evaluate(([x, y, z]) => { const g = window.game; g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0); g.player.lastSafe.set(x, y, z); g.cam.target.set(x, y + 1.2, z); }, [x, y, z]);
  await page.waitForTimeout(ms);
};
const press = async (key = 'KeyE') => { await page.keyboard.down(key === 'KeyE' ? 'e' : 'Enter'); await page.waitForTimeout(120); await page.keyboard.up(key === 'KeyE' ? 'e' : 'Enter'); await page.waitForTimeout(500); };
const people = await page.evaluate(() => window.game.stage.npcs.map((n) => ({ name: n.name, pos: n.root.position.toArray() })));
console.log('people:', people.map((p) => p.name).join(', '));
ok('townspeople have names', people.length >= 6);

// The King.
const king = people.find((p) => p.name === 'The King');
await stand(king.pos[0] + 1.2, king.pos[1], king.pos[2] + 2.0);
let u = await ui();
ok('prompt appears next to the King', u.prompt?.includes('Talk to The King'), u.prompt);
await press();
await page.waitForFunction(() => window.game.talk.who, null, { timeout: 15000 }).catch(() => {});
u = await ui();
ok('E opens the King dialogue', u.open && u.who === 'The King', u.who);
await page.waitForFunction(() => { const t = window.game.talk; return t.who && t.shown >= t.full.length; }, null, { timeout: 30000 }).catch(() => {});
u = await ui();
ok('first line is typed out', u.text.startsWith('Ah, my brave samurai'), u.text);
await page.screenshot({ path: 'test-results/city/talk-king.png' });
// Read every line: wait for it to finish typing, then press E for the next one.
const seen = [u.text];
for (let i = 0; i < 12; i++) {
  const before = await page.evaluate(() => window.game.talk.i);
  await press();
  await page.waitForFunction((b) => { const t = window.game.talk; return !t.who || (t.i !== b && t.shown >= t.full.length); }, before, { timeout: 30000 }).catch(() => {});
  const v = await ui();
  if (!v.open) break;
  seen.push(v.text);
}
u = await ui();
ok('conversation ends after the last line', !u.open && seen.length === 5, `${seen.length} lines: ${seen.map((t) => t.slice(0, 24)).join(' | ')}`);
ok('King talks about the Royal Stars', seen.some((t) => /Royal Star/.test(t)));

// A watchman walking his patrol: he stops, turns to face you, and walking away ends the talk.
const before = await page.evaluate(() => { const n = window.game.stage.npcs.find((p) => p.name === 'Watchman Taro'); return n.root.position.toArray(); });
await stand(before[0] + 2.0, before[1], before[2], 300);
await press();
const t0 = await page.evaluate(() => { const n = window.game.stage.npcs.find((p) => p.name === 'Watchman Taro'); return { pos: n.root.position.toArray(), rot: n.root.rotation.y, talking: n.talking }; });
await page.waitForTimeout(1500);
const t1 = await page.evaluate(() => { const g = window.game, n = g.stage.npcs.find((p) => p.name === 'Watchman Taro'); return { pos: n.root.position.toArray(), rot: n.root.rotation.y, want: Math.atan2(g.player.pos.x - n.root.position.x, g.player.pos.z - n.root.position.z) }; });
const moved = Math.hypot(t1.pos[0] - t0.pos[0], t1.pos[2] - t0.pos[2]);
const face = Math.abs(Math.atan2(Math.sin(t1.rot - t1.want), Math.cos(t1.rot - t1.want)));
ok('watchman stops to talk', t0.talking && moved < 0.05, `moved ${moved.toFixed(2)} m`);
ok('watchman turns to face the hero', face < 0.3, `off by ${face.toFixed(2)} rad`);
await page.screenshot({ path: 'test-results/city/talk-watchman.png' });
await stand(t1.pos[0] + 9, t1.pos[1], t1.pos[2], 600);
u = await ui();
const walking = await page.evaluate(() => window.game.stage.npcs.find((p) => p.name === 'Watchman Taro').talking);
ok('walking away ends the conversation', !u.open && !walking);
await page.waitForTimeout(1500);
const t2 = await page.evaluate(() => window.game.stage.npcs.find((p) => p.name === 'Watchman Taro').root.position.toArray());
ok('watchman goes back to his patrol', Math.hypot(t2[0] - t1.pos[0], t2[2] - t1.pos[2]) > 0.3);
console.log('errors:', errors.length ? [...new Set(errors)] : 'none');
await browser.close(); await server.close();
