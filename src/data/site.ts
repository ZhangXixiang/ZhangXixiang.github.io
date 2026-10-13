/**
 * 站点全局配置（原 Jekyll `_config.yml` 的等价物）。
 *
 * 迁移时修正的三处失效链接：
 *  - 原 twitter / linkedin / instagram 字段被填成了邮箱地址，
 *    模板拼出 https://twitter.com/zxx199109@163.com 这类死链 → 已移除；
 *  - 原 weibo 字段值本身是完整 URL，模板又前缀了 http://www.weibo.com/，
 *    拼出 http://www.weibo.com/https://weibo.com/u/1917774047/home → 已修正为单一 URL；
 *  - 原 avatar / favicon 指向 http://r.photo.store.qq.com/…，在 https 站点上属混合内容
 *    会被浏览器拦截（头像实际加载不出来）→ 改用仓库内 public/avatar.jpg。
 */
export const SITE = {
  title: '穿越整个城市的越野跑',
  titleEn: 'Cross-City Trail',
  // 左轨竖排 wordmark，用拉丁字符保证 Orbitron 有字形可用
  wordmark: 'CYBER TRAIL',
  description:
    '记录技术探索、读书笔记与生活感悟。在代码与文字之间，持续奔跑。',
  author: 'Zhang Xixiang',
  email: 'zxx199109@163.com',
  url: 'https://zhangxixiang.github.io',
  avatar: '/avatar.jpg',
  favicon: '/favicon.svg',
  // 首页「最新文章」默认展示条数（原 _config.yml 的 recent_num）
  recentNum: 20,
  license: {
    name: 'CC BY-NC-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
} as const;

/** 社交链接：只保留可验证有效的条目，不为凑数编造账号。 */
export const SOCIALS = [
  { icon: 'github', label: 'GitHub', href: 'https://github.com/zhangxixiang', external: true },
  { icon: 'weibo', label: '微博', href: 'https://weibo.com/u/1917774047', external: true },
  { icon: 'rss', label: 'RSS 订阅', href: '/rss.xml', external: false },
  { icon: 'mail', label: '邮件联系', href: `mailto:${SITE.email}`, external: false },
] as const;

/**
 * 分类展示顺序。
 * 中文名为 front matter 里的 `category` 值，slug 与旧 `_posts/` 子目录名一致，
 * 用于 /category/<slug>/ 路由。
 */
export const CATEGORY_ORDER = [
  { zh: '技术', slug: 'tech', en: 'Tech' },
  { zh: '读书', slug: 'book', en: 'Reading' },
  { zh: '资源', slug: 'resource', en: 'Resources' },
  { zh: '工具', slug: 'tool', en: 'Tools' },
  { zh: '生活', slug: 'life', en: 'Life' },
  { zh: '面试', slug: 'interview', en: 'Interview' },
] as const;

/** 中文分类名 → URL slug。 */
export function categorySlug(zh: string): string {
  return CATEGORY_ORDER.find((c) => c.zh === zh)?.slug ?? 'misc';
}

/** slug → 中文分类名。 */
export function categoryName(slug: string): string {
  return CATEGORY_ORDER.find((c) => c.slug === slug)?.zh ?? slug;
}

/**
 * 分类页 URL。
 *
 * 必须带 `.html` 后缀：站点用 `build.format: 'file'` 构建，
 * 产出的是 `dist/category/tech.html` 而非 `dist/category/tech/index.html`，
 * GitHub Pages 对无扩展名路径不保证回退到 `.html`，直接写全路径最稳妥。
 */
export function catUrl(slug: string): string {
  return `/category/${slug}.html`;
}

/** 归档页 URL，同样带 `.html`，理由见 catUrl。 */
export const ARCHIVE_URL = '/archive.html';

/**
 * 格式化日期为 YYYY.MM.DD，等宽数字在 mono 字体下对齐更整齐。
 *
 * 统一用 UTC getter：站点内所有 Date 都由文件名日期按 UTC 零点构造
 * （见 src/lib/posts.ts），用本地 getter 会在 UTC-x 构建机上退到前一天。
 */
export function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
}

/**
 * 粗略估算中文长文阅读时长。
 * 中文按字符计，约 400 字/分钟；不足 1 分钟按 1 分钟显示。
 */
export function readingTime(body: string): number {
  const chars = body.replace(/\s/g, '').length;
  return Math.max(1, Math.round(chars / 400));
}
