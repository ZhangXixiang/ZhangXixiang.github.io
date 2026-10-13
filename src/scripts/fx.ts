/**
 * 增强特效层：标题解码打字机 / Hero 鼠标视差 / 霓虹光标拖尾 / 卡片描边扫光。
 *
 * 与 particles.ts、confetti.ts 同级，都是「渐进增强」模块：
 * HTML 在脚本执行前已完整可用，这里只往上叠视觉反馈，任何一项失效都不影响阅读。
 *
 * 三条硬约束（沿用本仓既有约定）：
 *  - **可重复初始化**。Astro 视图过渡导航后 `<main>` 会被替换，页面级特效必须先拆掉
 *    上一轮的观察器与 RAF，否则多层动画叠加会把 CPU 打满。
 *  - **尊重系统偏好**。`prefers-reduced-motion: reduce` 时四项全部跳过，直接呈现静态终态。
 *  - **不做常驻开销**。解码与描边扫光都是一次性动画，跑完即停；光标拖尾在标签页
 *    隐藏时暂停 RAF。
 */

/** 一次会话只解码一次标题，避免每次返回首页都重播 */
const TITLE_KEY = 'cyber-trail:title-decoded';

/**
 * 解码阶段的占位字符集。
 *
 * 刻意选几何块而非拉丁乱码：标题《穿越整个城市的越野跑》是全角汉字，
 * 用半角拉丁字符占位会让标题宽度在解码过程中反复抖动，几何块宽度稳定。
 */
const SCRAMBLE_CHARS = '▚▞█▓▒░╳╱╲◤◢';

/** 解码一个字符的间隔（ms），11 字标题总时长约 0.6s */
const DECODE_STEP = 55;
/** 未解码位置的闪烁间隔（ms） */
const FLICKER_STEP = 45;
/** 拖尾节数；越多越长，但每帧要串行插值，超过 10 节收益递减 */
const TRAIL_SEGMENTS = 8;

let cleanups: Array<() => void> = [];

/** 减少动态效果偏好；与 particles.ts 保持一致的判定口径 */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 只有精确指针设备才启用光标特效，触屏上没有「光标」这个概念 */
function hasFinePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    // 隐私模式下 sessionStorage 会抛错；按「已播放」处理，宁可少一次动画也不要崩
    return true;
  }
}

function writeSessionFlag(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // 写不进去就下次再播，无副作用
  }
}

// ============================================================================
// 1. 标题解码打字机
// ============================================================================

/**
 * 等入场欢迎遮罩离开 DOM 后再回调。
 *
 * 遮罩 z-index 10000 会盖住整个首屏，若不等它移除就开始解码，
 * 用户看到的只是一段已经打完的静态标题，动画白做。
 *
 * @param cb 遮罩消失后执行的回调，保证只被调用一次
 * @returns 清理函数，用于断开观察器与兜底定时器
 */
function afterWelcome(cb: () => void): () => void {
  let fired = false;
  const fire = (): void => {
    if (fired) return;
    fired = true;
    cb();
  };

  const overlay = document.getElementById('welcome-overlay');
  // 非首次进站时 ui.ts 已把遮罩移除，稍等首屏淡入动画起步即可
  if (!overlay) {
    const t = window.setTimeout(fire, 340);
    return () => window.clearTimeout(t);
  }

  const mo = new MutationObserver(() => {
    if (document.getElementById('welcome-overlay')) return;
    mo.disconnect();
    // 遮罩淡出有 0.85s 过渡，节点移除后再留一点余量，避免与淡出尾巴重叠
    window.setTimeout(fire, 200);
  });
  mo.observe(document.body, { childList: true });

  // 兜底：遮罩正常寿命约 3s，超过 5.2s 仍未移除说明时序被改坏了，也要让标题可读
  const guard = window.setTimeout(() => {
    mo.disconnect();
    fire();
  }, 5200);

  return () => {
    mo.disconnect();
    window.clearTimeout(guard);
  };
}

/**
 * Hero 主标题解码动画：整行先以乱码块占位，再自左向右逐字解码为真实汉字。
 *
 * 采用「先占满再解码」而非「逐字追加」，是为了让标题宽度从第一帧就是终态宽度，
 * 避免居中的 Hero 在打字过程中左右晃动。
 *
 * @param el 带 `data-glitch` 的标题元素，属性值即完整标题文本
 */
