/**
 * 全站交互脚本入口。
 *
 * 分两层，原因是 Astro 视图过渡（ClientRouter）导航后只有 `<main>` 被替换：
 *  - `bootGlobal()` 绑定「跨页面存活」的东西（粒子、侧栏抽屉、搜索筛选、入场彩带），
 *    用 dataset 标记做幂等，重复调用不会叠加监听；侧栏本身带 `transition:persist`，
 *    DOM 与监听在导航后原样保留。
 *  - `bootPage()` 绑定「随页面重建」的东西（阅读进度、滚动揭示、目录、复制按钮、数字滚动），
 *    每次 `astro:page-load` 都重跑，并先拆掉上一轮的观察器。
 *
 * 渐进增强原则：所有交互都在 HTML 已完整可用的前提下叠加。
 * 没有 JS 时侧栏列表、分类页、文章正文、上下篇导航都照常可读，
 * 只有搜索筛选、目录抽屉、复制按钮失效。
 */
import { startParticles } from './particles.ts';
import { fireConfetti } from './confetti.ts';
// 增强特效（标题解码 / Hero 视差 / 光标拖尾 / 卡片描边扫光），分全局与页面两级
import { startFxGlobal, startFxPage } from './fx.ts';

/** 首次进站标记的存储键：一次会话只放一次彩带 */
const VISIT_KEY = 'cyber-trail:visited';

/** 保存上一轮的观察器与清理函数，导航后统一释放 */
let pageCleanups: Array<() => void> = [];

function $(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}

/**
 * querySelectorAll 的数组化包装。
 *
 * @param sel   CSS 选择器
 * @param scope 查找范围，默认全文档。调用方传入容器即可把匹配限定在子树内
 *              （侧栏筛选用它把 .post-item 限定在 #post-list 内，避免误匹配）
 */
function $all<T extends Element = HTMLElement>(sel: string, scope: ParentNode = document): T[] {
  return Array.from(scope.querySelectorAll<T>(sel));
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 写入剪贴板；clipboard API 不可用（非 https / 旧浏览器）时退回 execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的兜底分支
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // 移出视口，避免滚动位置被改动
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 按钮上的「已复制」瞬时反馈 */
function flashCopied(btn: HTMLElement, label: string): void {
  const original = btn.dataset.label ?? btn.textContent ?? '';
  btn.dataset.label = original;
  btn.textContent = label;
  btn.classList.add('copied');
  window.setTimeout(() => {
    btn.textContent = btn.dataset.label ?? original;
    btn.classList.remove('copied');
  }, 1600);
}

// ============================================================================
// 全局层
// ============================================================================

/** 入场欢迎遮罩 + 彩带，仅本次会话首次进站时播放 */
function runWelcome(): void {
  const overlay = $('#welcome-overlay');
  if (!overlay) return;

  let visited = false;
  try {
    visited = sessionStorage.getItem(VISIT_KEY) === '1';
    sessionStorage.setItem(VISIT_KEY, '1');
  } catch {
    // 隐私模式下 sessionStorage 会抛错，此时按「已访问」处理，不重复打扰
    visited = true;
  }

  // 减少动态效果：直接不显示遮罩，内容立即可见
  if (visited || prefersReducedMotion()) {
    overlay.remove();
    return;
  }

  overlay.classList.add('is-show');
  // 标题先亮一拍再放彩带，节奏上有个「蓄力—释放」的层次
  window.setTimeout(() => fireConfetti(), 620);
  window.setTimeout(() => {
    overlay.classList.add('is-out');
    // 等淡出过渡结束再摘掉节点，避免遮罩残留拦截视觉
    window.setTimeout(() => overlay.remove(), 900);
  }, 2100);
}

/** 窄屏抽屉：菜单按钮 / 遮罩 / Esc 三种关闭方式 */
function initDrawer(): void {
  const menu = $('#menu');
  const sidebar = $('#sidebar');
  const scrim = $('#scrim');
  if (!menu || !sidebar || !scrim) return;

  const setOpen = (open: boolean): void => {
    sidebar.classList.toggle('open', open);
    scrim.classList.toggle('is-open', open);
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    // 打开时焦点移进搜索框，键盘用户不必再 Tab 十几次
    if (open) $('#search-input')?.focus?.({ preventScroll: true });
  };

  menu.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) setOpen(false);
  });

  // 窄屏点完文章就收起抽屉，否则导航后抽屉仍盖住正文
  sidebar.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest('a.post-item');
    if (link && window.innerWidth <= 1024) setOpen(false);
  });

  // 视口变宽后清掉抽屉态，避免桌面端侧栏被 translateX(-100%) 藏起来
  window.addEventListener(
    'resize',
    () => {
      if (window.innerWidth > 1024) setOpen(false);
    },
    { passive: true },
  );
}

/**
 * 侧栏搜索 + 分类筛选。
 *
 * 22 篇文章全量渲染在 DOM 里，筛选纯客户端完成，所以切换零请求、零刷新 ——
 * 这是原 3-Jekyll 主题最有辨识度的交互，予以保留。
 */
