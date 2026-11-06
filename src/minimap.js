// A small map in the corner: ground colors, platforms, goal stars, portals, and the king's arrow.
// North (-Z) is up. Works for any stage (with or without terrain).
export class Minimap {
  constructor(stage, size = 190) {
    this.stage = stage;
    this.size = size;
    this.canvas = document.getElementById('minimap');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');

    // Paint the static parts once into an off-screen image.
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = size;
    const b = this.base.getContext('2d');
    b.fillStyle = stage.map.bg;
    b.fillRect(0, 0, size, size);
    if (stage.heights && stage.mapColor) {
      const img = b.createImageData(size, size);
      for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
        const { x, z } = this.toWorld(px, py);
        const c = stage.mapColor(stage.terrainHeight(x, z));
        const i = (py * size + px) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
      b.putImageData(img, 0, 0);
    }
    // Platforms, buildings and islands (skip tiny things like trees and bamboo).
    b.fillStyle = stage.map.platform;
    const k = size / stage.map.size;
    for (const p of stage.platforms) {
      if (p.delta) continue;
      if (p.kind === 'box') {
        if (p.w * p.d < 1.5) continue;
        const a = this.toMap(p.minX, p.minZ);
        b.fillRect(a.x, a.y, p.w * k, p.d * k);
      } else if (p.r >= 0.8) {
        const c = this.toMap(p.x, p.z);
        b.beginPath(); b.arc(c.x, c.y, Math.max(1, p.r * k), 0, Math.PI * 2); b.fill();
      }
    }
  }

  toMap(x, z) {
    const m = this.stage.map;
    return { x: ((x - m.x) / m.size + 0.5) * this.size, y: ((z - m.z) / m.size + 0.5) * this.size };
  }
  toWorld(px, py) {
    const m = this.stage.map;
    return { x: (px / this.size - 0.5) * m.size + m.x, z: (py / this.size - 0.5) * m.size + m.z };
  }

  draw(player, camYaw) {
    const ctx = this.ctx;
    ctx.drawImage(this.base, 0, 0);

    for (const mv of this.stage.movers) {
      const a = this.toMap(mv.minX, mv.minZ), k = this.size / this.stage.map.size;
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(a.x, a.y, mv.w * k, mv.d * k);
    }
    for (const p of this.stage.portals) {
      const c = this.toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#c58bff'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    for (const j of this.stage.jewels) {
      if (!j.visible) continue;
      const p = this.toMap(j.position.x, j.position.z);
      star(ctx, p.x, p.y, 6, '#ffd84a');
    }

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