function decodeTitle(el: HTMLElement): () => void {
  const full = el.dataset.glitch ?? el.textContent ?? '';
  const chars = Array.from(full);
  if (chars.length === 0) return () => {};

  // 重写为「文本 span + 光标」两段，原文本节点保留在 data 属性里不丢失
  el.textContent = '';
  const text = document.createElement('span');
  text.className = 'tw-text';
  const caret = document.createElement('span');
  caret.className = 'tw-caret';
  caret.setAttribute('aria-hidden', 'true');
  el.append(text, caret);
  el.classList.add('is-typing');

  // 每个位置当前显示的字符：已解码位为真实汉字，未解码位为随机块
  const buffer = chars.map(() => SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0]);
  let decoded = 0;

  const render = (): void => {
    text.textContent = buffer.join('');
  };
  render();

  // 未解码位置持续换字，形成「信号正在锁定」的抖动感
  const flicker = window.setInterval(() => {
    let dirty = false;
    for (let i = decoded; i < buffer.length; i++) {
      buffer[i] = SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
      dirty = true;
    }
    if (dirty) render();
  }, FLICKER_STEP);

  const timer = window.setInterval(() => {
    if (decoded >= buffer.length) return;
    buffer[decoded] = chars[decoded];
    decoded += 1;
    render();

    if (decoded < buffer.length) return;
    // 解码完成：停表、收光标、放开 CSS 故障重影
    window.clearInterval(timer);
    window.clearInterval(flicker);
    el.classList.remove('is-typing');
    el.classList.add('is-decoded');
    writeSessionFlag(TITLE_KEY);
  }, DECODE_STEP);

  return () => {
    window.clearInterval(timer);
    window.clearInterval(flicker);
  };
}

/**
 * 页面级：标题解码。
 *
 * SSR 输出的 `<h1>` 本身就是完整标题，无 JS 时直接可读；
 * 脚本只负责把它「打散再拼回来」。`aria-label` 已在 Hero.astro 上写死完整标题，
 * 读屏用户不受解码过程影响。
 */
function initTitleDecode(): () => void {
  const el = document.querySelector<HTMLElement>('.hero-title[data-glitch]');
  if (!el) return () => {};

  // 减少动态效果 / 本会话已播过：保持 SSR 原文，不做任何改动
  if (prefersReducedMotion() || readSessionFlag(TITLE_KEY)) {
    el.classList.add('is-decoded');
    return () => {};
  }

  let stopDecode = () => {};
  const stopWaiting = afterWelcome(() => {
    stopDecode = decodeTitle(el);
  });

  return () => {
    stopWaiting();
    stopDecode();
  };
}

// ============================================================================
// 2. Hero 鼠标视差
// ============================================================================

/**
 * 全局级：Hero 各层随鼠标产生不同幅度的位移，形成纵深。
 *
 * 位移量写成 `.hero` 上的 `--mx` / `--my`（-1 ~ 1），具体幅度由各层样式决定，
 * 这样 JS 只管采集指针、CSS 只管表达层次，两边都能单独调。
 *
 * 样式侧对已有 `animation: fadeUp`（改 transform）的元素使用独立的 `translate`
 * 属性而非 `transform`，否则会被动画的填充终态覆盖。
 */
function initParallax(): () => void {
  const hero = document.querySelector<HTMLElement>('.hero');
  // 非首页没有 Hero；元素可能随视图过渡重建，所以每次都重新取
  if (!hero || prefersReducedMotion() || !hasFinePointer()) return () => {};

  let rafId = 0;
  let pending = false;
  // 归一化指针位置，中心为 0
  let mx = 0;
  let my = 0;

  const apply = (): void => {
    rafId = 0;
    pending = false;
    hero.style.setProperty('--mx', mx.toFixed(4));
    hero.style.setProperty('--my', my.toFixed(4));
  };

  const onMove = (e: PointerEvent): void => {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
    // rAF 节流：pointermove 频率可达刷新率的数倍，直接写样式会掉帧
    if (pending) return;
    pending = true;
    rafId = requestAnimationFrame(apply);
  };

  const onLeave = (): void => {
    mx = 0;
    my = 0;
    if (!pending) {
      pending = true;
      rafId = requestAnimationFrame(apply);
    }
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerout', onLeave, { passive: true });

  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerout', onLeave);
    if (rafId) cancelAnimationFrame(rafId);
    hero.style.removeProperty('--mx');
    hero.style.removeProperty('--my');
  };
}

