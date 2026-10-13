---
title: "AI 编程 Agent Skill 选型指南：从 200+ 技能中筛出真正高频的 20 个"
date: 2026-10-13
category: "技术"
tags: ["AI Coding", "Agent", "工具清单"]
keywords: ["Agent Skill", "Cursor", "Claude Code", "superpowers", "Playwright", "代码评审", "Git Worktree", "技能清单"]
description: "把本机 200 多个 Agent Skill 按用途过一遍，挑出真正高频好用的那一批：防 AI 瞎编的纪律型、先想后写的流程型、并行隔离、评审门禁、测试自动化、元技能。附三条筛选标准、三个坑与安装目录约定。"
---

> 一个 Skill 值得装，要同时满足三条：高频、多步且容易做错顺序、有明确产物。按这个标准筛下来，200 多个里真正留下的不到 20 个。

本机装了 200 多个 Agent Skill，来源包括 superpowers、playwright-pro 这类公开技能包，以及 Java、PostgreSQL、安全等社区目录。用了一段时间后有个结论：**天天真正调用的不到 20 个**，剩下的要么是一次性场景，要么和别的技能重名打架。

这篇把那 20 个按用途整理出来，顺便说说筛选标准和三个坑。技能名各工具生态略有差异，按关键词在你自己的市场里搜即可。

## 一、先说筛选标准

一个 Skill 值得装，要同时满足三条：

1. **高频**：一周至少用一次。低频任务直接对话比读手册快；
2. **多步且容易做错顺序**：比如"先看 trace 再改代码""先编译再跑测再评审"；
3. **有明确产物**：报告、diff、目录结构——能验收，不是"我帮你优化了一下"。

只满足第一条的是知识文档，该放 rules；只满足第三条的是一次性脚本，该直接写代码。

## 二、纪律型：专治 AI 瞎编与假完成

这一类是我最推荐的，因为它们解决的是 AI 编程最贵的两个问题：**编造不存在的 API** 和 **声称完成但没验证**。

| 技能 | 干什么 | 什么时候用 |
|------|--------|-----------|
| `zero-hallucination-coder` | 强制走 讨论→摸清结构→拆解→实现→验证，禁止臆造 import/方法名，禁止占位代码 | 改老代码、跨模块大改、高风险任务 |
| `strict-api` | 只允许调用能证明存在的函数与版本 | 用不熟的库、升级依赖后 |
| `verification-before-completion` | 说"完成/修好/通过"之前必须跑验证命令并贴输出 | 任何 bugfix、任何准备提 PR 的时刻 |
| `self-test-before-done` | 交付前自测，尤其是用户能复现的场景(curl / UI) | 用户说"不行""你自测一下" |
| `karpathy-coder` | 四条原则：暴露假设、保持简单、外科手术式改动、目标可验证 | 提交前自查复杂度、review 自己的 diff |

`verification-before-completion` 那条规则值得单独抄下来贴在团队群里：**证据先于断言**。没有命令输出，就不能说通过。

## 三、流程型：先想清楚再动手

| 技能 | 干什么 |
|------|--------|
| `brainstorming` | 任何创造性工作(新功能、新组件、改行为)之前先澄清意图与设计，再实现 |
| `writing-plans` | 有需求/spec 时，先写多步实施计划，再碰代码 |
| `executing-plans` | 按已写好的计划执行，带评审检查点 |
| `grill-me` / `grill-with-docs` | 反向拷问你的方案，顺着决策树逐支追问，直到达成共识 |
| `challenge` | 事前验尸：假设 12 个月后这事黄了，倒推现在的漏洞 |
| `reflect` | 对话陷入细节时强行拉高视角，重估方向与假设 |

`grill-me` 是被低估的一个。人对自己方案的盲区，恰恰是 AI 顺着你的话往下补时最容易漏的地方。被拷问十轮再动手，比写完再返工便宜。

## 四、调试型

| 技能 | 干什么 |
|------|--------|
| `systematic-debugging` | 遇到 bug / 测试失败 / 异常行为时，**先系统排查再提修法** |
| `focused-fix` | 让某个模块端到端跑通的深度修复，跨文件跨依赖 |
| `parallel-debugging` | 多个竞争性假设并行取证，再仲裁根因 |