function initIndexFilter(): void {
  const input = $('#search-input') as HTMLInputElement | null;
  const list = $('#post-list');
  const chips = $all<HTMLButtonElement>('#filters .chip');
  const hint = $('#empty-hint');
  if (!list || chips.length === 0) return;

  const items = $all<HTMLElement>('.post-item', list);
  let activeCat = 'all';
  let query = '';

  const apply = (): void => {
    let shown = 0;
    for (const item of items) {
      const catOk = activeCat === 'all' || item.dataset.cat === activeCat;
      const textOk = !query || (item.dataset.search ?? '').includes(query);
      const visible = catOk && textOk;
      // 用 hidden 属性而非 class，无 CSS 时语义也正确
      item.hidden = !visible;
      if (visible) shown++;
    }
    if (hint) hint.hidden = shown > 0;
    // 供读屏播报筛选结果数量
    list.setAttribute('aria-label', `文章索引，当前显示 ${shown} 篇`);
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      activeCat = chip.dataset.filter ?? 'all';
      for (const c of chips) {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
      }
      apply();
    });
  }

  input?.addEventListener('input', () => {
    query = input.value.trim().toLowerCase();
    apply();
  });

  // `/` 聚焦搜索，`Esc` 在搜索框内清空并退出
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
    if (e.key === '/' && !typing) {
      e.preventDefault();
      input?.focus();
    } else if (e.key === 'Escape' && e.target === input && input) {
      input.value = '';
      query = '';
      apply();
      input.blur();
    }
  });

  apply();
}

/** 导航后同步侧栏「当前文章」高亮（侧栏被 persist，构建期的 is-current 会过期） */
function syncCurrentItem(): void {
  const path = window.location.pathname;
  for (const item of $all<HTMLAnchorElement>('.post-item')) {
    const on = item.getAttribute('href') === path;
    item.classList.toggle('is-current', on);
    if (on) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

function bootGlobal(): void {
  const root = document.documentElement;
  // 幂等：全局层只初始化一次
  if (root.dataset.globalBound === '1') {
    syncCurrentItem();
    return;
  }
  root.dataset.globalBound = '1';

  startParticles();
  runWelcome();
  initDrawer();
  initIndexFilter();
  syncCurrentItem();
  // 光标拖尾跨页面存活，只在这里绑一次；Hero 视差与卡片扫光随页面重建，见 bootPage
  startFxGlobal();
}

// ============================================================================
// 页面层
// ============================================================================

/** 顶部阅读进度条：以 #main 这个真实滚动容器为准，而不是 window */
function initReadingProgress(main: HTMLElement): () => void {
  const bar = $('#reading-progress');
  if (!bar) return () => {};

  let ticking = false;
  const update = (): void => {
    ticking = false;
    const max = main.scrollHeight - main.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, main.scrollTop / max)) : 0;
    bar.style.setProperty('--progress', `${(ratio * 100).toFixed(2)}%`);
  };
  const onScroll = (): void => {
    // rAF 节流：滚动事件频率远高于刷新率，直接写样式会掉帧
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  main.addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => main.removeEventListener('scroll', onScroll);
}

/** 滚动揭示：进入视口后加 .is-in，逐项延迟由元素上的 --i 驱动 */
function initReveal(main: HTMLElement): () => void {
  const targets = $all<HTMLElement>('[data-reveal]');
  if (targets.length === 0) return () => {};

  // 不支持 IntersectionObserver 就直接全部显示，不能把内容永久藏起来
  if (typeof IntersectionObserver !== 'function' || prefersReducedMotion()) {
    for (const el of targets) el.classList.add('is-in');
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    // root 必须是 #main：body 不滚动，用默认 viewport 也能工作，但显式指定更可靠
    { root: main, rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
  );

  for (const el of targets) io.observe(el);
  return () => io.disconnect();
}

/** Hero 统计数字滚动：只在首次进入视口时跑一次 */
function initCountUp(main: HTMLElement): () => void {
  const nums = $all<HTMLElement>('.stat-num[data-count]');
  if (nums.length === 0 || prefersReducedMotion()) return () => {};

  const run = (el: HTMLElement): void => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    const duration = 900;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo：开头快、结尾缓，数字落定时不突兀
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (typeof IntersectionObserver !== 'function') {
    for (const el of nums) run(el);
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run(entry.target as HTMLElement);
        io.unobserve(entry.target);
      }
    },
    { root: main, threshold: 0.4 },
  );
  for (const el of nums) io.observe(el);
  return () => io.disconnect();
}

