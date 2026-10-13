/**
 * 粒子背景：城市数据荒原上的浮尘与连线。
 *
 * 设计约束（都是踩过坑之后定下来的）：
 *  - **可重复初始化**。Astro 视图过渡会在导航后重建 DOM，`startParticles()`
 *    必须先取消上一轮的 RAF 与监听，否则会出现多层动画叠加、CPU 飙升。
 *  - **性能上限**。粒子数按视口面积算并封顶，连线用 O(n²) 但 n ≤ 88，
 *    每帧约 3800 次距离判断，实测在低端机上也能稳住 60fps。
 *  - **尊重系统偏好**。`prefers-reduced-motion: reduce` 时只画一帧静态图，不起 RAF。
 *  - **后台不空转**。标签页隐藏时暂停，回来时重置时间基准，避免「补帧」造成瞬移。
 */

/** 单个粒子 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 半径，也用来做视差：大的跑得快，营造纵深 */
  r: number;
  color: string;
}

const COLORS = [
  'rgba(0, 240, 255, 0.85)', // 青
  'rgba(168, 85, 247, 0.8)', // 紫
  'rgba(0, 255, 136, 0.7)', // 绿
];

/** 连线距离阈值（px） */
const LINK_DIST = 132;
/** 指针影响半径（px） */
const POINTER_DIST = 170;
/** 每多少平方像素放一个粒子 */
const DENSITY = 17000;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let width = 0;
let height = 0;
let rafId = 0;
let lastTime = 0;
let running = false;
let staticMode = false;

// 指针位置：未进入画布时放在远处，避免左上角出现常驻引力点
const pointer = { x: -1e5, y: -1e5 };

/** 减少动态效果偏好；用函数取值以便测试与运行中变更 */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 按视口面积决定粒子数，并限制在 [26, 88] 之间 */
function targetCount(): number {
  const n = Math.round((width * height) / DENSITY);
  return Math.max(26, Math.min(88, n));
}

function spawn(): void {
  const count = targetCount();
  particles = Array.from({ length: count }, () => {
    const r = 0.7 + Math.random() * 1.5;
    // 速度与半径挂钩：大粒子稍快，小粒子飘忽，形成层次
    const speed = 0.09 + r * 0.055;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
  });
}

/** 同步画布尺寸到设备像素比，避免高分屏上发虚 */
function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = canvas.clientWidth || window.innerWidth;
  height = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** 画一帧。dt 为归一化时间步长（1 ≈ 16.7ms），保证不同刷新率下手感一致 */
function draw(dt: number): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  // 先画连线，再画粒子，让点覆盖在线之上
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > LINK_DIST * LINK_DIST) continue;
      const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.2;
      ctx.strokeStyle = `rgba(0, 240, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  for (const p of particles) {
    // 指针斥力：靠近时轻微推开，形成「手划过数据流」的反馈
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < POINTER_DIST * POINTER_DIST && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const force = ((POINTER_DIST - d) / POINTER_DIST) * 0.42;
      p.x += (dx / d) * force * dt;
      p.y += (dy / d) * force * dt;
    }

    if (!staticMode) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 越界从对侧绕回，比反弹更自然，也不会在边缘堆积
      if (p.x < -12) p.x = width + 12;
      else if (p.x > width + 12) p.x = -12;
      if (p.y < -12) p.y = height + 12;
      else if (p.y > height + 12) p.y = -12;
    }

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    // 大粒子加一层辉光，突出景深
    if (p.r > 1.7) {
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, '0.12)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function frame(now: number): void {
  if (!running) return;
  const dt = lastTime ? Math.min((now - lastTime) / 16.667, 3) : 1;
  lastTime = now;
  draw(dt);
  rafId = requestAnimationFrame(frame);
}

function onResize(): void {
  resize();
  // 视口变化后粒子密度需要重算；数量差得多时整体重撒，避免局部空洞
  const want = targetCount();
  if (Math.abs(want - particles.length) > 8) spawn();
  if (staticMode) draw(1);
}

function onPointerMove(e: PointerEvent): void {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  if (staticMode) draw(1);
}

function onPointerLeave(): void {
  pointer.x = -1e5;
  pointer.y = -1e5;
}

/** 标签页隐藏时暂停 RAF，回来时重置时间基准 */
function onVisibility(): void {
  if (staticMode) return;
  if (document.hidden) {
    running = false;
    cancelAnimationFrame(rafId);
  } else if (ctx) {
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }
}

/** 解绑上一轮的所有监听，供重复初始化时调用 */
function teardown(): void {
  running = false;
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerout', onPointerLeave);
  document.removeEventListener('visibilitychange', onVisibility);
  ctx = null;
  canvas = null;
  particles = [];
}

/**
 * 启动粒子背景。
 *
 * 可在每次 `astro:page-load` 后安全调用：内部先拆掉上一轮再重建，
 * 因此视图过渡重建 canvas 元素后不会出现动画叠加。
 */
export function startParticles(): void {
  teardown();

  const el = document.getElementById('particles-canvas');
  if (!(el instanceof HTMLCanvasElement)) return;

  const context = el.getContext('2d');
  if (!context) return;

  canvas = el;
  ctx = context;
  staticMode = prefersReducedMotion();

  resize();
  spawn();

  window.addEventListener('resize', onResize, { passive: true });
  // 画布是 fixed 全屏，指针事件在它之上，只能挂到 window
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  if (staticMode) {
    // 减少动态效果：只画一帧静态构图，交互时按需重绘
    draw(1);
    return;
  }

  running = true;
  lastTime = 0;
  rafId = requestAnimationFrame(frame);
}