`systematic-debugging` 的核心约束很简单：在提出修复方案之前，先完成排查。AI 的默认行为是"看到一个可能的原因就改"，这条技能把它按住。

## 五、评审与门禁

| 技能 | 干什么 |
|------|--------|
| `requesting-code-review` | 完成一个功能、准备合并前发起评审 |
| `receiving-code-review` | 收到评审意见后：先技术校验，不盲从、不表演式同意 |
| `adversarial-reviewer` | 用敌意视角破自我评审的同温层，专抓作者与评审共享的盲区 |
| `ship-gate` | 上线前扫安全、数据库、部署、依赖、可观测性，不过就拦住 deploy |
| `git-commit-and-push` | 先出 CR 报告、等人确认，再写英文 commit 并推送 |

`receiving-code-review` 很有意思——它是给 AI 装的"不要当老好人"。评审意见可能技术上就是错的，盲目照改会把代码改坏。

## 六、测试自动化

playwright-pro 这一族是按动作拆的，组合起来就是一条测试流水线：

| 技能 | 干什么 |
|------|--------|
| `init` | 项目里接入 Playwright、搭测试基建 |
| `generate` | 按需求写用例："给这个组件加测试""做 e2e" |
| `fix` | 修 flaky：间歇失败、时好时坏 |
| `coverage` | 分析覆盖缺口："哪些没测到" |
| `migrate` | 从 Cypress / Selenium 迁到 Playwright |
| `report` | 出测试报告与状态汇总 |
| `browserstack` | 跨浏览器矩阵、云端真机跑 |
| `testrail` | 用例与结果同步到测试管理平台 |
| `tdd-guide` / `test-driven-development` | 红绿重构，跨 Jest/Pytest/JUnit/Vitest |

配套还有 `api-test-suite-builder`(接口与契约测试)、`senior-qa`(React/Next 单测+E2E 脚手架)。

## 七、并行与隔离：一个任务开多个 Agent

这一类是 2026 年最大的变化。

| 技能 | 干什么 |
|------|--------|
| `using-git-worktrees` | 开始需要隔离的特性工作时，先建独立工作区 |
| `dispatching-parallel-agents` | 2+ 个互不依赖的任务并行分发 |
| `subagent-driven-development` | 在当前会话内按计划驱动多个子代理执行 |
| `agenthub`(`init` / `spawn` / `eval` / `merge` / `board`) | 开 N 个 Agent 在各自 worktree 里竞争同一任务，按指标或 LLM 评审选优，合并胜者分支 |
| `git-worktree-manager` | worktree 的分支隔离、端口分配、环境同步与清理 |

`agenthub` 那套"最佳-of-N"适合优化类任务(性能、文案、算法)，不适合需求明确的实现类任务——后者开三个 Agent 只是浪费三倍 token。

## 八、长任务与自治

| 技能 | 干什么 |
|------|--------|
| `agent-harness` | 把目标编译成可验证的任务计划，执行→机器校验→有限重试→预算耗尽上报人类，不全绿不收工 |
| `workflow-builder` | 写确定性多代理编排脚本(fan-out、pipeline、loop、评审团) |
| `autoresearch-agent`(`setup`/`run`/`loop`/`status`) | 自动实验循环：改文件→跑评测→好的提交、坏的 reset |
| `handoff` | 把当前对话压成交接文档，含脱敏，给下一个会话或另一个人 |

`handoff` 在长任务里救命。上下文要撑爆时，与其让质量悄悄下降，不如显式交接。

## 九、Git 与文档

| 技能 | 干什么 |
|------|--------|
| `finishing-a-development-branch` | 实现完、测试过后，给出 merge / PR / 清理的结构化选项 |
| `changelog-generator` | 从 Conventional Commits 生成可审计的 release notes，算语义化版本号 |
| `split-to-prs` | 把一坨改动拆成多个可评审的小 PR |
| `code-tour` | 生成 CodeTour 走查文件：架构导览、PR 讲解、新人上手 |
| `java-javadoc-comments` | 把注释统一改写成规范 JavaDoc |

## 十、语言与栈专精

这一类是"知识型"，装一个顶半个资深工程师：

