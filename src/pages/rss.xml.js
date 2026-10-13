import { buildFeed } from '../lib/feed';

/**
 * 主 RSS 地址 `/rss.xml`。
 *
 * `<link rel="alternate">` 已在 BaseLayout 里声明，订阅器可自动发现。
 * 旧地址 `/pages/feed.xml` 仍保留同样的输出以兼容既有订阅者，
 * 两者共用 `src/lib/feed.ts`，具体理由见该文件注释。
 */
export const GET = (context) => buildFeed(context.site);
