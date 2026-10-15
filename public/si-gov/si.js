/* =============================================================
   SI.gov homepage replica — interaction engine (original impl.)
   Implements: canvas particle field with per-section "forms",
   hero SI↔snake toggle, inertia marquee, word light-up,
   count-up, pinned three-orders steps, dot scrollspy,
   reveal/fade observers, card spotlight, iris link transition,
   menu orb, difference-blend cursor, wordmark shimmer mask,
   summit video loader + ghost parallax.
   ============================================================= */
(() => {
'use strict';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE    = matchMedia('(pointer: fine)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

const canvas = $('#field');
const ctx = canvas.getContext('2d');
const COLORS = ['#F5F6FA', '#FF3347', '#8FB4FF'];

let W = 0, H = 0, DPR = 1;
let COUNT = 0, particles = [];
const pointer = { x: -9999, y: -9999, nx: 0, ny: 0 };
const ripples = [];           // expanding click rings
let activeForm = null;        // fn(i, t) -> [x, y, alpha, color, size, pull?]
let formId = '';
let formBoxes = {};           // hover hit-boxes per form id
let fieldScale = 1, dimFactor = 1, clock = 0;

/* ---------------- particle pool ---------------- */
function makeParticles() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = W < 700 ? 1400 : 1700;
  if (n !== COUNT) {
    COUNT = n;
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: 0, vy: 0,
      c: Math.random() < .08 ? 1 : Math.random() < .12 ? 2 : 0, // colour class
      rx: Math.random(), ry: Math.random(), rz: Math.random(),
    }));
  }
}

/* ---------------- text → point cloud sampler ---------------- */
const sampleCache = new Map();
function sampleText(str, box) {
  const key = `${str}|${0|box.x},${0|box.y},${0|box.w},${0|box.h}|${COUNT}`;
  if (sampleCache.has(key)) return sampleCache.get(key);
  const cw = Math.max(10, Math.round(box.w)), ch = Math.max(10, Math.round(box.h));
  const off = document.createElement('canvas');
  off.width = cw; off.height = ch;
  const c = off.getContext('2d');
  const lines = str.includes('|') ? str.split('|') : [str];
  const font = px => `400 ${px}px "Instrument Serif", Georgia, serif`;
  c.font = font(100); c.textBaseline = 'alphabetic';
  const m = lines.map(l => c.measureText(l));
  const maxW = Math.max(...m.map(t => (t.actualBoundingBoxLeft || 0) + (t.actualBoundingBoxRight || t.width)));
  const size = clamp(Math.min(cw * .86 / (maxW / 100), ch * .9 / (1.9 * lines.length)), 8, 900);
  c.font = font(size); c.textAlign = 'center'; c.fillStyle = '#000';
  const lh = .92 * size, baseY = (ch - lh * lines.length) / 2 + size * .78;
  lines.forEach((l, i) => c.fillText(l, cw / 2, baseY + i * lh));
  const data = c.getImageData(0, 0, cw, ch).data;
  let ink = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i] > 128) ink += 4;
  const step = Math.max(1.5, Math.sqrt(ink / (.95 * COUNT)));
  const pts = [];
  for (let y = 0; y < ch; y += step)
    for (let x = 0; x < cw; x += step)
      if (data[4 * ((0 | y) * cw + (0 | x)) + 3] > 128) pts.push([box.x + x, box.y + y]);
  for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const cloud = { pts, step, box: { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h } };
  sampleCache.set(key, cloud);
  return cloud;
}

/* ---------------- form generators ----------------
   Each returns fn(i, t) -> [x, y, alpha, colorIdx(-1 own), size, pull?] */
