import { buildFeed } from '../../lib/feed';

/**
 * 旧 Jekyll 站的订阅地址，仅为兼容既有订阅者而保留。
 *
 * 这里刻意不做跳转：GitHub Pages 纯静态托管返回不了 3xx，在 `.xml` 路径下放 HTML
 * meta refresh 又会让阅读器解析失败，两种做法对老订阅者都等同于断订。所以继续产出
 * 与 `/rss.xml` 完全一致的 feed。新增订阅请用 `/rss.xml`。
 *
 * 输出逻辑见 `src/lib/feed.ts`，两个端点共用，避免 feed 内容出现分叉。
 */
export const GET = (context) => buildFeed(context.site);
