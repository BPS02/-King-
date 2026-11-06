// Original Japanese-style soundtrack, composed and played live with the Web Audio API.
// Nothing is loaded from files: every instrument is synthesized here, and the tunes are generated
// from traditional Japanese five-note scales, so each place sounds a little different each visit.
//
//   koto       - plucked zither (a few sine partials with a fast pluck and long decay)
//   shamisen   - bright, buzzy plucked lute (filtered sawtooth)
//   shakuhachi - breathy bamboo flute (sine + breath noise, slides into notes, vibrato)
//   taiko      - big drum (falling sine thump + noise) and "ka" rim clicks
//   furin      - wind-chime bells (inharmonic sine partials)
//   drone      - soft sustained pad under everything
//
// Each place has a mood: scale, key, tempo and which instruments play.

const YO = [0, 2, 5, 7, 9];      // bright, folk / festival
const IN = [0, 1, 5, 7, 8];      // classic, wistful (Miyako-bushi)
const HIRA = [0, 2, 3, 7, 8];    // dark, mysterious (Hirajoshi)

const MOODS = {
  hub: { name: 'Castle Town Festival', scale: YO, root: 62, tempo: 92, pluck: 'koto', pattern: 'festival', flute: 0.8, drums: 'festival', bells: 0.05, drone: 0.7, prog: [0, 0, 3, 2, 0, 0, 4, 3] },
  sakura: { name: 'Cherry Blossom Trail', scale: IN, root: 64, tempo: 72, pluck: 'koto', pattern: 'arp', flute: 0.7, drums: null, bells: 0.08, drone: 0.6, prog: [0, 0, 3, 3, 2, 2, 4, 0] },
  bamboo: { name: 'Moonlit Bamboo', scale: HIRA, root: 62, tempo: 58, pluck: 'koto', pattern: 'sparse', flute: 0.9, drums: 'wood', bells: 0.18, drone: 1, prog: [0, 0, 3, 0, 4, 3, 0, 0] },
  lantern: { name: 'Lantern Night', scale: IN, root: 62, tempo: 80, pluck: 'shamisen', pattern: 'shamisen', flute: 0.6, drums: 'soft', bells: 0.12, drone: 0.7, prog: [0, 3, 0, 4, 0, 3, 2, 0] },
  volcano: { name: 'Fire Mountain', scale: HIRA, root: 50, tempo: 104, pluck: 'shamisen', pattern: 'drive', flute: 0.6, drums: 'heavy', bells: 0, drone: 1, prog: [0, 0, 1, 0, 0, 0, 4, 3] },
  sky: { name: 'Above the Clouds', scale: YO, root: 67, tempo: 66, pluck: 'koto', pattern: 'arp', flute: 0.7, drums: null, bells: 0.3, drone: 0.8, prog: [0, 3, 2, 3, 0, 4, 3, 0] },
};

