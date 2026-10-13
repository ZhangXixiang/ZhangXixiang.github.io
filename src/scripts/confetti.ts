/**
 * 入场彩带：从屏幕下沿两侧向斜上方发射的霓虹纸屑。
 *
 * 只在「本次会话首次进站」触发一次（由 ui.ts 用 sessionStorage 把关），
 * 避免每次导航都放炮造成打扰。
 *
 * 实现要点：
 *  - 无第三方依赖，纸屑是 canvas 上旋转的矩形 / 细条 / 圆点三种形状；
 *  - 物理用最简的「重力 + 空气阻力 + 角速度」，够用且可预测；
 *  - 全部纸屑寿命耗尽后自动停 RAF 并清空画布，不留常驻开销；
 *  - `prefers-reduced-motion: reduce` 时直接跳过，不绘制任何帧。
 */

/** 单片纸屑 */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 当前旋转角与角速度 */
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
  shape: 'rect' | 'strip' | 'dot';
  life: number;
  maxLife: number;
}

/** 站点霓虹色板，与 _tokens.scss 保持一致 */
const PALETTE = ['#00f0ff', '#a855f7', '#00ff88', '#ff006e', '#ffd166', '#eaf1fb'];

/** 重力加速度（px / 帧²） */
const GRAVITY = 0.13;
/** 空气阻力，逐帧乘上该系数 */
const DRAG = 0.992;
/** 单侧发射的纸屑数 */
const PER_SIDE = 78;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let bits: Bit[] = [];
let rafId = 0;
let firing = false;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * 造一发纸屑。
 * @param fromLeft true 表示从左下角发射，角度偏向右上；反之偏向左上
 */
function makeBurst(fromLeft: boolean): Bit[] {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const originX = fromLeft ? w * 0.08 : w * 0.92;
  const originY = h + 10;
  // 发射仰角：以竖直向上为 0，向屏幕中心偏 18°~46°
  const baseAngle = fromLeft ? -Math.PI / 2 : -Math.PI / 2;
  const spread = fromLeft ? [0.31, 0.8] : [-0.8, -0.31];

  return Array.from({ length: PER_SIDE }, () => {
    const angle = baseAngle + rand(spread[0], spread[1]);
    const speed = rand(11, 21);
    const shape = (['rect', 'strip', 'dot'] as const)[(Math.random() * 3) | 0];
    const size = shape === 'strip' ? rand(2, 3.4) : rand(4.5, 9);
    return {
      x: originX + rand(-14, 14),
      y: originY + rand(-8, 8),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.24, 0.24),
      w: shape === 'strip' ? size : size * rand(0.7, 1.3),
      h: shape === 'strip' ? size * rand(5, 9) : size,
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      shape,
      life: 0,
      // 寿命带随机，纸屑不会整齐地同时消失
      maxLife: rand(110, 190),
    };
  });
}

function drawBit(b: Bit): void {
  if (!ctx) return;
  // 后 25% 寿命里线性淡出
  const fade = b.life > b.maxLife * 0.75 ? 1 - (b.life - b.maxLife * 0.75) / (b.maxLife * 0.25) : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.fillStyle = b.color;
  // 同色辉光：暗背景上纸屑才有「霓虹」而不是「碎纸」的观感
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 8;

  if (b.shape === 'dot') {
    ctx.beginPath();
    ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  }
  ctx.restore();
}

function step(): void {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const b of bits) {
    b.vy += GRAVITY;
    b.vx *= DRAG;
    b.vy *= DRAG;
    b.x += b.vx;
    b.y += b.vy;
    b.rot += b.vrot;
    // 下落时角速度衰减，模拟空气让纸屑趋于平稳
    if (b.vy > 0) b.vrot *= 0.985;
    b.life += 1;
    if (b.life < b.maxLife) drawBit(b);
  }

  bits = bits.filter((b) => b.life < b.maxLife && b.y < window.innerHeight + 80);

  if (bits.length === 0) {
    stop();
    return;
  }
  rafId = requestAnimationFrame(step);
}

/** 停止动画并清空画布，释放常驻开销 */
function stop(): void {
  firing = false;
  cancelAnimationFrame(rafId);
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  bits = [];
  document.body.classList.remove('is-shaking');
}

/**
 * 发射一次彩带。
 *
 * 画布缺失、正在发射中、或用户开启了「减少动态效果」时直接返回 false，
 * 调用方（ui.ts）据此决定是否还要继续走欢迎遮罩的时序。
 */
export function fireConfetti(): boolean {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }

  const el = document.getElementById('confetti-canvas');
  if (!(el instanceof HTMLCanvasElement)) return false;

  const context = el.getContext('2d');
  if (!context) return false;

  // 上一次还没落完就先收掉，避免两发叠加导致纸屑数翻倍
  if (firing) stop();

  canvas = el;
  ctx = context;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  bits = [...makeBurst(true), ...makeBurst(false)];
  firing = true;

  // 轻微震屏：只在发射瞬间加类，动画结束后由 step() 摘掉
  document.body.classList.add('is-shaking');
  window.setTimeout(() => document.body.classList.remove('is-shaking'), 520);

  rafId = requestAnimationFrame(step);
  return true;
}