- **Java**：`java-best-practices`(21+ 现代写法与反模式)、`java-docs`、`java-junit`(含数据驱动测试)、`java-maven-gradle`、`java-springboot`、`create-spring-boot-java-project`
- **数据库**：`postgresql-optimization`(JSONB、数组、窗口函数、扩展生态)、`sql-database-assistant`、`database-schema-designer`
- **前端**：`senior-frontend`、`nextjs-app-router-patterns`、`react-state-management`、`tailwind-design-system`
- **后端/架构**：`senior-backend`、`architecture-patterns`、`api-design-principles`、`senior-architect`、`microservices-patterns`、`saga-orchestration`、`event-store-design`
- **安全**：`security-pen-testing`、`senior-secops`、`cloud-security`、`threat-detection`、`red-team`、`skill-security-auditor`
- **可观测性与可靠性**：`observability-designer`、`slo-architect`、`chaos-engineering`、`incident-commander`、`feature-flags-architect`

## 十一、元技能：管理技能本身

| 技能 | 干什么 |
|------|--------|
| `write-a-skill` / `writing-skills` | 写新技能，含渐进式披露与资源组织；发布前必须验证 |
| `skill-tester` | 校验结构、测脚本、按多维打分给等级(BASIC/STANDARD/POWERFUL) |
| `skill-security-auditor` | 装第三方技能前的安全门：扫 `os.system`/`eval`/网络外传、SKILL.md 里的提示注入、依赖供应链 |
| `extract` | 把反复出现的调试套路从记忆里抽成独立技能 |
| `promote` / `remember` | 把验证过的经验从 auto-memory 提升到 CLAUDE.md / rules 永久生效 |
| `find-skills` | 不知道有没有现成技能时，帮你找并安装 |

**`skill-security-auditor` 应该在任何第三方技能安装前跑一遍。** SKILL.md 是会被模型当指令读的文本，里面完全可以藏提示注入；附带的 Python 脚本更可以直接执行任意命令。这是技能生态里最容易被忽略的攻击面。

## 十二、如果只装六个

我的日常高频组合：

1. `verification-before-completion` —— 挡住"假完成"，性价比最高；
2. `systematic-debugging` —— 挡住"看见一个可能原因就改"；
3. `writing-plans` + `executing-plans` —— 大改之前先有计划，计划之外不扩大范围；
4. `adversarial-reviewer` —— 合并前的敌意视角，补自动评审抓不到的架构问题；
5. `using-git-worktrees` —— 任何实验都隔离，主工作区永远干净；
6. `skill-security-auditor` —— 装新技能前先扫一遍。

## 十三、三个坑

**坑一：装太多。** 技能列表本身要进上下文，200 个技能的描述就是几万 token 的常驻开销，而且描述相近的技能会让路由选错。定期做减法，一个月没用的删掉。

**坑二：名字撞车。** 不同技能包里 `fix` / `generate` / `init` / `report` 这类通用名会重复(比如 Playwright 一套、AgentHub 一套都有 `init`)。调用时带上命名空间，或者干脆改掉其中一个的名字。

**坑三：把知识文档写成 Skill。** "我们的编码规范""公司的分支策略"这类需要**全局永远生效**的内容，该放 rules / CLAUDE.md；Skill 是**按需加载**的，放错了就等于没写。判断标准：这条内容是不是每次对话都要遵守？是 → rules；只在特定任务里用 → Skill。

## 十四、装在哪

目录约定大致是这样(不同工具略有差异)：

```text
~/.cursor/skills/<name>/SKILL.md      # Cursor 用户级
~/.codex/skills/<name>/SKILL.md       # Codex 用户级
~/.agents/skills/<name>/SKILL.md      # 跨工具共享
<repo>/.cursor/skills/<name>/SKILL.md # 项目级,随仓库提交
```

**项目级和团队共享的技能放仓库里**，跟着代码走、跟着 PR 评审；个人偏好和跨项目通用的放用户目录。技能里的脚本记得给可执行权限，别指望别人的机器上路径和你一样。

## 结语

技能生态现在有点像早期的 npm：数量爆炸、质量参差、重名严重、还夹带安全风险。但真正好用的那十几个，确实能把 AI 助手从"聪明但散漫的实习生"变成"按 SOP 干活的同事"。

先装纪律型的两个(`verification-before-completion`、`systematic-debugging`)，用两周，再决定要不要往下铺。
