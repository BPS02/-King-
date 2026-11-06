import { WORLD_SIZE, PLACES } from './world.js';

// A small map in the corner: terrain colors, Crown Jewel stars, and the king's arrow.
// North (-Z) is up.
export class Minimap {
  constructor(world, size = 190) {
    this.world = world;
    this.size = size;
    this.canvas = document.getElementById('minimap');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');

    // Paint the terrain once into an off-screen image.
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = size;
    const bctx = this.base.getContext('2d');
    const img = bctx.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const { x, z } = this.toWorld(px, py);
      const h = world.terrainHeight(x, z);
      let c;
      if (h < 0) c = [73, 182, 245];
      else if (h < 1) c = [242, 227, 160];
      else if (h > 36) c = [255, 255, 255];
      else if (h > 24) c = [168, 155, 181];
      else { const t = Math.min(1, h / 20); c = [139 - 50 * t, 224 - 50 * t, 95 - 30 * t]; }
      const i = (py * size + px) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    // Landmark markers.
    const castle = this.toMap(PLACES.castle.x, PLACES.castle.z);
    bctx.fillStyle = '#d9d2e3'; bctx.strokeStyle = '#3a2a6b'; bctx.lineWidth = 1.5;
    bctx.fillRect(castle.x - 5, castle.y - 4, 10, 8); bctx.strokeRect(castle.x - 5, castle.y - 4, 10, 8);
    const v = this.toMap(PLACES.village.x, PLACES.village.z);
    bctx.fillStyle = '#d9534f';
    for (let i = 0; i < 6; i++) { const a = i; bctx.fillRect(v.x + Math.cos(a) * 6 - 1.5, v.y + Math.sin(a) * 6 - 1.5, 3, 3); }
  }

  toMap(x, z) { return { x: ((x + WORLD_SIZE / 2) / WORLD_SIZE) * this.size, y: ((z + WORLD_SIZE / 2) / WORLD_SIZE) * this.size }; }
  toWorld(px, py) { return { x: (px / this.size) * WORLD_SIZE - WORLD_SIZE / 2, z: (py / this.size) * WORLD_SIZE - WORLD_SIZE / 2 }; }

  draw(player, camYaw) {
    const ctx = this.ctx;
    ctx.drawImage(this.base, 0, 0);

    for (const j of this.world.jewels) {
      if (!j.visible) continue;
      const p = this.toMap(j.position.x, j.position.z);
      star(ctx, p.x, p.y, 6, '#ffd84a');
    }

    // Camera view cone, then the king's arrow.
    const p = this.toMap(player.pos.x, player.pos.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-camYaw);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -26); ctx.lineTo(14, -26); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI - player.root.rotation.y);
    ctx.fillStyle = '#ff3355'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function star(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#7a2a10'; ctx.lineWidth = 1.2; ctx.stroke();
}