const Forms = {
  text(str, box) {
    const { pts, box: bb } = sampleText(str, box);
    if (!pts.length) return Forms.scatter();
    const f = i => {
      const p = pts[i % pts.length], over = i >= pts.length;
      return [p[0] + (over ? 3 * (particles[i].rx - .5) : 0),
              p[1] + (over ? 3 * (particles[i].ry - .5) : 0), 1, -1, 1.7];
    };
    f.box = bb;
    return f;
  },

  /* boustrophedon "snake": letters written left→right, line by line */
  snake(str, box) {
    const cloud = sampleText(str, box);
    const { pts, step, box: bb } = cloud;
    if (!pts.length) return Forms.scatter();
    const lineH = (str.split('|').length > 1 ? box.h : box.h / 2);
    const ordered = pts.slice().sort((a, b) => {
      const la = a[1] < box.y + lineH ? 0 : 1, lb = b[1] < box.y + lineH ? 0 : 1;
      if (la !== lb) return la - lb;
      const ca = Math.round((a[0] - box.x) / step), cb = Math.round((b[0] - box.x) / step);
      if (ca !== cb) return ca - cb;
      return la % 2 ? b[1] - a[1] : a[1] - b[1];
    });
    const len = ordered.length, born = performance.now() / 1000;
    const f = i => {
      const o = i % len;
      const head = REDUCED ? len + 70 : ((performance.now() / 1000 - born) / 2.4) * (len + 70);
      if (o < head - 70) { const p = ordered[o]; return [p[0], p[1], 1, -1, 1.7]; }
      if (o < head) {
        const p = ordered[Math.min(len - 1, o)], q = ordered[Math.min(len - 1, Math.max(0, (0 | head) - 1))];
        const k = (o - (head - 70)) / 70;
        return [p[0] + (q[0] - p[0]) * k * k, p[1] + (q[1] - p[1]) * k * k,
                1, k > .82 ? 1 : k > .45 ? 2 : -1, 1.9 + .8 * k];
      }
      const r = particles[i];
      return [(r.rx * W + 8 * i * (r.rz + .2)) % (W + 20) - 10, r.ry * H + 8 * Math.sin(.5 * i + 9 * r.rz), .28 * r.rz + .08, -1, 1 + r.rz];
    };
    f.box = bb;
    return f;
  },

  /* letters around a ring (mobile hero fallback) */
  circle(str, box) {
    const chars = [...str].filter(ch => ch !== ' ');
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const R = .39 * Math.min(box.w, box.h);
    const per = Math.ceil(COUNT / chars.length), born = performance.now() / 1000;
    return i => {
      const ci = i % chars.length;
      const a0 = -Math.PI / 2 + ci / chars.length * TAU;
      const wob = REDUCED ? 0 : .35 * Math.max(0, performance.now() / 1000 - born - .6);
      const j = (i / chars.length) | 0;
      const rr = R + (j % 3 - 1) * 6;
      return [cx + Math.cos(a0 + wob) * rr, cy + Math.sin(a0 + wob) * rr, 1, ci === 0 ? 1 : -1, 1.6];
    };
  },

  /* Fibonacci sphere; optional orbiting ring ("sphere:ring") */
  sphere(kind, box) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const R = .42 * Math.min(box.w, box.h);
    const ringN = kind === 'ring' ? Math.floor(.2 * COUNT) : 0;
    return i => {
      if (i < ringN) {
        const a = i / ringN * TAU + .35 * clock;
        const x = Math.cos(a) * R * 1.55, y = Math.sin(a) * R * .38;
        return [cx + (x * Math.cos(-.32) - y * Math.sin(-.32)),
                cy + (x * Math.sin(-.32) + y * Math.cos(-.32)), .95, 1, 1.6];
      }
      const s = i - ringN + .5;
      const phi = Math.acos(1 - 2 * s / (COUNT - ringN));
      const th = 10.166407384630519 * s;
      let x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      const yaw = .22 * clock + .7 * pointer.nx, pitch = .35 + .35 * pointer.ny;
      let x1 = x * Math.cos(yaw) - z * Math.sin(yaw), z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
      let y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
      const persp = 1 / (1.9 - .5 * z2);
      return [cx + x1 * R * persp * 1.5, cy + y2 * R * persp * 1.5, .25 + .75 * (.5 * z2 + .5), -1, 1 + .9 * z2];
    };
  },

  /* DNA double helix with rungs */
  helix(str, box) {
    const cx = box.x + box.w / 2, R = .28 * Math.min(box.w, box.h);
    return i => {
      const strand = i % 3;
      const s = (i / COUNT + .03 * clock) % 1;
      const y = box.y + box.h * (1 - s);
      if (strand === 2) {
        const r = .618 * i % 1;
        const q = Math.floor(40 * s) / 40;
        return [cx + R * Math.cos(q * Math.PI * 16 + 1.1 * clock) * (2 * r - 1),
                box.y + box.h * (1 - q), .45, 2, 1.1];
      }
      const th = s * Math.PI * 16 + 1.1 * clock + strand * Math.PI;
      const l = Math.sin(th);
      return [cx + R * Math.cos(th) * (1 + .6 * s), y, .35 + .65 * (.5 * l + .5), strand ? 1 : 0, 1.1 + .8 * l];
    };
  },

  /* data-centre towers rising */
  towers(str, box) {
    const hgt = Array.from({ length: 36 }, (_, k) => .25 + ((43758.5453 * Math.sin(12.9898 * k) % 1 + 1) % 1) * .75);
    return i => {
      const k = i % 36, col = k % 9, tier = (k / 9) | 0;
      const rise = .381966 * i % 1, tip = rise > .97;
      return [box.x + box.w * (.08 + col / 8 * .84) + (tier - 1.5) * box.w * .035
              + box.w / 9 * .55 * (1 - .12 * tier) * ((.7548 * i % 1) - .5),
              box.y + box.h * (.95 - .06 * tier) - rise * (.75 * box.h * hgt[k] * (.9 + .1 * Math.sin(1.4 * clock + k))),
              .3 + .2 * tier + (tip ? .4 : 0),
              tip && Math.sin(4 * clock + k) > 0 ? 1 : tier === 3 ? 2 : 0, 1.3];
    };
  },

  /* radar broadcast rings (summit) */
  broadcast(str, box) {
    const cx = .5 * W, cy = .56 * H;
    return i => {
      const ray = i % 9, wave = (i / 9) | 0, waves = Math.ceil(COUNT / 9);
      const t = (.07 * clock + ray / 9) % 1;
      const r = 40 + t * (.72 * Math.max(W, H));
      const a = wave / waves * TAU + .4 * ray + .05 * Math.sin(.3 * clock + ray);
      const flat = W < 700 ? 1 : .62;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * flat, .85 * (1 - t), ray % 3 === 0 ? 1 : 2, 1.2 + .8 * (1 - t)];
    };
  },

  /* waving pixel flag */
  flag(str, box) {
    const cols = Math.ceil(COUNT / 13);
    return i => {
      const row = i % 13, col = (i / 13) | 0;
      const u = col / cols;
      const canton = u < .4 && row < 7;
      const star = canton && col % 3 === 0 && row % 2 === 0;
      const y = box.y + .08 * box.h + row / 12 * box.h * .8
        + (Math.sin(7 * u - 2.4 * clock) * box.h * .05 * (u + .15) + Math.sin(3 * u - 1.1 * clock) * box.h * .02);
      return [box.x + u * box.w, y, canton ? (star ? 1 : .55) : .9, canton ? (star ? 0 : 2) : row % 2 ? 0 : 1, 1.6];
    };
  },

  /* idle drift */
  scatter() {
    return i => {
      const r = particles[i];
      return [(r.rx * W + 8 * i * (r.rz + .2)) % (W + 20) - 10,
              r.ry * H + 8 * Math.sin(.5 * i + 9 * r.rz), .28 * r.rz + .08, -1, 1 + r.rz];
    };
  },
};

