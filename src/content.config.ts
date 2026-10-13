import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 博客文章集合。
 *
 * 沿用旧 Jekyll 站的 front matter 字段（title / date / category / tags / keywords / description），
 * 使 22 篇历史文章无需改写正文即可迁移。
 * `category` 存中文显示名（技术 / 读书 / 资源 / 工具 / 生活 / 面试），
 * URL 用的英文 slug 由 CATEGORY_SLUG 映射表统一换算，避免中文进 URL。
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };

/** 中文分类 → URL slug 映射，与旧 `_posts/` 子目录名保持一致。 */
export const CATEGORY_SLUG: Record<string, string> = {
  技术: 'tech',
  读书: 'book',
  资源: 'resource',
  工具: 'tool',
  生活: 'life',
  面试: 'interview',
};

/** slug → 中文分类反查表，供分类页标题使用。 */
export const SLUG_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG).map(([zh, en]) => [en, zh]),
);