// Pluck patterns: one bar of 16 steps, numbers are scale steps above the chord root (null = rest).
const PATTERNS = {
  festival: [0, null, 4, null, 5, null, 4, null, 7, null, 5, null, 4, null, 2, null],
  arp: [0, null, 2, null, 4, null, 5, null, 7, null, 5, null, 4, null, 2, null],
  sparse: [0, null, null, null, null, null, 4, null, null, null, 5, null, null, null, null, null],
  shamisen: [0, null, 0, 4, null, null, 5, null, 4, null, 0, null, 2, null, 4, null],
  drive: [0, 0, null, 0, 3, null, 0, 0, null, 0, 4, null, 3, null, 1, null],
};
// Drum patterns: 'd' = big drum, 'k' = rim click / wood block.
const DRUMS = {
  festival: 'd...k...d.d.k.k.',
  soft: 'd.......k.......',
  heavy: 'd..d..d.d..d.kkk',
  wood: '....k.......k...',
};
// Flute rhythms for a two-bar phrase, in 16th-note steps (sum = 32). Negative = rest.
const RHYTHMS = [[8, 4, 4, 12, 4], [4, 4, 8, 16], [6, 2, 8, 8, 8], [12, 4, 16], [4, 4, 4, 4, 16], [8, 8, -4, 4, 8], [16, 8, 8]];

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Music {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('kingdom-music') !== 'off';
    this.volume = 0.7;
    this.moodId = null;
    this.notes = 0;               // how many notes have been played (used by the tests)
    this.ducked = false;
  }

  // Browsers only allow sound after the player clicks or presses a key, so this is called then.
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.setup(new AudioContext());
    this.timer = setInterval(() => this.tick(), 50);
    if (this.moodId) this.begin(this.moodId);
  }

  // Build the mixer: instruments -> dry + reverb -> place fade -> master volume -> compressor.
  setup(ctx) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(comp);
    this.bus = ctx.createGain();            // faded when changing places
    this.bus.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.bus);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.45;
    this.wet.connect(this.reverb).connect(this.bus);
    this.sfx = ctx.createGain();            // jingles are not affected by the place fade
    this.sfx.connect(this.master);
    this.sfx.connect(this.wet);
    // White noise for breath, plucks and drums.
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  // Render some seconds of a place's music silently into an audio buffer (used by the tests,
  // and handy for saving samples to listen to).
  static async render(id, seconds = 20, sampleRate = 44100) {
    const m = new Music();
    m.enabled = true;
    m.setup(new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate));
    m.mood = MOODS[id] || MOODS.sakura;
    m.step = 0; m.section = -1; m.seed = 12345;
    m.bus.gain.value = 1;
    const stepDur = 60 / m.mood.tempo / 4;
    for (let t = 0.1; t < seconds - 0.5; t += stepDur) m.playStep(m.step++, t, stepDur);
    return m.ctx.startRendering();
  }

  impulse(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem('kingdom-music', on ? 'on' : 'off');
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume * (this.ducked ? 0.45 : 1) : 0, this.ctx.currentTime, 0.2);
  }

  // Quieter while someone is talking.
  duck(on) {
    this.ducked = on;
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(this.volume * (on ? 0.45 : 1), this.ctx.currentTime, 0.3);
  }

  // Switch to the music of a place (fades out the old tune first).
  setMood(id) {
    const key = MOODS[id] ? id : 'sakura';
    if (key === this.moodId) return;
    this.moodId = key;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + 1.2);
    clearTimeout(this.switching);
    this.switching = setTimeout(() => this.begin(key), 1250);
  }

  begin(key) {
    this.mood = MOODS[key];
    this.step = 0;
    this.section = -1;
    this.seed = Math.floor(Math.random() * 1e9);
    this.nextTime = this.ctx.currentTime + 0.15;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setValueAtTime(0, this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2);
  }

  // ------------------------------------------------------------------ the composer
  // A section is 8 bars. Two flute motifs (A and B) are made per section and replayed over the
  // chords in the form A B A C, so the tune repeats enough to be catchy.
  newSection() {
    const r = rng(this.seed + this.section * 7919), m = this.mood;
    const motif = () => {
      const rhythm = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
      let deg = 5 + Math.floor(r() * 3) - 1;            // start around an octave above the chord root
      const notes = [];
      rhythm.forEach((len, i) => {
        if (len < 0) { notes.push({ len: -len, deg: null }); return; }
        if (i > 0) deg += [-2, -1, -1, 1, 1, 2, 0][Math.floor(r() * 7)];
        deg = Math.max(2, Math.min(9, deg));
        if (i === rhythm.length - 1) deg = r() < 0.6 ? 5 : 3 + (r() < 0.5 ? 0 : 5);   // end on a chord tone
        notes.push({ len, deg });
      });
      return notes;
    };
    const A = motif(), B = motif(), C = motif();
    this.phrases = [A, B, A, r() < 0.5 ? C : B];
    this.fluteOn = r() < m.flute;                         // sometimes the flute rests a whole section
    this.patternShift = r() < 0.3 ? 1 : 0;                // small variation of the pluck pattern
  }

  tick() {
    if (!this.ctx || !this.mood) return;
    const m = this.mood, stepDur = 60 / m.tempo / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  playStep(step, t, stepDur) {
    const m = this.mood, s = m.scale;
    const bar = Math.floor(step / 16), inBar = step % 16;
    if (bar % 8 === 0 && inBar === 0 && Math.floor(bar / 8) !== this.section) { this.section = Math.floor(bar / 8); this.newSection(); }
    const chord = m.prog[bar % m.prog.length];
    const note = (deg, octave = 0) => m.root + s[((deg % 5) + 5) % 5] + 12 * (Math.floor(deg / 5) + octave);

    // Drone: root and fifth, one long note per bar.
    if (inBar === 0 && m.drone) {
      this.drone(t, midiHz(note(chord, -2)), stepDur * 16, m.drone);
      this.drone(t, midiHz(note(chord + 3, -2)), stepDur * 16, m.drone * 0.6);
    }
    // Plucked accompaniment.
    const p = PATTERNS[m.pattern][(inBar + this.patternShift * 2) % 16];
    if (p !== null && p !== undefined && !(m.pattern === 'sparse' && bar % 2 && inBar > 8)) {
      const f = midiHz(note(chord + p, -1)), accent = inBar % 4 === 0 ? 1 : 0.7;
      if (m.pluck === 'shamisen') this.shamisen(t, f, accent); else this.koto(t, f, accent);
    }
    // Flute melody over the chords.
    if (this.fluteOn) {
      const phrase = this.phrases[Math.floor((bar % 8) / 2)];
      let pos = (bar % 2) * 16 + inBar, at = 0;
      for (const n of phrase) {
        if (pos === at && n.deg !== null) this.flute(t, midiHz(note(chord + n.deg, -1)), n.len * stepDur * 0.95);
        at += n.len;
      }
    }
    // Drums.
    if (m.drums) {
      const ch = DRUMS[m.drums][inBar];
      if (ch === 'd') this.taiko(t, inBar === 0 ? 1 : 0.75);
      if (ch === 'k') this.ka(t, m.drums === 'wood');
      if (m.drums === 'festival' && bar % 4 === 3 && inBar >= 12) this.taiko(t, 0.5);   // little roll into the next phrase
    }
    // Wind chimes now and then.
    if (m.bells && inBar % 4 === 0 && Math.random() < m.bells) this.bell(t + Math.random() * 0.1, midiHz(note(Math.floor(Math.random() * 5) + 10, -1)));
  }

  // ------------------------------------------------------------------ instruments
  out(node, wet = 0.4) {
    node.connect(this.dry);
    if (wet) { const g = this.ctx.createGain(); g.gain.value = wet; node.connect(g).connect(this.wet); }
  }

  env(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  noiseBurst(t, dur, filterType, freq, q, gainPeak, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.env(t, gainPeak, 0.002, dur);
    src.connect(f).connect(g);
    if (dest) g.connect(dest); else this.out(g, 0.3);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  koto(t, f, vel = 1) {
    this.notes++;
    const ctx = this.ctx, mix = ctx.createGain();
    mix.gain.value = 0.16 * vel;
    [[1, 1, 1.9], [2, 0.45, 1.2], [3, 0.3, 0.8], [4.01, 0.16, 0.5], [5.03, 0.08, 0.35]].forEach(([k, a, dec]) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * k * 1.006, t);
      o.frequency.exponentialRampToValueAtTime(f * k, t + 0.06);          // the string settles after the pluck
      const g = this.env(t, a, 0.004, dec);
      o.connect(g).connect(mix);
      o.start(t); o.stop(t + dec + 0.1);
    });
    this.out(mix, 0.4);
    this.noiseBurst(t, 0.03, 'bandpass', f * 3, 2, 0.05 * vel);
  }

  shamisen(t, f, vel = 1) {
    this.notes++;
    const ctx = this.ctx, o = ctx.createOscillator(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.35);
    const g = this.env(t, 0.1 * vel, 0.003, 0.55);
    o.connect(lp).connect(g);
    this.out(g, 0.3);
    o.start(t); o.stop(t + 0.7);
    this.noiseBurst(t, 0.02, 'highpass', 2500, 1, 0.06 * vel);             // the plectrum "snap"
  }

  flute(t, f, dur) {
    this.notes++;
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o2.type = 'triangle';
    // Slide up into the note, then vibrato that grows as the note is held.
    for (const osc of [o, o2]) {
      osc.frequency.setValueAtTime(f * 0.94, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    }
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + Math.min(0.35, dur * 0.4));
    depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.max(0.4, dur * 0.8));
    lfo.connect(depth); depth.connect(o.frequency); depth.connect(o2.frequency);
    const g = ctx.createGain(), peak = 0.13, rel = Math.min(0.25, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.08);
    g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.09, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2).connect(g);
    this.out(g, 0.55);
    // Breath: a soft hiss shaped like the note.
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    src.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.5;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
    bg.gain.exponentialRampToValueAtTime(0.015, t + 0.25);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    src.connect(bp).connect(bg);
    this.out(bg, 0.4);
    const end = t + dur + 0.1;
    for (const n of [o, o2, lfo]) { n.start(t); n.stop(end); }
    src.start(t, Math.random()); src.stop(end);
  }

  taiko(t, vel = 1) {
    this.notes++;
    const ctx = this.ctx, o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = this.env(t, 0.55 * vel, 0.004, 0.7);
    o.connect(g);
    this.out(g, 0.35);
    o.start(t); o.stop(t + 0.8);
    this.noiseBurst(t, 0.08, 'lowpass', 400, 1, 0.25 * vel);
  }

  ka(t, wood = false) {
    this.notes++;
    if (wood) {   // hollow bamboo / wood block
      const o = this.ctx.createOscillator();
      o.frequency.value = 780 + Math.random() * 60;
      const g = this.env(t, 0.12, 0.002, 0.12);
      o.connect(g); this.out(g, 0.5);
      o.start(t); o.stop(t + 0.2);
    } else this.noiseBurst(t, 0.04, 'bandpass', 3200, 3, 0.18);
  }

  bell(t, f) {
    this.notes++;
    [[1, 0.07, 3], [2.76, 0.03, 1.8], [5.4, 0.015, 1]].forEach(([k, a, dec]) => {
      const o = this.ctx.createOscillator();
      o.frequency.value = f * k;
      const g = this.env(t, a, 0.003, dec);
      o.connect(g); this.out(g, 0.7);
      o.start(t); o.stop(t + dec + 0.1);
    });
  }

  drone(t, f, dur, level) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03 * level, t + Math.min(1.2, dur * 0.4));
    g.gain.setValueAtTime(0.03 * level, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.0);
    lp.connect(g); this.out(g, 0.6);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.1);
    }
  }

  // ------------------------------------------------------------------ jingles
  // Rising koto run, drum and bells: a Royal Star or Crown Jewel was found.
  jingle(big = true) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.05, root = 62, sc = YO, saveDry = this.dry, saveWet = this.wet;
    this.dry = this.sfx;           // play through the jingle channel so it's heard during the place fade
    const steps = big ? 10 : 6;
    for (let i = 0; i < steps; i++) {
      const m = root + sc[i % 5] + 12 * Math.floor(i / 5);
      this.koto(t + i * 0.08, midiHz(m), 1);
    }
    if (big) { this.taiko(t, 1); this.taiko(t + steps * 0.08, 1); }
    this.bell(t + steps * 0.08, midiHz(root + 24));
    if (big) this.bell(t + steps * 0.08 + 0.15, midiHz(root + 31));
    this.dry = saveDry; this.wet = saveWet;
  }

  // A soft chime (checkpoint lit).
  chime() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.02, saveDry = this.dry;
    this.dry = this.sfx;
    this.bell(t, midiHz(81)); this.bell(t + 0.12, midiHz(86));
    this.dry = saveDry;
  }

  get moodName() { return this.mood?.name || ''; }
}