// ============================================================================
// 3. 霓虹光标拖尾
// ============================================================================

/**
 * 全局级：跟随指针的霓虹环 + 一串逐级追赶的拖尾节点。
 *
 * 不隐藏系统光标（不写 `cursor: none`）：自定义光标在表单、长按、右键等场景
 * 容易丢状态，叠一层装饰而不接管指针是更稳的取舍。
 *
 * 节点用「朝前一个节点插值」的串行追赶，越靠后延迟越大，自然形成拖尾弧线；
 * 整个特效跑在单个 rAF 循环里，节点数固定，开销可预测。
 */
function initCursorTrail(): () => void {
  if (prefersReducedMotion() || !hasFinePointer()) return () => {};

  const root = document.createElement('div');
  root.id = 'cursor-fx';
  root.setAttribute('aria-hidden', 'true');

  const ring = document.createElement('span');
  ring.className = 'cursor-ring';
  root.appendChild(ring);

  const segs: HTMLSpanElement[] = [];
  for (let i = 0; i < TRAIL_SEGMENTS; i++) {
    const s = document.createElement('span');
    s.className = 'cursor-trail';
    // 序号交给样式做尺寸与透明度衰减
    s.style.setProperty('--n', String(i));
    root.appendChild(s);
    segs.push(s);
  }
  document.body.appendChild(root);

  // 指针真实位置与各节点的当前位置；节点初值放在视口外，避免首帧从左上角飞出
  const target = { x: -200, y: -200 };
  const pos = segs.map(() => ({ x: -200, y: -200 }));
  const ringPos = { x: -200, y: -200 };

  let rafId = 0;
  let alive = true;
  let visible = false;
  let pressed = false;

  const onMove = (e: PointerEvent): void => {
    target.x = e.clientX;
    target.y = e.clientY;
    if (visible) return;
    // 首次移动才显形，并把所有节点瞬移到指针处，避免拉出一条横穿屏幕的长线
    visible = true;
    root.classList.add('is-on');
    ringPos.x = target.x;
    ringPos.y = target.y;
    for (const p of pos) {
      p.x = target.x;
      p.y = target.y;
    }
  };

  const onLeave = (): void => {
    visible = false;
    root.classList.remove('is-on');
  };

  const onDown = (): void => {
    pressed = true;
    ring.classList.add('is-press');
  };
  const onUp = (): void => {
    pressed = false;
    ring.classList.remove('is-press');
  };

  // 悬停可交互元素时环放大，给出「这里能点」的额外提示
  const onOver = (e: MouseEvent): void => {
    const hit = (e.target as HTMLElement | null)?.closest('a,button,input,textarea,summary,[tabindex]');
    ring.classList.toggle('is-hot', Boolean(hit));
  };

  const tick = (): void => {
    if (!alive) return;

    if (visible) {
      // 环追得快、拖尾逐级追得慢，差值就是拖尾的长度感
      ringPos.x += (target.x - ringPos.x) * 0.22;
      ringPos.y += (target.y - ringPos.y) * 0.22;
      ring.style.transform = `translate3d(${ringPos.x.toFixed(2)}px, ${ringPos.y.toFixed(2)}px, 0)`;

      let px = ringPos.x;
      let py = ringPos.y;
      for (let i = 0; i < segs.length; i++) {
        const p = pos[i];
        // 越靠后追随系数越小，形成衰减的弧线
        const k = 0.34 - i * 0.026;
        p.x += (px - p.x) * k;
        p.y += (py - p.y) * k;
        segs[i].style.transform = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0)`;
        px = p.x;
        py = p.y;
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  // 标签页隐藏时停表，回来时不补帧（补帧会让拖尾瞬移）
  const onVisibility = (): void => {
    if (document.hidden) {
      alive = false;
      cancelAnimationFrame(rafId);
    } else if (!alive) {
      alive = true;
      rafId = requestAnimationFrame(tick);
    }
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerout', onLeave, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('mouseover', onOver, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  rafId = requestAnimationFrame(tick);

  return () => {
    alive = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerout', onLeave);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('visibilitychange', onVisibility);
    root.remove();
    // pressed 仅用于状态自洽，摘掉引用避免闭包驻留
    void pressed;
  };
}

// ============================================================================
// 4. 卡片描边扫光
// ============================================================================

/**
 * 页面级：卡片进入视口时，一道霓虹光沿边框转一圈。
 *
 * 描边由 `.card-beam` 这个独立元素承担，因为 `.post-card` 的 `::before` / `::after`
 * 已被「左上折角」和「hover 底部扫光」占用。
 *
 * 动画跑一次即摘类，不做常驻循环：首页 + 归档页最多几十张卡，
 * 若都挂着无限旋转的 conic-gradient，合成层开销会明显上升。
 */
function initCardBeam(main: HTMLElement): () => void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.post-card'));
  if (cards.length === 0 || prefersReducedMotion()) return () => {};

  const BEAM_CLASS = 'beam-run';

  const play = (card: HTMLElement): void => {
    // 上一轮还没播完就重入时先摘掉，靠强制回流重启动画
    if (card.classList.contains(BEAM_CLASS)) {
      card.classList.remove(BEAM_CLASS);
      void card.offsetWidth;
    }
    card.classList.add(BEAM_CLASS);
  };

  // 动画结束后摘类，把合成开销还给浏览器
  const onEnd = (e: AnimationEvent): void => {
    const card = (e.target as HTMLElement).closest?.('.post-card');
    if (card && e.animationName === 'beamSpin') card.classList.remove(BEAM_CLASS);
  };

  const hoverHandlers: Array<[HTMLElement, () => void]> = [];
  for (const card of cards) {
    // 悬停时再扫一次，让「可点」这件事有即时反馈
    const enter = (): void => play(card);
    card.addEventListener('mouseenter', enter, { passive: true });
    hoverHandlers.push([card, enter]);
  }
  document.addEventListener('animationend', onEnd);

  // 不支持 IntersectionObserver 就不做入场扫光，hover 仍可触发，内容不受影响
  if (typeof IntersectionObserver !== 'function') {
    return () => {
      document.removeEventListener('animationend', onEnd);
      for (const [el, fn] of hoverHandlers) el.removeEventListener('mouseenter', fn);
    };
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        // 逐张错开一点，避免同排卡片的光完全同步显得呆板
        const card = entry.target as HTMLElement;
        const delay = Number(card.style.getPropertyValue('--beam-delay') || 0);
        window.setTimeout(() => play(card), delay);
        io.unobserve(card);
      }
    },
    // root 用 #main：本站 body 不滚动，滚动发生在主区内部
    { root: main, rootMargin: '0px 0px -6% 0px', threshold: 0.15 },
  );
  for (const card of cards) io.observe(card);

  return () => {
    io.disconnect();
    document.removeEventListener('animationend', onEnd);
    for (const [el, fn] of hoverHandlers) el.removeEventListener('mouseenter', fn);
  };
}

// ============================================================================
// 对外入口
// ============================================================================

/**
 * 启动跨页面存活的特效（视差、光标拖尾）。
 *
 * 由 ui.ts 的 `bootGlobal()` 调用。内部用 dataset 标记做幂等，
 * 视图过渡后重复调用不会叠加监听或重复插入光标节点。
 */
export function startFxGlobal(): void {
  const root = document.documentElement;
  if (root.dataset.fxGlobalBound === '1') return;
  root.dataset.fxGlobalBound = '1';

  initCursorTrail();
  // 视差依赖 .hero，导航到非首页时元素不存在，交由页面级入口重绑
}

/**
 * 启动随页面重建的特效（标题解码、Hero 视差、卡片描边扫光）。
 *
 * 由 ui.ts 的 `bootPage()` 调用，返回值并入其清理链：
 * 每次导航前会先执行上一轮返回的清理函数，再重新绑定当前页。
 *
 * @param main 主滚动容器，IntersectionObserver 的 root
 */
export function startFxPage(main: HTMLElement): () => void {
  for (const fn of cleanups) fn();
  cleanups = [];

  cleanups.push(initTitleDecode());
  cleanups.push(initParallax());
  cleanups.push(initCardBeam(main));

  return () => {
    for (const fn of cleanups) fn();
    cleanups = [];
  };
}