/* ---------------- region boxes ---------------- */
function boxFor(region) {
  const wide = W >= 900;
  if (region === 'hero' || region === 'hero2') {
    const h1 = $('.hero h1');
    const top = h1 ? h1.getBoundingClientRect().top + scrollY : .62 * H;
    if (wide && region === 'hero') return { x: .04 * W, y: .1 * H, w: .92 * W, h: .6 * H };
    if (wide) return { x: .04 * W, y: 72, w: .92 * W, h: Math.max(.3 * H, top - 72) };
    return { x: .02 * W, y: 64, w: .96 * W, h: Math.max(.25 * H, top - 18) };
  }
  return wide ? { x: .52 * W, y: .14 * H, w: .42 * W, h: .72 * H }
              : { x: .08 * W, y: .1 * H, w: .84 * W, h: .5 * H };
}

function setForm(spec) {
  if (!spec || spec === formId) return;
  formId = spec;
  const [body, side = 'right'] = spec.split(';');
  const [kind, arg = ''] = body.split(':');
  const box = boxFor(side);
  let fn = null;
  if (kind === 'text') fn = Forms.text(arg, box);
  else if (kind === 'snake') fn = Forms.snake(arg, box);
  else if (kind === 'circle') fn = Forms.circle(arg, box);
  else if (kind === 'sphere') fn = Forms.sphere(arg, box);
  else if (kind === 'helix') fn = Forms.helix(arg, box);
  else if (kind === 'towers') fn = Forms.towers(arg, box);
  else if (kind === 'broadcast') fn = Forms.broadcast(arg, box);
  else if (kind === 'flag') fn = Forms.flag(arg, box);
  else fn = Forms.scatter();
  activeForm = fn;
  if (fn.box) formBoxes[spec] = fn.box;
  fieldScale = W < 900 && side === 'right' ? .4 : 1;
  if (kind === 'scatter') fieldScale = 1;
}

