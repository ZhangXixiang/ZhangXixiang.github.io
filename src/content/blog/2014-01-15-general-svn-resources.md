---
title: "SVN 常用命令详解：从 checkout、冲突处理到仓库地址迁移"
date: 2014-01-15
category: "资源"
tags: ["SVN"]
keywords: ["SVN", "版本控制", "命令"]
description: "SVN 日常操作全景手册：检出提交、加锁解锁、版本回退、冲突处理、diff 与 merge，以及仓库 URL 变更时的 switch --relocate"
---

> 这篇整理的是 SVN 的常用命令。虽然版本控制的主流早已是 Git，但当时大量企业内部仓库仍是 SVN，两套工具长期并存。SVN 的命令不算少，而且有几个概念（冲突处理、URL 迁移）和 Git 差异很大，值得单独记一份。

## 检出与提交

### 将文件 checkout 到本地目录

```bash
svn checkout svn://192.168.1.1/pro/domain # 检出远程目录
svn co # checkout 的简写
```

### 往版本库中添加新文件

```bash
svn add test.php          # 添加单个文件
svn add *.php             # 添加当前目录下所有 php 文件
svn add *.php --force     # 强制添加所有匹配文件（含已忽略规则的）
```

SVN 没有类似 Git 的「自动跟踪新文件」机制，**新建的文件必须显式 `add`** 才会被纳入版本控制，这是从 Git 切回 SVN 最容易忘的一步。

### 将改动的文件提交到版本库

```bash
svn commit -m "add test file for my test" test.php # 提交指定文件
svn ci # commit 的简写
```

### 加锁/解锁

```bash
svn lock -m "lock test file" test.php # 加锁
svn unlock PATH                        # 解锁
```

SVN 的锁是 pessimistic locking（悲观锁）：加锁后他人不能修改，适合二进制文件（图片、Office 文档）这类无法合并的内容。

## 更新与状态

### 更新到某个版本

```bash
svn update                # 更新当前目录及子目录到最新版本
svn update -r 200 test.php # 将文件还原到版本 200
svn up # update 的简写
```

提交时若提示过期（expired），说明本地副本落后且存在冲突，处理顺序是：**先 `update`，修改冲突文件，执行 `svn resolved` 清除冲突标记，最后再 `commit`**。

### 查看文件或目录状态

```bash
svn status path # 查看状态（正常状态不显示）
svn st          # 简写
```

状态标记的含义：

- `?`：不在 SVN 的控制中
- `M`：内容被修改
- `C`：发生冲突
- `A`：预定加入到版本库
- `K`：被锁定

```bash
svn status -v path # 显示详细信息
```

第一列含义同上，第二列显示工作版本号，第三、四列显示最后一次修改的版本号和修改人。

值得一提的是：`svn status`、`svn diff` 和 `svn revert` 这三条命令**在没有网络的情况下也可以执行**——SVN 在本地的 `.svn` 目录中保留了本地版本的原始拷贝。

## 历史、对比与合并

### 查看日志

```bash
svn log path       # 目录的修改记录
svn log test.php   # 文件的全部修改记录及版本号变化
```

### 查看文件详细信息

```bash
svn info test.php
```

### 比较差异

```bash
svn diff test.php           # 修改的文件与基础版本比较
svn diff -r 200:201 test.php # 版本 200 与 201 之间的差异
svn di # 简写
```

### 将两个版本之间的差异合并到当前文件

```bash
svn merge -r 200:205 test.php
```

把版本 200 到 205 之间的差异合并进当前文件——这是 SVN 里「反向打补丁」的常用手段，一般会产生冲突，合并后需要手工处理。

### 恢复本地修改

```bash
svn revert PATH
```

恢复到原始未改变的工作副本（撤销大部分本地修改）。注意它不访问网络，也能解除冲突状态，但**不会恢复被删除的目录**。

## 删除、移动与目录

### 删除文件

```bash
svn delete test.php # 然后再 svn ci -m 'delete test file'
```

推荐「先本地 delete、再统一 commit」的方式，删除动作和其他改动一起原子提交。

### 创建纳入版本控制的新目录

```bash
svn mkdir PATH # 工作副本内创建，加入新增调度，待下次提交
svn mkdir URL  # 直接在仓库中创建（立即提交，中间目录必须已存在）
```

### 版本库文件列表

```bash
svn list path # 不检出的情况下查看仓库内容
svn ls
```

### 输出指定版本的内容

```bash
svn cat -r PREV filename > filename # PREV 是上一版本，输出可直接提交
```

## 冲突处理

### 解决冲突

```bash
svn resolved PATH
```

注意这个命令**只是移除冲突的相关文件、清除冲突状态**，让 PATH 可以再次提交；它不会按语法解决冲突，冲突标记要自己手工改掉。

## 仓库地址迁移

### 代码库 URL 变更

```bash
svn switch URL [PATH]              # 切换到同一仓库的另一分支/标记
svn switch --relocate FROM TO [PATH] # 仓库根 URL 变动时改写本地元数据
```

两者的用途要分清：

- `switch URL`：更新工作副本到**同一仓库的不同路径**（分支或标记），行为类似 update，会把服务器文件与本地文件合并；
- `switch --relocate FROM TO`：仓库**地址本身变了**（域名、协议或端口变更，但仍是同一仓库同一目录），用它改写工作副本的 URL 元数据即可，不必重新 checkout。

## 帮助

```bash
svn help     # 全部子命令
svn help ci  # 单个命令的详细用法
```

## 写在后面

SVN 与 Git 最根本的差别是模型：SVN 是**集中式**（中央仓库是唯一真源，本地只是工作副本），Git 是**分布式**（每个克隆都是完整仓库）。落到体验上：SVN 提交必须联网、历史操作慢、分支是目录拷贝；Git 全部本地操作、分支是指针。今天仍会遇到 SVN 的场景多是遗留系统和企业内网，但这套命令里最有生命力的思想是**原子提交**——一次提交对应一个完整变更，这一点 Git 完整继承了下来。
