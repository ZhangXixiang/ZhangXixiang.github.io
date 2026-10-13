---
title: "J2EE 开发环境搭建清单：从 JDK、Maven 到 Tomcat、Zookeeper"
date: 2017-10-27
category: "技术"
tags: ["oracle"]
keywords: ["J2EE", "环境搭建", "JDK", "Maven", "Tomcat", "Zookeeper"]
description: "2017 年搭一套 Java Web 商城项目开发环境的八件套清单：JDK8、Maven、Git、IDEA、SecureCRT、SQLyog、Tomcat、Zookeeper，每件干什么用"
---

> Win10 配置 J2EE 开发环境的记录。当时搭这套环境的目的是一个大数据 + MySQL + 商城的学习项目，总共八件工具，按依赖顺序装完。清单不长，但每一件在整条开发链路上都有明确的位置——把它记成「干什么用的」而不是「怎么装的」，以后换机器重搭时照单抓药。

## 清单与用途

1. **JDK 8（安装版）+ 配置 Java 环境变量**：一切的基础。`JAVA_HOME`、`Path`、`CLASSPATH` 三件套，装完用 `java -version` 验证；
2. **Maven + 配置环境变量**：依赖管理与构建。配好 `MAVEN_HOME` 后顺手改 `settings.xml` 的本地仓库路径和镜像源，否则下依赖的速度会让人怀疑人生；
3. **Git**：版本控制，拉项目代码用；
4. **IDEA**：主力 IDE。Java 开发的标配，社区版够用，旗舰版全家桶；
5. **SecureCRT（CRT）**：SSH 终端，连接远程 Linux 服务器用；
6. **SQLyog**：图形化 MySQL 客户端，填数据库 IP、用户名、密码直连；
7. **Tomcat，集成到 IDEA**：Web 容器。在 IDEA 的 Application Servers 里配置 Tomcat 目录，之后调试就是点一下的事；
8. **Zookeeper + 连接测试**：分布式协调服务，为 dubbo 类 RPC 框架做注册中心。装完用 `zkCli.sh` 连一下，`ls /` 能出结果就算通。

## 为什么要记这样一份清单

环境搭建的特点是：**每一步都不难，但隔几个月重装时，你永远想不起来当时装了什么、按什么顺序装的**。尤其是 Zookeeper 这种「平时看不见、出问题时全家着急」的组件，装的时候不记录，半年后排查 Dubbo 连不上注册中心的问题就要从零开始。

这份清单后来换过两次机器，基本照抄一遍就能跑起来，只在 JDK 版本和镜像源地址上做过更新。

## 写在后面

2017 年的「J2EE 八件套」今天看已经换了不少：SecureCRT 换成了更现代的终端（iTerm2/Windows Terminal + SSH），SQLyog 的位置可以被 DataGrip/DBeaver 替代，Tomcat 在 Spring Boot 时代变成了内嵌组件，Zookeeper 也慢慢让位给 Nacos。但清单本身的逻辑没变：**运行时（JDK）→ 构建（Maven）→ 协作（Git）→ 开发（IDE + 终端 + 数据库客户端）→ 部署（容器）→ 注册中心**，任何时代的后端环境都逃不出这六层。
