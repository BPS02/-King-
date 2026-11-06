// Soundtrack check: renders every place's music (24 s each) silently, checks it isn't silent or
// distorted, saves the samples to test-results/music/*.wav to listen to, and checks the music
// starts in the game, plays notes and changes when you enter a mountain.
// Usage: node tests/music.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
const OUT = 'test-results/music';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5191 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { navigator.getGamepads = () => []; });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) process.exitCode = 1; };
await page.goto('http://localhost:5191/?quality=low');
await page.waitForFunction(() => window.game && !window.game.busy, null, { timeout: 240000 });

for (const id of ['hub', 'sakura', 'bamboo', 'lantern', 'volcano', 'sky']) {
  const r = await page.evaluate(async (id) => {
    const { Music } = await import('/src/music.js');
    const buf = await Music.render(id, 24);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum = 0;
    for (let i = 0; i < L.length; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > peak) peak = v; sum += L[i] * L[i]; }
    // 16-bit stereo WAV.
    const n = L.length, data = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, str) => [...str].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
    data.setUint16(22, 2, true); data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * 4, true); data.setUint16(32, 4, true);
    data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(data.buffer); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { peak, rms: Math.sqrt(sum / n), wav: btoa(bin) };
  }, id);
  fs.writeFileSync(`${OUT}/${id}.wav`, Buffer.from(r.wav, 'base64'));
  ok(`${id}: music is audible and not distorted`, r.rms > 0.01 && r.peak < 1.0, `peak ${r.peak.toFixed(2)}, loudness ${r.rms.toFixed(3)}`);
}

// In the game: a key press starts the music; the town tune plays; entering a mountain changes it.
await page.keyboard.press('KeyW');
await page.waitForTimeout(3500);
const a = await page.evaluate(() => ({ state: window.game.music.ctx?.state, notes: window.game.music.notes, mood: window.game.music.moodName }));
await page.waitForTimeout(3000);
const b = await page.evaluate(() => ({ notes: window.game.music.notes }));
ok('music starts after a key press', a.state === 'running', a.state);
ok('town music is playing', a.mood === 'Castle Town Festival' && b.notes > a.notes, `${a.mood}, ${b.notes - a.notes} notes in 3 s`);
await page.evaluate(() => window.game.enter('volcano'));
await page.waitForFunction(() => !window.game.busy, null, { timeout: 120000 });
await page.waitForTimeout(3000);
const c = await page.evaluate(() => window.game.music.moodName);
ok('entering Fire Mountain changes the music', c === 'Fire Mountain', c);
await page.keyboard.press('KeyM');
await page.waitForTimeout(500);
const d = await page.evaluate(() => ({ on: window.game.music.enabled, stored: localStorage.getItem('kingdom-music') }));
ok('M turns the music off (and remembers it)', !d.on && d.stored === 'off');
await page.keyboard.press('KeyM');
console.log('errors:', errors.length ? [...new Set(errors)] : 'none');
await browser.close(); await server.close();
