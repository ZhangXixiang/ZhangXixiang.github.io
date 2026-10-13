import rss from '@astrojs/rss';
import { SITE } from '../data/site';
import { getAllPosts } from './posts';

/**
 * RSS 2.0 输出的唯一构建入口。
 *
 * 为什么要抽成共享模块：旧 Jekyll 站的订阅地址是 `/pages/feed.xml`，迁移后主 feed
 * 移到 `/rss.xml`。GitHub Pages 是纯静态托管，返回不了 3xx 跳转；而在 `.xml` 路径下
 * 放 HTML meta refresh 会让阅读器解析失败，对既有订阅者等同于断订。因此让两个路径
 * 共用同一份输出，旧订阅者无感继续收更新，新增订阅统一走 `/rss.xml`。
 *
 * @param site 站点根 URL，由端点的 `Astro.site` 透传；RSS 规范要求条目链接为绝对地址，
 *             `@astrojs/rss` 用它补全相对 `link`。缺省时回落到 `SITE.url`，
 *             避免 `Astro.site` 未定义（如未配 `site` 的本地构建）时产出非法 feed。
 */
export async function buildFeed(site?: URL | string) {
  const posts = await getAllPosts();

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: site ?? SITE.url,
    items: posts.map((p) => ({
      title: p.title,
      description: p.description,
      pubDate: p.date,
      link: p.url,
      categories: [p.category, ...p.tags],
      author: `${SITE.email} (${SITE.author})`,
    })),
    customData: [
      '<language>zh-CN</language>',
      `<managingEditor>${SITE.email} (${SITE.author})</managingEditor>`,
      `<webMaster>${SITE.email} (${SITE.author})</webMaster>`,
    ].join(''),
  });
}
