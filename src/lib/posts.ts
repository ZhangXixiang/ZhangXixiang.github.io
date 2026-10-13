import { getCollection, type CollectionEntry } from 'astro:content';
import { categorySlug, readingTime } from '../data/site';

/**
 * 文章派生数据层。
 *
 * 存在的理由：Astro 内容集合给出的 `id` 只是文件名，而本站必须沿用旧 Jekyll 的
 * permalink `/:year/:month/:day/:title.html`（2013—2024 年间被外部引用的历史 URL），
 * 因此这里统一从**文件名前缀**解析日期与 slug，并派生出 URL、阅读时长、摘要等展示字段，
 * 让页面层只做渲染、不做字符串处理。
 *
 * 为什么不用 front matter 里的 `date`：`z.coerce.date()` 会把 `2018-09-04`
 * 解析成 UTC 零点，在 UTC-x 时区的构建机上用本地 getter 取值会退到前一天。
 * 文件名前缀是纯字符串，任何时区都稳定，且与 Jekyll 的行为一致。
 */

export type BlogPost = CollectionEntry<'blog'>;

/** 供页面与组件消费的文章视图模型 */
export interface PostView {
  /** 原始内容集合条目，用于 render() 取正文与标题 */
  entry: BlogPost;
  /** 文件名去掉日期前缀后的 slug，如 `timsort` */
  slug: string;
  /** 站内绝对路径，如 `/2018/09/04/timsort.html` */
  url: string;
  title: string;
  /** UTC 零点构造的日期，仅用于排序与 `<time datetime>` */
  date: Date;
  /** `YYYY.MM.DD`，已按文件名前缀生成，不受构建机时区影响 */
  dateLabel: string;
  /** `YYYY-MM-DD`，用于 `<time datetime>` 与 RSS/OG */
  isoDate: string;
  /** 中文分类名（技术 / 读书 / …） */
  category: string;
  /** 分类英文 slug，用于 /category/<slug> 路由 */
  catSlug: string;
  tags: string[];
  keywords: string[];
  /** front matter description，缺失时由正文首段自动截取 */
  description: string;
  /** 估算阅读分钟数 */
  minutes: number;
  year: string;
}

/** 文件名形如 `2018-09-04-timsort.md`，前缀即 Jekyll 用来生成 permalink 的日期 */
const FILE_DATE = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/;

/**
 * 去掉 Markdown 语法后截取摘要。
 * 老文章大多没写 description，用正文首段兜底比留空更利于 SEO 与列表展示。
 */
function excerpt(body: string, limit = 96): string {
  const text = body
    // 去掉代码围栏及其内容，避免摘要变成一堆符号
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^---[\s\S]*?---/m, ' ')
    // 标题、图片、链接、行内代码 → 只留文字
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** 把内容集合条目转成视图模型；文件名不含日期前缀时返回 null 并告警。 */
function toView(entry: BlogPost): PostView | null {
  const m = FILE_DATE.exec(entry.id);
  if (!m) {
    // 走到这里说明 src/content/blog 下混入了不规范命名的文件，构建期就暴露出来
    console.warn(`[posts] 跳过无法解析日期的文件: ${entry.id}`);
    return null;
  }
  const [, year, month, day, slug] = m;
  const d = entry.data;
  return {
    entry,
    slug,
    url: `/${year}/${month}/${day}/${slug}.html`,
    title: d.title,
    date: new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
    dateLabel: `${year}.${month}.${day}`,
    isoDate: `${year}-${month}-${day}`,
    category: d.category,
    catSlug: categorySlug(d.category),
    tags: d.tags,
    keywords: d.keywords,
    description: d.description?.trim() || excerpt(entry.body ?? ''),
    minutes: readingTime(entry.body ?? ''),
    year,
  };
}

/** 全量文章，按日期倒序（同日按 slug 保证顺序稳定）。 */
export async function getAllPosts(): Promise<PostView[]> {
  const entries = await getCollection('blog', ({ data }) => !data.draft);
  return entries
    .map(toView)
    .filter((p): p is PostView => p !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || a.slug.localeCompare(b.slug));
}

/** 按分类分组的文章，键为英文 slug；仅返回有文章的分类。 */
export async function getPostsByCategory(): Promise<Map<string, PostView[]>> {
  const posts = await getAllPosts();
  const map = new Map<string, PostView[]>();
  for (const p of posts) {
    const list = map.get(p.catSlug);
    if (list) list.push(p);
    else map.set(p.catSlug, [p]);
  }
  return map;
}

/** 全站出现过的年份，倒序，用于归档页/首页时间轴。 */
export async function getPostYears(): Promise<string[]> {
  const posts = await getAllPosts();
  return [...new Set(posts.map((p) => p.year))].sort((a, b) => Number(b) - Number(a));
}

/**
 * 取某篇的前一篇 / 后一篇（按时间倒序列表中的相邻项）。
 * 返回列表中的相邻元素，缺失一侧为 null，页面用占位块保持栅格。
 */
export function neighbors(
  posts: PostView[],
  current: PostView,
): { prev: PostView | null; next: PostView | null } {
  const i = posts.findIndex((p) => p.url === current.url);
  if (i < 0) return { prev: null, next: null };
  // posts 为倒序：索引小 = 更新的文章 = 「下一篇」
  return { prev: posts[i + 1] ?? null, next: posts[i - 1] ?? null };
}