/** 文章目录抽屉 + 当前章节高亮 */
function initToc(main: HTMLElement): () => void {
  const toc = $('#post-toc');
  const btn = $('#post-toc-menu');
  if (!toc || !btn) return () => {};

  const setOpen = (open: boolean): void => {
    toc.classList.toggle('open', open);
    toc.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
  };

  const onBtn = (): void => setOpen(!toc.classList.contains('open'));
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && toc.classList.contains('open')) setOpen(false);
  };

  btn.addEventListener('click', onBtn);
  document.addEventListener('keydown', onKey);

  const links = $all<HTMLAnchorElement>('#post-toc-list a');

  // 正文标题的平滑滚动：html 上的 scroll-behavior 管不到 #main 这个自定义滚动容器，
  // 所以自己接管锚点点击，顺带用 replaceState 更新 hash 而不触发跳转
  const onClick = (e: MouseEvent): void => {
    const a = e.currentTarget as HTMLAnchorElement;
    const id = decodeURIComponent(a.getAttribute('href') ?? '').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    if (window.innerWidth <= 1024) setOpen(false);
  };
  for (const a of links) a.addEventListener('click', onClick);

  // 章节高亮
  const headings = links
    .map((a) => document.getElementById(decodeURIComponent(a.getAttribute('href') ?? '').slice(1)))
    .filter((el): el is HTMLElement => el !== null);

  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function' && headings.length > 0) {
    io = new IntersectionObserver(
      (entries) => {
        // 取当前可见标题里最靠上的一个作为「正在读」
        const visible = entries
          .filter((en) => en.isIntersecting)
          .sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
        if (visible.length === 0) return;
        const id = visible[0].target.id;
        for (const li of $all<HTMLElement>('#post-toc-list li')) {
          li.classList.toggle('is-active', li.dataset.tocItem === id);
        }
      },
      { root: main, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    for (const h of headings) io.observe(h);
  }

  return () => {
    btn.removeEventListener('click', onBtn);
    document.removeEventListener('keydown', onKey);
    for (const a of links) a.removeEventListener('click', onClick);
    io?.disconnect();
  };
}

/** 代码块复制 + 分享区「复制链接」 */
function initCopy(): () => void {
  const handlers: Array<[HTMLElement, (e: Event) => void]> = [];

  for (const btn of $all<HTMLButtonElement>('.code-copy')) {
    const on = async (): Promise<void> => {
      // 结构由 rehype-code-wrap 生成：.code-block > (.code-head + pre)
      const pre = btn.closest('.code-block')?.querySelector('pre');
      const ok = await copyText(pre?.textContent ?? '');
      flashCopied(btn, ok ? '已复制' : '复制失败');
    };
    btn.addEventListener('click', on);
    handlers.push([btn, on]);
  }

  for (const btn of $all<HTMLElement>('[data-copy-link]')) {
    const on = async (): Promise<void> => {
      const ok = await copyText(btn.dataset.copyLink ?? window.location.href);
      flashCopied(btn, ok ? '已复制' : '复制失败');
    };
    btn.addEventListener('click', on);
    handlers.push([btn, on]);
  }

  return () => {
    for (const [el, fn] of handlers) el.removeEventListener('click', fn);
  };
}

/** 顶部导航过渡进度条 */
function initNavProgress(): () => void {
  const bar = $('#nav-progress');
  if (!bar) return () => {};

  const onStart = (): void => {
    bar.classList.add('is-active');
    bar.style.width = '72%';
  };
  const onEnd = (): void => {
    bar.style.width = '100%';
    window.setTimeout(() => {
      bar.classList.remove('is-active');
      bar.style.width = '0';
    }, 240);
  };

  // 点击站内链接即视为开始导航（Astro 的 before-preparation 在慢网下偏晚）
  const onClick = (e: MouseEvent): void => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || a.target === '_blank') return;
    if (a.origin !== window.location.origin) return;
    if (a.pathname === window.location.pathname) return;
    onStart();
  };

  document.addEventListener('click', onClick);
  document.addEventListener('astro:before-swap', onStart);
  document.addEventListener('astro:page-load', onEnd);
  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('astro:before-swap', onStart);
    document.removeEventListener('astro:page-load', onEnd);
  };
}

function bootPage(): void {
  // 释放上一页的观察器与监听，避免视图过渡后累积
  for (const fn of pageCleanups) fn();
  pageCleanups = [];

  const main = $('#main');
  if (!main) return;

  pageCleanups.push(initReadingProgress(main));
  pageCleanups.push(initReveal(main));
  pageCleanups.push(initCountUp(main));
  pageCleanups.push(initToc(main));
  pageCleanups.push(initCopy());
  // 标题解码 / Hero 视差 / 卡片描边扫光都依附于当前页 DOM，随页面重建重新绑定
  pageCleanups.push(startFxPage(main));
}

// ============================================================================
// 启动
// ============================================================================

function boot(): void {
  bootGlobal();
  bootPage();
}

// type="module" 脚本是 defer 语义，执行时 DOM 已解析完毕，可直接 boot
boot();
// 视图过渡完成后重跑页面层（全局层内部自带幂等）
document.addEventListener('astro:page-load', boot);
// 过渡进度条需要跨页面存活，单独在全局层挂一次
document.addEventListener('astro:after-swap', () => {
  if (document.documentElement.dataset.navBound !== '1') {
    document.documentElement.dataset.navBound = '1';
    initNavProgress();
  }
});
if (document.documentElement.dataset.navBound !== '1') {
  document.documentElement.dataset.navBound = '1';
  initNavProgress();
}
