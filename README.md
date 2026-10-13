# 穿越整个城市的越野跑 · Cross-City Trail

个人技术博客，线上地址：<https://zhangxixiang.github.io>

写技术踩坑、读书笔记，也写生活里需要认真想清楚的事。2013 年至今的全部文章与历史 URL 原样保留。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | [Astro 5](https://astro.build) | 纯静态输出，零运行时框架 |
| 样式 | SCSS + CSS 自定义属性 | 设计令牌集中在 `src/styles/_tokens.scss` |
| 高亮 | Shiki | 构建期生成，带语言标签与一键复制 |
| 字体 | Orbitron / Chakra Petch / JetBrains Mono | 拉丁子集自托管 woff2，约 43KB；中文走系统 CJK 栈，不下载字体 |
| 部署 | GitHub Pages + GitHub Actions | 见下方「部署」 |

视觉概念是「城市数据荒原上的一条越野轨迹」：深空蓝黑的分层表面，霓虹青紫双色主线，配扫描线、噪点与透视网格地平线。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:4321
```

其他命令：

```bash
npm run build      # 产出 dist/
npm run preview    # 本地预览构建产物
npm run check      # astro check，类型与模板校验
```

## 部署

推送到 `master` 分支即自动构建发布，流程见 `.github/workflows/deploy.yml`。

**首次启用需要在仓库网页上改一次设置**：`Settings → Pages → Build and deployment → Source` 选 **`GitHub Actions`**。若仍停在 `Deploy from a branch`，工作流上传的产物不会被发布，站点会继续停留在旧内容上。

本仓不再使用 GitHub 自带的 Jekyll 构建链路。

## 目录结构

```
src/
├── content/blog/       22 篇文章，文件名即 YYYY-MM-DD-slug.md
├── components/         Hero / Sidebar / PostCard / Footer / Icon / EffectsLayer
├── layouts/            BaseLayout（全站骨架）、PostLayout（文章页）
├── pages/              路由：首页、归档、分类、文章、RSS、404
├── scripts/            客户端交互，见下方「交互与特效」
├── styles/             SCSS，按职责分文件，index.scss 为唯一入口
├── lib/posts.ts        内容集合查询、排序、上一篇/下一篇
└── data/site.ts        站点配置（原 Jekyll _config.yml 的等价物）
plugins/
└── rehype-code-wrap.mjs   给代码块生成标题栏与复制按钮
public/                 原样拷贝到站点根目录的静态资源
```

## 写新文章

在 `src/content/blog/` 下新建 `YYYY-MM-DD-slug.md`：

```markdown
---
title: 文章标题
date: 2026-10-12
category: 技术
description: 一句话摘要，用于卡片与社交分享
---

正文从这里开始。
```

`category` 取 `技术` / `读书` / `资源` / `工具` / `生活` / `面试` 之一，对应关系在 `src/data/site.ts` 的 `CATEGORY_ORDER` 里维护。

产出 URL 为 `/{年}/{月}/{日}/{slug}.html`，与历史 permalink 规则一致。

## 历史 URL 兼容

`astro.config.mjs` 里 `build.format` 设为 `'file'`，产出 `dist/2018/09/04/timsort.html` 而非 `dist/2018/09/04/timsort/index.html`，与旧站的 `/:year/:month/:day/:title.html` 逐字节一致。2013 年以来被外部引用的链接不会失效。

站内链接（分类页、归档页）也必须写全 `.html` 后缀：GitHub Pages 对无扩展名路径不保证回退。

## 交互与特效

三栏结构沿用「图标轨 / 全量文章索引 / 主内容」，索引支持即时搜索与分类筛选，22 篇全量渲染在 DOM 中，筛选零请求。

| 模块 | 文件 | 作用 |
|---|---|---|
| 粒子背景 | `scripts/particles.ts` | Canvas 浮尘与连线，指针斥力互动 |
| 入场彩带 | `scripts/confetti.ts` | 会话首次进站时的一次性礼炮 |
| 标题解码 | `scripts/fx.ts` | Hero 主标题由乱码块逐字解码，一次会话只播一次 |
| 鼠标视差 | `scripts/fx.ts` | Hero 各层随指针产生不同幅度位移，形成纵深 |
| 光标拖尾 | `scripts/fx.ts` | 霓虹环 + 逐级追赶的拖尾节点，悬停可点元素时放大 |
| 描边扫光 | `scripts/fx.ts` | 卡片进入视口或悬停时，一道霓虹光沿边框转一圈 |
| 页面交互 | `scripts/ui.ts` | 阅读进度、滚动揭示、目录高亮、复制按钮、导航过渡 |

所有动画都遵循渐进增强：HTML 在脚本执行前已完整可用，脚本失效只损失动效，不影响阅读。

`prefers-reduced-motion: reduce` 下，粒子退化为单帧静态图，彩带、标题解码、视差、光标拖尾与描边扫光全部跳过，CSS 层另有一道全局收敛规则兜底。光标类特效在触屏设备上也不渲染。

## 许可

内容采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，代码见 `LICENSE.txt`。