/* ---------------- the render loop ---------------- */
function frame(ts) {
  clock = ts / 1000;
  ctx.clearRect(0, 0, W, H);
  dimFactor += .12 * (fieldScale * dimTarget - dimFactor);
  for (let ri = ripples.length - 1; ri >= 0; ri--) {
    ripples[ri].r += 16;
    if (ripples[ri].r > 1.2 * Math.max(W, H)) ripples.splice(ri, 1);
  }
  const REPEL = 120, PULL = REDUCED ? .2 : .045;
  for (let i = 0; i < COUNT; i++) {
    const p = particles[i];
    const tgt = activeForm ? activeForm(i, REDUCED ? 0 : clock) : [p.x, p.y, .3, -1, 1];
    const pull = tgt[5] ?? PULL;
    let ax = (tgt[0] - p.x) * pull, ay = (tgt[1] - p.y) * pull;
    const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
    if (d2 < REPEL * REPEL) {
      const d = Math.sqrt(d2) || 1, f = (REPEL - d) / REPEL * 5;
      ax += dx / d * f; ay += dy / d * f;
    }
    for (const rp of ripples) {
      const ex = p.x - rp.x, ey = p.y - rp.y, ed = Math.hypot(ex, ey) || 1;
      if (Math.abs(ed - rp.r) < 26) { ax += ex / ed * 10; ay += ey / ed * 10; }
    }
    p.vx = .84 * (p.vx + ax); p.vy = .84 * (p.vy + ay);
    p.x += p.vx; p.y += p.vy;
    const spd = Math.min(1, Math.hypot(p.vx, p.vy) / 7);
    const col = spd > .35 ? 1 : tgt[3] >= 0 ? tgt[3] : p.c;
    ctx.globalAlpha = clamp(tgt[2] * dimFactor + .4 * spd, 0, 1);
    ctx.fillStyle = COLORS[col];
    const sz = tgt[4] * (W < 700 ? 1.1 : 1.35) + 2 * spd;
    ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
  if (!REDUCED) requestAnimationFrame(frame);
}

addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.nx = e.clientX / W * 2 - 1; pointer.ny = e.clientY / H * 2 - 1;
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.x = pointer.y = -9999; });
addEventListener('pointerdown', e => {
  if (!e.target.closest('a,button,input')) ripples.push({ x: e.clientX, y: e.clientY, r: 0 });
});

