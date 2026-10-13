---
title: "Shell 运维命令速查手册：从文本搜索、进程管理到网络诊断"
date: 2014-01-15
category: "资源"
tags: ["Shell"]
keywords: ["Shell", "Linux", "命令行", "运维"]
description: "按场景分组的 Shell 命令速查：磁盘与目录、进程与内存、时间处理、后台任务、网络诊断与安全封禁，每条附一句话说明"
---

> 这篇是当年运维自己机器时积累的 Shell 命令速查，按「查东西、看资源、跑任务、修网络」四大场景分组。命令行工具的特点是一个个都简单，组合起来才有威力——但前提是你得在需要的那一秒想得起来。

## 文本与文件

### 文本内容搜索

```bash
grep aaa * # 在当前目录所有文件中搜索内容
```

### 文件与磁盘空间

```bash
du -h --max-depth=1 /home/ys # 查看目录下各子目录大小（人性化单位）
du -h --max-depth=1 .        # 当前目录版本
df -h                        # 查看所有磁盘分区使用情况
```

### 压缩与解压

```bash
tar zxvf aaa.tar.gz # 解压
tar zcvf aaa.tar.gz aaa # 打包压缩
```

## 时间处理

```bash
date                                # 当前时间
date +%s                            # 当前时间戳（秒）
date -d "2010-07-20 10:25:30" +%s   # 指定时间转时间戳
date -d "@1279592730"               # 时间戳转时间
date -d "1970-01-01 14781 days" "+%Y/%m/%d %H:%M:%S" # 纪元起算 N 天后的日期
```

`@时间戳` 这个语法最实用，日志里捞出一串毫秒/秒级时间戳时直接转人类可读格式。

## 进程与端口

### 查看端口占用

```bash
lsof -i:8087 # 查看占用 8087 端口的进程
lsof -i      # 查看本地网络服务活动状态
```

### 进程内存使用

```bash
top -d 1 -p pid [,pid ...] # 每秒刷新，监控指定进程
pmap pid                    # 查看进程内存映射
ps aux | grep process_name  # 按名称过滤进程
```

更底层的还有 `/proc/process_id/status` 文件，内核暴露的进程状态第一手信息。

### 批量杀死进程

```bash
ps -aux | grep name | grep -v grep | cut -c 9-15 | xargs kill -9
```

管道流水线：找到目标进程 → 过滤掉 grep 自身 → 截取 PID 列 → 交给 kill。第二个 `grep -v grep` 是关键，否则会误杀 grep 进程。

### 查看进程执行时长

```bash
ps -A -opid,stime,etime,args | grep python
```

`etime` 是存活时长，判断「进程是不是刚重启过」一眼便知。

### 系统版本

```bash
lsb_release -a # 发行版信息
uname -a       # 内核版本
```

## 后台任务

### 创建守护进程

```bash
nohup python /var/www/a.py & # 挂起运行，退出终端不中断
```

### screen 会话

```bash
screen -d -m -S some_name ping my_router # 后台建立会话执行命令，可随时接入查看
```

`screen` 比 `nohup` 多一层价值：任务跑在独立会话里，断线后能 `screen -r` 接回现场，长任务必备。

### 在远程机器上运行本地脚本

```bash
ssh user@server bash < /path/to/local/script.sh
```

 stdin 重定向的经典应用：**脚本不用先拷贝过去**，直接通过 SSH 管道喂给远端的 bash。

## 网络

### 诊断网络

```bash
mtr         # 结合 ping 与 traceroute，实时显示链路丢包
ping        # 连通性
traceroute  # 路由路径
dig         # DNS 解析
```

### 查看本机监听端口

```bash
netstat -tlnp # 监听中的 TCP 端口与对应进程
netstat -anop # 全部连接状态
```

### 查看外网 IP

```bash
curl ifconfig.me
```

### 端口扫描

```bash
nc -z -v -n 127.0.0.1 20-100 # 扫描 20-100 端口是否开放
```

### 下载整个网站

```bash
wget --random-wait -r -p -e robots=off -U mozilla http://www.example.com
```

`--random-wait` 随机间隔避免请求过密，仅用于离线存档自己有权限的内容。

### 负载测试

```bash
# 30 秒内向目标发起 20 个并发连接
siege -c20 www.example.com -b -t30s
```

## 安全

### 封禁一个 IP 的访问

```bash
iptables -I INPUT -s 211.1.0.0 -j DROP # 丢弃来自该 IP 的所有入站包
```

应急场景：发现异常扫描或爆破来源时先行封禁，再走正规治理流程。

## 一句话 HTTP 服务

```bash
python -m SimpleHTTPServer # 以当前目录为根启动 HTTP 服务
```

临时共享文件、快速预览静态页面的最快方式，无需任何配置。

## 写在后面

这些命令今天依然几乎全部可用，变化的主要是生态位：`netstat` 的新机器上推荐 `ss`，`SimpleHTTPServer` 在 Python 3 里是 `python -m http.server`，`iptables` 之外又有了 `nftables`。但速查表的编排逻辑不会过时——**按「我要解决什么问题」组织命令，而不是按字母序背手册**。
