// Keyboard + mouse state. Other code just reads input.move, input.jumpPressed, etc.
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.jumpPressed = false;   // true for one frame when jump is first pressed
    this.attackPressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyJ') this.attackPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('pointerdown', (e) => {
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
    dom.addEventListener('pointerup', () => {
      // A click (not a drag) attacks.
      if (this.dragging && this.dragDist < 6) this.attackPressed = true;
      this.dragging = false;
    });
  }

  get jumpHeld() { return this.keys.has('Space'); }
  get walkHeld() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  // x = right, y = forward, each -1..1
  get move() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  endFrame() {
    this.jumpPressed = false;
    this.attackPressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
