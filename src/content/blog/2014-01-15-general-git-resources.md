---
title: "Git 日常操作手册：从建仓、回滚到分支管理的常用命令详解"
date: 2014-01-15
category: "资源"
tags: ["Git"]
keywords: ["Git", "版本控制", "命令"]
description: "一篇按场景组织的 Git 操作手册：建仓推送、历史与标签、回滚与暂存、分支合并、submodule 与常用配置，覆盖日常开发九成操作"
---

> 这篇是我把日常用到的 Git 操作按场景整理成的手册。Git 命令多而杂，死记硬背没有意义，按「我要做什么」来组织才好检索。建仓、回滚、分支、submodule、配置五大块，覆盖了当时日常开发的九成操作。

## 一、库管理

### 从零初始化一个库（以 GitHub 为例）

完整流程七步：

```bash
# 1. 首先在 GitHub 上创建一个远程仓库（Repositories）
# 2. 本地创建一个文件夹，通过 git init 使其成为本地仓库
git init
# 3. 在本地仓库目录下创建工程，将项目文件添加到本地仓库
git add .
# 4. 提交到本地仓库
git commit -m "init project"
# 5. 将本地仓库与远程仓库关联
git remote add origin https://github.com/person/demo.git
# 6. 同步远程仓库与本地仓库的内容
git pull --rebase origin master
# 7. 将本地仓库推送到远程
git push -u origin master
```

第 6 步的 `--rebase` 值得注意：首次关联时远程可能有 `README` 或 `LICENSE` 文件，直接 push 会被拒。用 `pull --rebase` 把远程提交拉到本地变基后再推，历史是一条直线，比默认的 merge 方式干净。

### 克隆库

```bash
git clone https://github.com/php/php-src.git
git clone --depth=1 https://github.com/php/php-src.git # 只抓取最近一次 commit
```

`--depth=1` 是浅克隆，只取最新快照不要历史。看大项目的源码时非常省时间——PHP 这种体量的仓库，完整克隆要拉全量历史，浅克隆只要几秒。

## 二、历史管理

### 查看历史

```bash
git log --pretty=oneline filename # 单行显示指定文件的提交历史
git show xxxx                     # 查看某次提交的完整改动
```

### 标签功能

```bash
git tag                            # 显示所有标签
git tag -l 'v1.4.2.*'              # 显示 1.4.2 开头的标签
git tag v1.3                       # 轻量标签
git tag -a v1.2 9fceb02            # 给历史提交补打标签
git tag -a v1.4 -m 'my version 1.4' # 带注释标签（-a 为 annotated 缩写）
git show v1.4                      # 查看某一标签详情
git push origin v1.5               # 推送某个标签到远程
git push origin --tags             # 推送所有标签
```

标签不会随 `git push` 自动上传，必须显式推送——这是很多人发版后疑惑「远程怎么没有 tag」的原因。

### 回滚操作

```bash
git reset 9fceb02        # 回到该提交，保留之后的修改在工作区
git reset 9fceb02 --hard # 回到该提交，丢弃之后的全部修改
```

`--hard` 不可恢复（未提交的修改没有历史可寻），执行前务必想清楚。

### 取消文件的修改

```bash
git checkout -- a.php # 取消单个文件的未暂存修改
git checkout --       # 取消所有文件的未暂存修改
```

### 删除与移动文件

```bash
git rm a.php             # 删除文件并纳入暂存
git rm --cached a.php    # 只删除暂存状态，保留本地文件（典型用途：把误提交的文件加入 .gitignore 后移出仓库）
git mv a.php ./test/a.php # 移动/改名，Git 会跟踪为 rename
```

### 查看文件修改

```bash
git diff          # 查看未暂存的文件更新
git diff --cached # 查看已暂存文件的更新
```

### 暂存和恢复当前工作现场

```bash
git stash                        # 暂存当前分支的修改
git stash apply                  # 恢复最近一次暂存
git stash list                   # 查看暂存列表
git stash apply stash@{2}        # 恢复指定的一次暂存
git stash drop stash@{0}         # 删除某次暂存
```

典型场景：开发到一半突然要切分支修线上问题，`stash` 把现场存起来，修完回来 `stash apply` 继续。

### 修改 commit 历史

```bash
git rebase -i 0580eab8 # 交互式变基，可合并（squash）、修改（reword）、删除提交
```

`rebase -i` 是整理提交历史的利器：把零碎的 WIP 提交合并成一条干净的 commit，或者改掉写错的提交信息。

## 三、分支管理

### 创建与切换分支

```bash
git branch develop              # 只创建分支
git checkout -b develop         # 创建并切换到 develop 分支
```

### 合并分支

```bash
git checkout master       # 切换到 master 分支
git merge --no-ff develop # 合并 develop，--no-ff 保留分支合并的记录
git rebase develop        # 把当前分支变基到 develop
git branch -d develop     # 删除 develop 分支
```

`--no-ff`（no fast-forward）是关键选项：默认的 fast-forward 合并会把两条分支的历史压成一条直线，看不出「这里曾经有一个功能分支」；`--no-ff` 强制生成一个合并提交，保留分支的存在痕迹，回溯历史时友好得多。

### 克隆与跟踪远程分支

```bash
git branch -r           # 显示所有远程分支
git checkout origin/android # 基于远程分支创建本地跟踪
```

### 修复 develop 上的合并错误

分支上合错了代码的补救流程：

1. 将 merge 前的 commit 建一个新分支，保留 merge 后的代码；
2. 将 develop `reset --force` 回 merge 前，然后 `push --force` 覆盖远程；
3. 在新分支中 rebase develop；
4. 将分支 push 到服务器上重新 merge。

### 强制把本地更新到与远程一致

```bash
git reset --hard origin/master # 本地状态完全对齐远程，丢弃所有本地差异
git submodule update --remote -f
```

## 四、Submodule 使用

### 直接克隆带 submodule 的库

```bash
git clone --recursive https://github.com/chaconinc/MainProject
```

### 先克隆主库，再处理 submodule

```bash
git clone https://github.com/chaconinc/MainProject
git submodule init    # 注册 .gitmodules 中声明的子模块
git submodule update  # 拉取子模块到记录的 commit
```

submodule 记录的是子仓库的**具体 commit 而非分支**，所以主仓库更新子模块后要重新提交一次主仓库，这是它最容易踩的坑。

## 五、Git 设置

Git 的全局设置在 `~/.gitconfig`，单仓库设置在 `project/.git/config`；全局忽略文件是 `~/.gitignore_global`，单仓库忽略文件是 `project/.gitignore`。

### 设置 commit 的用户和邮箱

```bash
git config user.name "xx"
git config user.email "xx@xx.com"
```

也可以直接编辑 config 文件：

```ini
[user]
    name = xxx
    email = xxx@xxx.com
```

### 查看与配色

```bash
git config --list # 查看所有生效的配置项

git config --global color.diff auto   # diff 着色
git config --global color.status auto # status 着色
git config --global color.branch auto # branch 着色
```

## 写在后面

多年后回看，这批命令里最常用的还是那几件：`stash` 救急、`reset --hard` 对齐远程、`rebase -i` 整理历史、`--no-ff` 保分支痕迹。新版 Git 把 `checkout` 的职责拆成了 `switch`（切分支）和 `restore`（还原文件），语义更清晰，但底层模型没有变——**把 commit、分支、暂存区三个概念想透，命令只是表达方式**。
