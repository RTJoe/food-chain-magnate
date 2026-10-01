/**
 * Canvas-drawn textures: number badges (sprites), food icons and billboard posters. Original
 * flat icon drawings; cached by content so each texture is created once.
 */
import * as THREE from 'three';
import type { FoodId } from '@fcm/engine';
import { COLORS, FOOD_COLORS } from '../theme.js';

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif';
const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(key, t);
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export interface BadgeStyle {
  bg?: string;
  fg?: string;
  ring?: string;
  /** Pill instead of circle (wider text). */
  pill?: boolean;
}

export function badgeTexture(text: string, s: BadgeStyle = {}): THREE.Texture {
  const bg = s.bg ?? COLORS.surface;
  const fg = s.fg ?? COLORS.ink;
  const ring = s.ring ?? COLORS.ink;
  const pill = s.pill ?? text.length > 2;
  const W = pill ? 256 : 128;
  return canvasTex(`badge:${text}:${bg}:${fg}:${ring}:${pill}`, W, 128, (ctx) => {
    ctx.fillStyle = 'rgba(31,29,38,0.28)';
    roundRect(ctx, 8, 14, W - 16, 108, 54);
    ctx.fill();
    ctx.fillStyle = ring;
    roundRect(ctx, 6, 4, W - 12, 112, 56);
    ctx.fill();
    ctx.fillStyle = bg;
    roundRect(ctx, 16, 14, W - 32, 92, 46);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = text.length > 3 ? 52 : text.length > 2 ? 60 : 66;
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.fillText(text, W / 2, 63);
  });
}

