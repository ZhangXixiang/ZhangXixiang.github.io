---
title: "jQuery 时代的插件与片段：下拉框、表单验证与 DOM 操作速查"
date: 2014-01-15
category: "资源"
tags: ["jQuery"]
keywords: ["jQuery", "插件", "表单验证", "DOM"]
description: "jQuery 时代的常用插件与代码片段整理：Select2 下拉扩展、form/validate 表单组合拳、父子节点选择与链式操作技巧"
---

> 这篇整理的是当年用 jQuery 时的插件选型和高频片段。jQuery 统治前端的年代，「找插件」就是前端开发的一半工作：下拉框找 Select2，表单验证找 validate，两个插件配合能覆盖大部分后台页面的需求。

## 官方资源

- [jQuery 官网](http://jquery.com/)
- [官方插件库](http://plugins.jquery.com/)

## 下拉框扩展

### Select2

- [Select2](http://ivaynberg.github.io/select2/)

功能强大的下拉列表插件，基本包含了所有可能的需求：搜索过滤、多选、远程数据源（AJAX 加载选项）、无限滚动、标签输入。原生 `<select>` 在它面前就是个纯文本框。

### OptionTree

- [OptionTree](http://kotowicz.net/jquery-option-tree/demo/demo.html)

联动下拉列表插件，可以动态生成级联下拉（省 → 市 → 区这类场景），而且支持 AJAX 获取下级数据。

## 常用代码片段

### 禁用 a 标签的跳转

```html
<a href="javascript:;">...</a>
```

```javascript
$().live('click', function (e) {
  e.preventDefault(); // 阻止默认行为
});
```

`e.preventDefault()` 比 `return false` 语义更明确：只阻止默认行为，不阻止事件冒泡。

### 清空 file input 的内容

出于安全原因，file input 的 value 是只读的，不能直接赋值清空。变通方案是克隆再替换：

```javascript
var cfile = $('#id').clone();
$('#id').replaceWith(cfile); // 用干净的克隆节点替换原节点
```

### jquery.form.js 配合 jquery.validate.js

这两个脚本搭配做表单验证和提交非常好用，顺便还兼容 Bootstrap 的表单结构：

```javascript
$("#page_form").validate({
  highlight: function (element) {
    $(element).closest('.control-group').removeClass('success').addClass('error');
  },
  success: function (element) {
    element.text('OK!').addClass('valid').closest('.control-group')
      .removeClass('error').addClass('success');
  },
  submitHandler: function (form) {
    $(form).ajaxSubmit(options); // 验证通过后由 form.js 以 AJAX 提交
  }
});
```

组合拳的分工很清晰：`validate` 负责校验和高亮提示，校验通过后回调 `submitHandler`，把表单交给 `form.js` 做 AJAX 提交，页面无刷新。

### 选择父节点

DOM 对象转 jQuery 对象用 `$(this)` 包装，然后向上找祖先：

```javascript
$(this).parents('tr'); // 当前元素所在的表格行
```

典型场景：行内「删除」按钮点击后，`$(this).parents('tr').remove()` 整行移除。

### 链式操作

因为 jQuery 函数返回的还是 jQuery 对象，操作可以直接链下去：

```javascript
$(this).parents('tr').remove();
```

一行完成「找祖先 → 删除」，这是 jQuery 设计哲学的核心——**每个方法都返回自己**，链式调用就是流水线。

## 写在后面

jQuery 生态已经完成了历史使命：`$(document)` 能做的事，如今标准 DOM API 加 fetch、以及 Vue/React 这类框架都做得更好；`parents()` 的活交给了 `closest()`。但回看这些片段仍有价值——**「找到节点 → 操作节点」的心智模型**，正是后来虚拟 DOM 和数据驱动视图要解决的那个问题本身。
