// Keyboard + mouse + game controller state. Other code just reads input.move, input.jumpPressed, etc.

// PlayStation (DualSense / DualShock 4) buttons in the browser's standard gamepad layout.
// Xbox and other controllers use the same slots (A=Cross, B=Circle, X=Square, Y=Triangle).
export const PAD = { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, L1: 4, R1: 5, L2: 6, R2: 7, CREATE: 8, OPTIONS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.18;                          // ignore tiny stick drift
const deadzone = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.jumpPressed = false;   // true for one frame when jump is first pressed
    this.attackPressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;
    this.padStick = { x: 0, y: 0 };   // left stick (move)
    this.padHeld = new Set();         // controller buttons held now
    this.padTaps = new Set();         // controller buttons pressed this frame
    this.padName = null;              // connected controller, if any

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyJ') { this.attackPressed = true; this.attackCount = (this.attackCount || 0) + 1; }
      if (e.code === 'Escape') this.escapePressed = true;
      if (e.code === 'KeyL') this.kickPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.wheel = 0;
    dom.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });

    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.rightMouse = true; return; }   // right mouse button = block
      this.dragging = true;
      this.dragDist = 0;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      this.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button === 2) { this.rightMouse = false; return; }
      // A click (not a drag) attacks.
      if (this.dragging && this.dragDist < 6) { this.attackPressed = true; this.attackCount = (this.attackCount || 0) + 1; }
      this.dragging = false;
    });
  }

  // Read the game controller once per frame (browsers only report gamepads by polling).
  // dt = seconds since last frame, used to turn the right stick into smooth camera motion.
  pollGamepad(dt) {
    this.padTaps.clear();
    const pad = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected && p.mapping === 'standard')
      || [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
    this.padName = pad ? pad.id : null;
    if (!pad) { this.padHeld.clear(); this.padStick = { x: 0, y: 0 }; this.padTilt = 0; return; }
    const held = new Set();
    pad.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) held.add(i); });
    for (const i of held) if (!this.padHeld.has(i)) this.padTaps.add(i);
    this.padHeld = held;
    const ax = pad.axes;
    // Left stick: move. Radial deadzone so diagonals feel right.
    let lx = ax[0] || 0, ly = -(ax[1] || 0);
    const mag = Math.hypot(lx, ly), m = mag < DEAD ? 0 : Math.min(1, (mag - DEAD) / (1 - DEAD));
    // Gentle tilt = walk, full tilt = run (walkHeld picks the speed), so keep the strength near 1.
    this.padTilt = m;
    const k = m === 0 ? 0 : m < 0.6 ? Math.max(0.45, m / 0.6) : 1;
    this.padStick = m > 0 ? { x: lx / mag * k, y: ly / mag * k } : { x: 0, y: 0 };
    // Right stick: camera. Converted into the same units as a mouse drag.
    const rx = deadzone(ax[2] || 0), ry = deadzone(ax[3] || 0);
    this.mouseDX += rx * Math.abs(rx) * 2.8 * dt / 0.005;   // squared response = fine aim near center
    this.mouseDY += ry * Math.abs(ry) * 1.6 * dt / 0.004;
    // D-pad up/down: zoom the camera.
    if (held.has(PAD.UP)) this.wheel -= 600 * dt;
    if (held.has(PAD.DOWN)) this.wheel += 600 * dt;
    // One-shot actions.
    if (this.padTaps.has(PAD.CROSS)) this.jumpPressed = true;
    for (const b of [PAD.SQUARE, PAD.R1]) if (this.padTaps.has(b)) { this.attackPressed = true; this.attackCount = (this.attackCount || 0) + 1; }
    if (this.padTaps.has(PAD.CIRCLE) || this.padTaps.has(PAD.R2)) this.kickPressed = true;
    if (this.padTaps.has(PAD.CREATE)) this.escapePressed = true;
  }

  padTap(button) { return this.padTaps.has(button); }

  // Rumble the controller (if it supports it). strength 0..1, ms = how long.
  rumble(strength = 0.5, ms = 120) {
    const pad = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
  }

  get jumpHeld() { return this.keys.has('Space') || this.padHeld.has(PAD.CROSS); }
  get blockHeld() { return this.keys.has('KeyK') || !!this.rightMouse || this.padHeld.has(PAD.L1) || this.padHeld.has(PAD.L2); }
  // Shift walks; on a controller, tilting the stick only part way walks.
  get walkHeld() {
    const st = this.padTilt || 0;
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || (st > 0 && st < 0.6);
  }

  // x = right, y = forward, each -1..1
  get move() {
    const k = this.keys;
    if (this.padStick.x || this.padStick.y) return { ...this.padStick };
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  // Forget one-shot presses (used between physics steps within one frame).
  clearPresses() {
    this.jumpPressed = false;
    this.attackPressed = false;
    this.attackCount = 0;
    this.kickPressed = false;
  }

  endFrame() {
    this.jumpPressed = false;
    this.attackPressed = false;
    this.escapePressed = false;
    this.kickPressed = false;
    this.padTaps.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
