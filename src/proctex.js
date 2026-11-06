import * as THREE from 'three';
import { rng } from './stage.js';

// Small cut-out textures drawn in code (they have transparent backgrounds, which photo-scanned
// ground textures can't provide): cherry-blossom clusters, bamboo leaves, grass blades, petals.

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A loose cluster of five-petal blossoms on thin twigs. Mostly white-pink so instance tints show.
let blossom;
export function blossomTexture() {
  if (blossom) return blossom;
  blossom = canvasTex(256, (g, S) => {
    const r = rng(42);
    g.strokeStyle = 'rgba(70,40,35,0.9)'; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      g.lineWidth = 2 + r() * 2;
      g.beginPath(); g.moveTo(S / 2, S / 2);
      g.quadraticCurveTo(S * (0.2 + r() * 0.6), S * (0.2 + r() * 0.6), S * (0.1 + r() * 0.8), S * (0.1 + r() * 0.8));
      g.stroke();
    }
    for (let i = 0; i < 95; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.42;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, pr = 9 + r() * 9, rot = r() * Math.PI;
      for (let k = 0; k < 5; k++) {
        const pa = rot + (k / 5) * Math.PI * 2;
        const grad = g.createRadialGradient(x, y, 0, x, y, pr * 1.6);
        const shade = 235 + Math.floor(r() * 20);
        grad.addColorStop(0, 'rgb(255,190,210)');
        grad.addColorStop(1, `rgb(${shade},${shade - 10},${shade - 4})`);
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(x + Math.cos(pa) * pr * 0.75, y + Math.sin(pa) * pr * 0.75, pr * 0.62, pr * 0.42, pa, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgb(200,60,90)';
      g.beginPath(); g.arc(x, y, pr * 0.22, 0, Math.PI * 2); g.fill();
    }
  });
  return blossom;
}

// A spray of slender bamboo leaves.
let leaf;
export function leafTexture() {
  if (leaf) return leaf;
  leaf = canvasTex(256, (g, S) => {
    const r = rng(7);
    g.strokeStyle = 'rgb(60,80,40)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.6, len = S * (0.28 + r() * 0.2);
      const x0 = S / 2 + (r() - 0.5) * 30, y0 = S / 2 + (r() - 0.5) * 30;
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      const w = 7 + r() * 5, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const tone = 150 + Math.floor(r() * 60);
      g.fillStyle = `rgb(${tone - 60},${tone + 30},${tone - 90})`;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + nx, (y0 + y1) / 2 + ny, x1, y1);
      g.quadraticCurveTo((x0 + x1) / 2 - nx, (y0 + y1) / 2 - ny, x0, y0);
      g.fill();
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  });
  return leaf;
}

// Tufts of grass blades (bottom of the image = ground).
let grass;
export function grassTexture() {
  if (grass) return grass;
  grass = canvasTex(128, (g, S) => {
    const r = rng(3);
    for (let i = 0; i < 46; i++) {
      const x = S * (0.08 + r() * 0.84), h = S * (0.45 + r() * 0.5), bend = (r() - 0.5) * 30, w = 1.5 + r() * 2.5;
      const tone = 110 + Math.floor(r() * 80);
      const grad = g.createLinearGradient(0, S, 0, S - h);
      grad.addColorStop(0, `rgb(${tone * 0.35 | 0},${tone * 0.55 | 0},${tone * 0.2 | 0})`);
      grad.addColorStop(1, `rgb(${tone * 0.85 | 0},${tone | 0},${tone * 0.45 | 0})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - w, S);
      g.quadraticCurveTo(x + bend * 0.5, S - h * 0.6, x + bend, S - h);
      g.quadraticCurveTo(x + bend * 0.5 + w * 0.3, S - h * 0.6, x + w, S);
      g.fill();
    }
  });
  grass.wrapS = THREE.ClampToEdgeWrapping;
  return grass;
}

// A single soft cherry petal for the falling-petal particles.
let petal;
export function petalTexture() {
  if (petal) return petal;
  petal = canvasTex(64, (g, S) => {
    const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgb(255,215,228)');
    grad.addColorStop(1, 'rgb(250,170,195)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(S / 2, S * 0.1);
    g.bezierCurveTo(S * 0.95, S * 0.25, S * 0.85, S * 0.85, S / 2, S * 0.92);
    g.bezierCurveTo(S * 0.15, S * 0.85, S * 0.05, S * 0.25, S / 2, S * 0.1);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(S / 2, S * 0.08, S * 0.08, 0, Math.PI * 2); g.fill();
  });
  return petal;
}

// Bamboo stalk skin: green with darker node rings (8 per stalk) and faint vertical fibres.
let bamboo;
export function bambooTexture() {
  if (bamboo) return bamboo;
  bamboo = canvasTex(256, (g, S) => {
    const grad = g.createLinearGradient(0, S, 0, 0);
    grad.addColorStop(0, '#5f9a44'); grad.addColorStop(1, '#93c766');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    const r = rng(11);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(30,60,20,${0.05 + r() * 0.08})`; g.fillRect(r() * S, 0, 1 + r() * 2, S); }
    for (let k = 0; k < 8; k++) {
      const y = S - (k + 0.5) * (S / 8);
      g.fillStyle = 'rgba(40,70,30,0.9)'; g.fillRect(0, y - 2, S, 4);
      g.fillStyle = 'rgba(200,230,160,0.5)'; g.fillRect(0, y + 2, S, 2);
    }
  });
  return bamboo;
}