/** A camera-facing badge sprite; `size` = world height. */
export function makeBadge(text: string, style: BadgeStyle = {}, size = 0.42): THREE.Sprite {
  const tex = badgeTexture(text, style);
  const aspect = (tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height;
  const mat = spriteMat(tex);
  const s = new THREE.Sprite(mat);
  s.scale.set(size * aspect, size, 1);
  s.renderOrder = 10;
  return s;
}

const spriteMats = new Map<string, THREE.SpriteMaterial>();
function spriteMat(tex: THREE.Texture): THREE.SpriteMaterial {
  let m = spriteMats.get(tex.uuid);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: true, transparent: true, toneMapped: false });
    spriteMats.set(tex.uuid, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Food icons (original drawings, 128x128, centred)
// ---------------------------------------------------------------------------

export function drawFood(ctx: CanvasRenderingContext2D, food: FoodId, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = (w = 5) => {
    ctx.strokeStyle = '#2b2a33';
    ctx.lineWidth = w;
    ctx.stroke();
  };
  switch (food) {
    case 'burger': {
      ctx.beginPath();
      ctx.moveTo(-40, -4);
      ctx.bezierCurveTo(-40, -42, 40, -42, 40, -4);
      ctx.closePath();
      ctx.fillStyle = '#e09a45';
      ctx.fill();
      outline();
      ctx.fillStyle = '#fff3d6';
      for (const [x, y] of [[-16, -20], [2, -26], [18, -17]] as const) {
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 2.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(-44, 2);
      for (let i = 0; i <= 8; i++) ctx.lineTo(-44 + i * 11, i % 2 ? 10 : 2);
      ctx.lineTo(44, 2);
      ctx.fillStyle = '#6fbf4a';
      ctx.fill();
      outline(4);
      roundRect(ctx, -42, 8, 84, 14, 7);
      ctx.fillStyle = FOOD_COLORS.burger;
      ctx.fill();
      outline();
      roundRect(ctx, -40, 24, 80, 16, 8);
      ctx.fillStyle = '#e09a45';
      ctx.fill();
      outline();
      break;
    }
    case 'pizza': {
      ctx.beginPath();
      ctx.moveTo(0, 42);
      ctx.lineTo(-38, -26);
      ctx.quadraticCurveTo(0, -48, 38, -26);
      ctx.closePath();
      ctx.fillStyle = '#f7c948';
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.moveTo(-38, -26);
      ctx.quadraticCurveTo(0, -48, 38, -26);
      ctx.lineTo(34, -18);
      ctx.quadraticCurveTo(0, -38, -34, -18);
      ctx.closePath();
      ctx.fillStyle = '#d98a3a';
      ctx.fill();
      outline(4);
      ctx.fillStyle = FOOD_COLORS.pizza === '#ef6f3c' ? '#d2412b' : FOOD_COLORS.pizza;
      for (const [x, y] of [[-12, -12], [12, -8], [0, 12]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'beer': {
      roundRect(ctx, -26, -24, 46, 64, 8);
      ctx.fillStyle = FOOD_COLORS.beer;
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.moveTo(20, -12);
      ctx.quadraticCurveTo(42, -12, 40, 8);
      ctx.quadraticCurveTo(40, 26, 20, 24);
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#2b2a33';
      ctx.stroke();
      ctx.beginPath();
      for (const [x, r] of [[-18, 12], [0, 14], [16, 11]] as const) ctx.arc(x, -26, r, Math.PI, 0);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      outline(4);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      roundRect(ctx, -18, -8, 7, 38, 3);
      ctx.fill();
      break;
    }
    case 'lemonade': {
      ctx.beginPath();
      ctx.moveTo(-28, -30);
      ctx.lineTo(28, -30);
      ctx.lineTo(20, 40);
      ctx.lineTo(-20, 40);
      ctx.closePath();
      ctx.fillStyle = FOOD_COLORS.lemonade;
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.moveTo(6, -30);
      ctx.lineTo(22, -50);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#e25b8b';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-24, -30, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#f2d130';
      ctx.fill();
      outline(4);
      ctx.beginPath();
      ctx.arc(-24, -30, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6a8';
      ctx.fill();
      break;
    }
    case 'soft_drink': {
      roundRect(ctx, -22, -40, 44, 80, 10);
      ctx.fillStyle = '#b8352c';
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.moveTo(-22, 2);
      ctx.bezierCurveTo(-8, -12, 8, 16, 22, 0);
      ctx.lineTo(22, 12);
      ctx.bezierCurveTo(8, 28, -8, 0, -22, 14);
      ctx.closePath();
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      roundRect(ctx, -18, -44, 36, 8, 4);
      ctx.fillStyle = '#c9ced6';
      ctx.fill();
      outline(4);
      break;
    }
    case 'coffee': {
      ctx.beginPath();
      ctx.ellipse(0, 34, 42, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      outline(4);
      ctx.beginPath();
      ctx.moveTo(-30, -10);
      ctx.lineTo(30, -10);
      ctx.quadraticCurveTo(28, 30, 0, 30);
      ctx.quadraticCurveTo(-28, 30, -30, -10);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.ellipse(0, -10, 30, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = FOOD_COLORS.coffee;
      ctx.fill();
      outline(4);
      ctx.beginPath();
      ctx.arc(32, 4, 9, -Math.PI / 2, Math.PI / 2);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#9b8f84';
      ctx.lineWidth = 4;
      for (const x of [-10, 6]) {
        ctx.beginPath();
        ctx.moveTo(x, -22);
        ctx.bezierCurveTo(x - 8, -32, x + 8, -38, x, -48);
        ctx.stroke();
      }
      break;
    }
    case 'kimchi': {
      roundRect(ctx, -28, -24, 56, 64, 14);
      ctx.fillStyle = '#f3ede4';
      ctx.fill();
      outline();
      roundRect(ctx, -22, -6, 44, 40, 10);
      ctx.fillStyle = FOOD_COLORS.kimchi;
      ctx.fill();
      roundRect(ctx, -30, -38, 60, 16, 6);
      ctx.fillStyle = '#4a7c4f';
      ctx.fill();
      outline(4);
      ctx.fillStyle = '#ffd5c2';
      for (const [x, y] of [[-8, 6], [8, 18], [-4, 24]] as const) {
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 3, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sushi': {
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, Math.PI * 2);
      ctx.fillStyle = '#26323a';
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = FOOD_COLORS.sushi;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4, -3, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#6fbf4a';
      ctx.fill();
      break;
    }
    case 'noodles': {
      ctx.strokeStyle = FOOD_COLORS.noodles === '#f2d79b' ? '#e7b95a' : FOOD_COLORS.noodles;
      ctx.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-26 + i * 6, 0);
        ctx.bezierCurveTo(-20 + i * 6, -30, -4 + i * 8, -18, -2 + i * 9, -42);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-44, -4);
      ctx.lineTo(44, -4);
      ctx.quadraticCurveTo(40, 40, 0, 40);
      ctx.quadraticCurveTo(-40, 40, -44, -4);
      ctx.fillStyle = '#e0e7ef';
      ctx.fill();
      outline();
      ctx.fillStyle = '#c8412f';
      roundRect(ctx, -30, 8, 60, 8, 4);
      ctx.fill();
      ctx.strokeStyle = '#9a6a43';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(10, -50);
      ctx.lineTo(40, -8);
      ctx.moveTo(20, -52);
      ctx.lineTo(46, -12);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export function foodIconTexture(food: FoodId, bg: string | null = null): THREE.Texture {
  return canvasTex(`food:${food}:${bg}`, 128, 128, (ctx) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(64, 64, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFood(ctx, food, 64, 66, 100);
  });
}

/** Billboard / banner poster: player-colour frame, cream panel, food icon(s), optional number. */
export function posterTexture(goods: FoodId[], frame: string, aspect: number, number?: number): THREE.Texture {
  const H = 160;
  const W = Math.round(Math.min(5, Math.max(1, aspect)) * H);
  return canvasTex(`poster:${goods.join('+')}:${frame}:${W}:${number ?? ''}`, W, H, (ctx) => {
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, 10, 10, W - 20, H - 20, 14);
    ctx.fill();
    // Sunburst stripes behind the icon (diner-poster feel, original).
    ctx.save();
    roundRect(ctx, 10, 10, W - 20, H - 20, 14);
    ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = 'rgba(232,183,48,0.22)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, -W * 0.13);
      ctx.lineTo(W, W * 0.13);
      ctx.fill();
    }
    ctx.restore();
    const n = goods.length || 1;
    const step = Math.min(H - 30, (W - 40) / n);
    goods.forEach((g, i) => drawFood(ctx, g, W / 2 + (i - (n - 1) / 2) * step, H / 2 + 4, Math.min(step, H) * 0.95));
    if (number !== undefined) {
      ctx.fillStyle = frame;
      ctx.beginPath();
      ctx.arc(34, 34, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffaf0';
      ctx.font = `800 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), 34, 36);
    }
  });
}

/** Soft round contact-shadow texture used under minis (fake ambient occlusion). */
export function blobTexture(): THREE.Texture {
  return canvasTex('blob', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Square soft-edged contact shadow (for boxy footprints). */
export function squareBlobTexture(): THREE.Texture {
  return canvasTex('blobSq', 128, 128, (ctx) => {
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, 22, 22, 84, 84, 16);
    ctx.fill();
  });
}

/** Text label texture for signs (e.g. "SOON", chain initials). */
export function signTexture(text: string, bg: string, fg: string): THREE.Texture {
  const W = 256;
  return canvasTex(`sign:${text}:${bg}:${fg}`, W, 96, (ctx) => {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, W, 96, 20);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = `900 ${text.length > 4 ? 46 : 60}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, 52);
  });
}

export function disposeTextures(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const m of spriteMats.values()) m.dispose();
  spriteMats.clear();
}
