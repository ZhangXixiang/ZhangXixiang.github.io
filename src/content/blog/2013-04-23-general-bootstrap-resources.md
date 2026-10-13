---
title: "前端不熟也能做出体面页面：Bootstrap 组件扩充清单"
date: 2013-04-23
category: "资源"
tags: ["Bootstrap"]
keywords: ["Bootstrap", "前端", "组件", "Font Awesome"]
description: "后端开发者视角的 Bootstrap 组件扩充清单：字体图标、多选下拉、表单扩展，每件解决一个具体的轮子问题"
---

> 写这篇文章的时候，我的主力方向是后端，前端全靠 Bootstrap 撑门面。对和我一样「前端不太行」的 WEB 开发者来说，与其自己造轮子，不如知道去哪里找轮子。这篇清单就是当时的答案，每件解决一个具体问题。

## 为什么要整理这样一份清单

Bootstrap 的价值在于它把「不会前端」和「做不出体面页面」这两件事解耦了。但官方组件只覆盖最基础的场景，真实项目里稍微复杂一点的需求——多选下拉、日期时间选择、更丰富的图标——都得另找插件。

找插件本身是个技术活：要判断插件是否和当前 Bootstrap 版本兼容、维护是否活跃、样式风格是否统一。这份清单的标准很简单：**我实际用过、且和 Bootstrap 风格不冲突**。

## 官方资源

- [Bootstrap 官网](http://twitter.github.io/bootstrap/)

文档本身是最好的教科书。当时还是 Bootstrap 2 时代，组件文档一页读完，基本就能应付日常后台页面。

## 字体图标：Font Awesome

- [Font Awesome](http://fortawesome.github.io/Font-Awesome/)

Bootstrap 自带的图标只有十几个黑白色的小图标，远远不够用。Font Awesome 用 CSS 字体的方式实现了大量常用图标，优势很明显：

- **矢量缩放**：跟着字体大小走，任意缩放不糊；
- **视网膜屏友好**：因为是字体而非位图，Retina 屏幕上依然锐利；
- **零图片请求**：不产生额外的 HTTP 请求，对加载速度友好。

当时的遗憾是部分国产手机浏览器（我测试过 UC）渲染有问题。解决方案通常是降级为图片图标，或干脆在移动端隐藏装饰性图标。

## 多选下拉：Bootstrap Multiselect

- [Bootstrap Multiselect](http://davidstutz.github.io/bootstrap-multiselect/)

原生 `<select multiple>` 的多选体验非常糟糕：要按住 Ctrl 才能多选，普通用户根本不知道。这个插件把多选下拉变成带复选框的列表，还支持全选、筛选和分组，是后台管理系统的刚需。

## 表单扩展：Bootstrap Form Helpers

- [Bootstrap Form Helpers](http://vincentlamanna.com/BootstrapFormHelpers/index.html)

日期选择、时间选择、国家/州省联动这些表单功能，几乎每个后台项目都会遇到。Bootstrap Form Helpers 按 Bootstrap 的标记风格封装了这一类组件，引入之后不用自己写样式就能和整体风格保持一致。

## 写在后面

多年后回看，这份清单里的大部分场景已经有了新的答案：Font Awesome 依然活跃且长成了独立的图标体系；多选下拉的选择也更丰富。但「后端开发者如何用最小成本做出体面页面」这个问题的解法没有变——**用成熟的组件库，别自己写 CSS**。
