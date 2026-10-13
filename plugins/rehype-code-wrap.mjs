/**
 * rehype 插件：把 Shiki 输出的 <pre class="astro-code"> 包装成带标题栏的代码块。
 *
 * 为什么在构建期做而不是运行时用 JS 包装：
 * 无 JS / JS 失败时代码块仍有完整的边框、语言标签与语义结构，
 * 只有「复制」按钮是渐进增强的。
 *
 * 输出结构：
 *   <div class="code-block">
 *     <div class="code-head">
 *       <span class="code-lang">java</span>
 *       <button class="code-copy" type="button">复制</button>
 *     </div>
 *     <pre class="astro-code" data-lang="java">…</pre>
 *   </div>
 */

/** 手写树遍历，避免额外引入 unist-util-visit 依赖。 */
function walk(node, fn, parent, index) {
  fn(node, index, parent);
  if (node.children && Array.isArray(node.children)) {
    // 倒序遍历，允许回调安全地替换当前节点
    for (let i = node.children.length - 1; i >= 0; i--) {
      walk(node.children[i], fn, node, i);
    }
  }
}

/** 从 class 列表中挑出 language-xxx，作为 data-lang 缺失时的兜底。 */
function langFromClass(properties) {
  const cls = properties && properties.class;
  const list = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(/\s+/) : [];
  for (const c of list) {
    if (typeof c === 'string' && c.startsWith('language-')) return c.slice('language-'.length);
  }
  return null;
}

export default function rehypeCodeWrap() {
  return (tree) => {
    walk(tree, (node, index, parent) => {
      if (!parent || index == null) return;
      if (node.type !== 'element' || node.tagName !== 'pre') return;

      // 只处理 Shiki 产出的代码块，普通 <pre> 原样保留
      const cls = node.properties && node.properties.class;
      const list = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(/\s+/) : [];
      if (!list.includes('astro-code')) return;

      const code = (node.children || []).find(
        (c) => c.type === 'element' && c.tagName === 'code',
      );
      const lang =
        (node.properties && node.properties['data-lang']) ||
        langFromClass(node.properties) ||
        langFromClass(code && code.properties) ||
        'text';

      node.properties = node.properties || {};
      node.properties['data-lang'] = lang;
      node.properties.tabIndex = 0; // 键盘可横向滚动宽代码

      const wrapper = {
        type: 'element',
        tagName: 'div',
        properties: { class: ['code-block'] },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { class: ['code-head'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { class: ['code-lang'] },
                children: [{ type: 'text', value: String(lang) }],
              },
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  class: ['code-copy'],
                  type: 'button',
                  'data-copy': '',
                  'aria-label': '复制代码',
                },
                children: [{ type: 'text', value: '复制' }],
              },
            ],
          },
          node,
        ],
      };

      parent.children[index] = wrapper;
    });
  };
}
