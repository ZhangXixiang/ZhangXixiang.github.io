---
title: "JavaScript 常用代码片段速查：字符串、时间、编码与页面跳转"
date: 2014-01-15
category: "资源"
tags: ["JavaScript"]
keywords: ["JavaScript", "代码片段", "速查"]
description: "前端日常高频代码片段整理：字符串截取、页面跳转与刷新、加载时机、时间戳转换、URI 与 HTML 编码，每段附语义说明"
---

> 这篇是当年写前端时的代码片段速查，按问题域分组。片段虽小，坑不少：`substr` 和 `substring` 参数含义不同、`window.onload` 和 `$(document).ready()` 时机不同，这些细节值得逐条说清。

## 字符串截取

```javascript
str.substr(start [, length]) // 从指定位置开始，取指定长度
str.substring(start, end)    // 取 [start, end) 区间的子串
```

注意两者语义差异：`substr` 第二个参数是**长度**，`substring` 第二个参数是**结束下标**（不含）。此外 `substring` 会自动把参数中较小者作为起点，`substr` 的 `start` 支持负数（从尾部数），行为并不等价。

## 页面跳转

```javascript
window.location.href = "login.jsp?backurl=" + window.location.href; // 最常用，会留下历史记录
window.history.back(-1); // 回退一页
self.location = 'top.htm';  // 当前窗口跳转
top.location = 'xx.jsp';    // 整个窗口（跳出 iframe）跳转
```

## 加载完成的时机

```javascript
window.onload = function () { /* ... */ };
$(document).ready(function () { /* ... */ });
```

两者的区别是当年面试的高频题：

- `window.onload`：必须等页面内**包括图片在内的所有元素**加载完成才执行，且不能同时编写多个（后者覆盖前者）；
- `$(document).ready()`：**DOM 结构绘制完毕**即执行，图片可以还没加载完，可以编写多个。简写形式是 `$(function () {})`；
- `$(window).load()` 等同于 `window.onload`。

## 刷新页面

```javascript
history.go(0);
location.reload();
location = location;
location.assign(location);
location.replace(location); // 注意：replace 不留下历史记录
document.URL = location.href;
```

## JSON 转化与解析

```javascript
JSON.parse('{"a": 111, "b": "ccc"}'); // 标准解析
```

当年的项目里还能见到 `eval("(" + str + ")")` 这种解析写法，它对字符串内容不做任何校验，**执行任意代码**，存在注入风险，标准做法一律用 `JSON.parse`，解析失败会抛异常而不是执行代码。

## 时间转换

```javascript
// 当前时间戳（秒）
var day1 = parseInt(new Date().valueOf() / 1000);
// 时间戳转回 Date 再格式化
var day2 = new Date(day1 * 1000);
```

没有格式化库时的手写补零方案：

```javascript
var d = new Date();
var s = d.getFullYear() + "-";
s += ("0" + (d.getMonth() + 1)).slice(-2) + "-";
s += ("0" + d.getDate()).slice(-2) + " ";
s += ("0" + d.getHours()).slice(-2) + ":";
s += ("0" + d.getMinutes()).slice(-2) + ":";
s += ("0" + d.getSeconds()).slice(-2) + ".";
s += ("00" + d.getMilliseconds()).slice(-3);
```

技巧在 `("0" + x).slice(-2)`：先补零再从右取两位，实现个位数补零。注意 `getMonth()` 返回 0–11，要加 1。

## URI 编码转换

```javascript
var a = "':'";
var en = encodeURI(a);   // 编码
a = decodeURI(en);       // 解码
```

`encodeURI` 不转义 `&`、`?`、`=` 等保留字，适合编码整个 URL；编码单个参数值应该用 `encodeURIComponent`，否则参数里的 `&` 会破坏 URL 结构。

## HTML 编码转换

```javascript
function htmlEncode(value) {
  return $('<div/>').text(value).html();
}

function htmlDecode(value) {
  return $('<div/>').html(value).text();
}
```

借助 jQuery 对临时节点的 `text`/`html` 赋值差异完成转义，是当年防 XSS 输出的常用手段：用户输入进数据库前 encode，渲染时按需 decode。

## 写在后面

这些片段大多诞生于 jQuery 与 ES5 时代。如今 `substr` 已被标记为遗留 API（推荐 `slice`）、时间格式化交给 `Intl.DateTimeFormat` 或 `dayjs`、编码也有 `URLSearchParams`。但片段背后的知识点没有过时：**加载时机、编码边界、转义时机**，依然是前端面试和线上事故的高发区。