/* ---------------- scroll orchestration ---------------- */
let dimTarget = 1;
function onScroll() {
  if (document.body.classList.contains('menu-open')) return;
  const mid = .5 * innerHeight;

  /* active particle form = smallest [data-form] crossing viewport centre */
  let best = null, bestH = Infinity;
  $$('[data-form]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid && r.height < bestH) { best = el; bestH = r.height; }
  });
  if (best) setForm(best.dataset.form.includes(';') ? best.dataset.form : best.dataset.form + ';right');

  /* dots scrollspy */
  let cur = null;
  $$('[data-dot]').forEach(el => {
    el.id = el.id || 'sec' + ($$('[data-dot]').indexOf(el));
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) cur = el.id;
  });
  $$('#dots a').forEach(a => a.classList.toggle('on', a.dataset.t === cur));

  /* fade the field as the footer arrives */
  const fTop = $('footer').getBoundingClientRect().top;
  dimTarget = clamp((fTop - .35 * innerHeight) / (.55 * innerHeight), 0, 1);

  pageScroll && pageScroll();
}
addEventListener('scroll', onScroll, { passive: true });

/* ---------------- home-page controllers ---------------- */
let pageScroll = null;

function mountHome() {
  /* word light-up */
  const words = $$('#w1 span'), wBox = $('#w1');
  /* marquee with inertia */
  const mq = $('#mq');
  let mx = 0, lastY = scrollY, vel = 0, skew = 0, alive = true;
  (function tick() {
    if (!alive) return;
    const dy = scrollY - lastY; lastY = scrollY;
    vel += .1 * (dy - vel);
    mx -= 1 + .6 * Math.abs(vel);
    skew += .1 * (clamp(.4 * vel, -12, 12) - skew);
    const period = mq.scrollWidth / 3;
    if (-mx > period) mx += period;
    mq.style.transform = `translateX(${mx}px) skewX(${-skew}deg)`;
    if (!REDUCED) requestAnimationFrame(tick);
  })();

  /* count-up + pinned steps */
  const big = $('#ninety'), pin = $('#pillars');
  const arts = $$('#pillarUI article'), bars = $$('#pillarUI .progress b');
  let counted = false;
  const countUp = () => {
    if (REDUCED) { big.textContent = '13'; return; }
    const t0 = performance.now();
    (function step(t) {
      const k = clamp((t - t0) / 1400, 0, 1);
      big.textContent = Math.round(13 * (1 - Math.pow(1 - k, 4))) + (k === 1 ? '' : '');
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  };

  /* hero SI ↔ snake hover form */
  const hero = $('.hero');
  const SI = 'text:SI;hero', SNAKE = 'snake:Super|Intelligence;hero2';
  let snake = false;
  const inBox = (bb, x, y, m) => bb && x > bb.x0 - m && x < bb.x1 + m && y > bb.y0 - m && y < bb.y1 + m;
  const applyHero = force => {
    hero.dataset.form = snake ? (innerWidth < 900 ? 'circle:SUPER INTELLIGENCE;hero' : SNAKE) : SI;
    if (force || hero.getBoundingClientRect().bottom > .3 * innerHeight) { formId = ''; setForm(hero.dataset.form); }
  };
  const onMove = e => {
    if (e.pointerType === 'touch' || document.body.classList.contains('menu-open')) return;
    if (hero.getBoundingClientRect().bottom < .5 * innerHeight) return;
    const hb = hero.getBoundingClientRect();
    const box = formBoxes[snake ? SNAKE : SI];
    snake = !(e.clientY > hb.bottom) && inBox(box, e.clientX, e.clientY, snake ? 60 : 20);
    applyHero(false);
  };
  if (!REDUCED) addEventListener('pointermove', onMove, { passive: true });
  let tapStart = null;
  hero.addEventListener('touchstart', e => {
    const t = e.touches[0];
    tapStart = e.target.closest('a,button') ? null : { x: t.clientX, y: t.clientY, at: performance.now() };
  }, { passive: true });
  hero.addEventListener('touchend', e => {
    if (!tapStart) return;
    const t = e.changedTouches[0];
    const moved = Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y);
    const quick = performance.now() - tapStart.at < 600;
    tapStart = null;
    if (moved < 12 && quick) { snake = !snake; applyHero(true); }
  }, { passive: true });

  $('#toInits').addEventListener('click', e => {
    e.preventDefault();
    $('#initiatives').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  });

  pageScroll = () => {
    /* words */
    const r = wBox.getBoundingClientRect();
    const prog = clamp((.85 * innerHeight - r.top) / (r.height + .35 * innerHeight), 0, 1);
    words.forEach((sp, i) => sp.classList.toggle('on', i / words.length < prog));
    /* pinned steps */
    const pr = pin.getBoundingClientRect();
    const h = clamp(-pr.top / (pr.height - innerHeight), 0, .9999);
    const step = Math.floor(3 * h);
    arts.forEach((a, i) => a.classList.toggle('on', i === step));
    bars.forEach((b, i) => b.style.transform = `scaleX(${clamp(3 * h - i, 0, 1)})`);
    /* count-up trigger */
    if (!counted && big.getBoundingClientRect().top < .8 * innerHeight) { counted = true; countUp(); }
  };

  return { destroy() { alive = false; removeEventListener('pointermove', onMove); } };
}

/* ---------------- summit section ---------------- */
function mountSummitExtras() {
  const player = $('.sm-player');
  if (!player) return;
  const vid = (player.dataset.video || '').trim();
  if (!/^[\w-]{11}$/.test(vid)) return;
  const embed = (start = 0) => {
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1&playsinline=1&start=${0 | start}" title="Science: A New Golden Age Summit" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  };
  const poster = $('.sm-poster', player);
  poster && poster.addEventListener('click', () => {
    embed(0);
    ripples.push({ x: innerWidth / 2, y: innerHeight / 2, r: 0 });
  });
  /* ghost headline parallax */
  const sum = $('.summit'), ghost = $('.sm-ghost');
  if (sum && ghost && !REDUCED) addEventListener('scroll', () => {
    const r = sum.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const e = (innerHeight - r.top) / (innerHeight + r.height);
    ghost.style.transform = `translate3d(${100 * (.15 - .6 * e)}vw,-50%,0)`;
  }, { passive: true });
}

/* ---------------- iris transition, menu, cursor, misc ---------------- */
function mountChrome() {
  /* dots nav build */
  const dots = $('#dots'), secs = $$('[data-dot]');
  secs.forEach((el, i) => { el.id = el.id || 'sec' + i; });
  dots.innerHTML = secs.map(el =>
    `<a href="#${el.id}" data-t="${el.id}"><span>${el.dataset.dot}</span><i></i></a>`).join('');
  $$('#dots a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(a.dataset.t).scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }));

  /* reveal observer */
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: .15 });
  $$('.reveal, .fade').forEach(el => REDUCED ? el.classList.add('in') : io.observe(el));

  /* initiative card spotlight */
  $$('.init').forEach(card => card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', e.clientX - r.left + 'px');
    card.style.setProperty('--my', e.clientY - r.top + 'px');
  }));

  /* iris link transition (same-origin only) */
  const iris = $('#iris'), irisTxt = $('#irisTxt');
  let downAt = null;
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link || e.defaultPrevented || link.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;                       /* leave external alone */
    const here = location.pathname.replace(/\/+$/, '') || '/';
    const there = url.pathname.replace(/\/+$/, '') || '/';
    if (there === here) {
      if (url.hash) return;                                            /* anchors scroll natively */
      e.preventDefault(); closeMenu();
      scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      return;
    }
    if (REDUCED) return;
    e.preventDefault(); closeMenu();
    const at = downAt || { x: innerWidth / 2, y: innerHeight / 2 };
    iris.style.setProperty('--x', at.x + 'px');
    iris.style.setProperty('--y', at.y + 'px');
    irisTxt.textContent = '';
    ripples.push({ x: at.x, y: at.y, r: 0 });
    iris.classList.add('on');
    setTimeout(() => { location.href = url.href; }, 650);
  }, true);
  document.addEventListener('click', e => { downAt = { x: e.clientX, y: e.clientY }; }, true);
  addEventListener('pageshow', e => {
    if (e.persisted) { iris.style.transition = 'none'; iris.classList.remove('on'); requestAnimationFrame(() => iris.style.transition = ''); }
  });

  /* menu orb */
  const orb = $('#orb');
  function closeMenu() {
    if (!document.body.classList.contains('menu-open')) return;
    document.body.classList.remove('menu-open');
    orb.setAttribute('aria-expanded', 'false');
    $('#orbTxt').textContent = 'Menu';
  }
  orb.addEventListener('click', () => {
    if (document.body.classList.contains('menu-open')) { closeMenu(); orb.focus(); return; }
    document.body.classList.add('menu-open');
    orb.setAttribute('aria-expanded', 'true');
    $('#orbTxt').textContent = 'Close';
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  /* menu link hover previews a particle form */
  $$('#menuList a[data-preview]').forEach(a =>
    a.addEventListener('pointerenter', () => { if (document.body.classList.contains('menu-open')) { formId = ''; setForm(a.dataset.preview + ';right'); } }));

  /* custom cursor */
  if (FINE && !REDUCED) {
    const cur = $('#cursor');
    let cx = -100, cy = -100, tx = -100, ty = -100;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    document.addEventListener('pointerover', e =>
      cur.classList.toggle('big', !!e.target.closest('a,button')));
    (function loop() {
      cx += .2 * (tx - cx); cy += .2 * (ty - cy);
      cur.style.transform = `translate(${cx}px,${cy}px)`;
      requestAnimationFrame(loop);
    })();
  } else $('#cursor').remove();

  /* giant wordmark: mask the shimmer strip with the logo + dot screen */
  const giant = $('.giant'), logo = $('.brand img');
  if (giant && logo) {
    const mask = `url(${logo.src}), radial-gradient(circle, #000 1.15px, transparent 1.75px)`;
    giant.style.webkitMaskImage = mask; giant.style.maskImage = mask;
    giant.style.webkitMaskSize = giant.style.maskSize = '100% 100%, 6px 6px';
    giant.style.webkitMaskRepeat = giant.style.maskRepeat = 'no-repeat, repeat';
    giant.style.webkitMaskComposite = 'source-in'; giant.style.maskComposite = 'intersect';
  }

  /* newsletter stub (demo: never submits) */
  const form = $('.mc');
  if (form) {
    const email = $('#mcEmail'), msg = $('#mcMsg');
    const say = (t, ok) => { msg.textContent = t; msg.className = 'mmsg ' + (ok ? 'ok' : 'err'); };
    email.addEventListener('input', () => msg.textContent = '');
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return say('Enter a valid email address.');
      say('Demo only — signups aren’t connected.');
    });
  }
}

/* ---------------- boot ---------------- */
function boot() {
  makeParticles();
  mountChrome();
  mountHome();
  mountSummitExtras();
  document.documentElement.classList.add('si-ready');
  onScroll();
  if (REDUCED) { frame(performance.now()); } else requestAnimationFrame(frame);
}

let rs;
addEventListener('resize', () => {
  clearTimeout(rs);
  rs = setTimeout(() => {
    sampleCache.clear(); formBoxes = {};
    makeParticles();
    const keep = formId; formId = ''; setForm(keep);
    onScroll();
    if (REDUCED) frame(performance.now());
  }, 160);
});

const fontsReady = document.fonts && document.fonts.load
  ? Promise.race([document.fonts.load('400 100px "Instrument Serif"'), new Promise(r => setTimeout(r, 1500))]).catch(() => {})
  : Promise.resolve();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fontsReady.then(boot));
else fontsReady.then(boot);
})();
