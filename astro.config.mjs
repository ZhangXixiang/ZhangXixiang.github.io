// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeCodeWrap from './plugins/rehype-code-wrap.mjs';

/**
 * Astro 站点配置。
 *
 * 关键点：build.format 设为 'file'，使文章产出 dist/2018/09/04/timsort.html，
 * 与旧 Jekyll permalink（/:year/:month/:day/:title.html）逐字节一致，
 * 保证 2013—2024 年间被外部引用的历史 URL 不 404。
 */
export default defineConfig({
  site: 'https://zhangxixiang.github.io',
  integrations: [sitemap()],
  build: {
    // 产出 <slug>.html 而非 <slug>/index.html，对齐 Jekyll 历史 permalink
    format: 'file',
    inlineStylesheets: 'auto',
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-dark', dark: 'github-dark' },
      wrap: true,
      transformers: [
        {
          // 把语言写进 <pre data-lang>，供 rehype-code-wrap 生成标题栏
          name: 'expose-lang',
          pre(node) {
            node.properties = node.properties || {};
            // this 由 Shiki 运行时注入 TransformerContext，其类型未从公开 d.ts 导出，用可选链兜底
            node.properties['data-lang'] = this?.options?.lang || 'text';
          },
        },
      ],
    },
    rehypePlugins: [rehypeCodeWrap],
  },
  compressHTML: true,
});
