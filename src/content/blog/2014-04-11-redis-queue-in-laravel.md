---
title: "Laravel Redis 队列任务重复执行排查记：reserved 超时机制的源码解析"
date: 2014-04-11
category: "技术"
tags: ["Laravel"]
keywords: ["Laravel", "Redis", "Queue", "任务队列", "重复执行"]
description: "Laravel 的 Redis 队列总是出现任务多次执行，根因是框架写死了 60 秒的 reserved 超时：任务没跑完就被重新放回队列。本文从源码定位并给出解法"
---

> 利用 Redis 可以很方便地实现一个任务队列，但在 Laravel 中，Redis 队列总会出现**一个任务被多次执行**的问题。排查到最后的结论是：框架写死了 reserved 的时长——如果 60 秒后任务没有执行完成，它就会被重新放回队列。这篇记录当时的排查过程和源码依据，以及这背后的队列语义问题。

## 现象

任务队列跑得好好的，偶发地，同一个任务被执行了两次：邮件发两遍、消息推两次。没有任何报错日志，问题飘忽不定，只在任务执行时间较长的场景下出现。

## 配置与使用

Laravel 中启用 Redis 队列非常简单，在 `app/config/queue.php` 中配置：

```php
'default' => 'redis',

'connections' => array(
    'redis' => array(
        'driver' => 'redis',
        'queue'  => 'waa',
    ),
),
```

使用时写好任务类和它的 `fire` 方法，在需要的位置入队即可：

```php
class SendEmail {

    public function fire($job, $data)
    {
        // 执行任务逻辑
        $job->delete();
    }

}

Queue::push('SendEmail@send', array('message' => $message));
```

## 从源码定位根因

Laravel 利用 artisan 命令执行出队操作，调用链如下：

1. `artisan queue:work`
2. `WorkerCommand::fire()`
3. `Worker::pop()`
4. `Worker::getNextJob()`
5. `RedisQueue::pop()`
6. `Worker::process()`

问题就出在 `RedisQueue::pop()` 方法中，有这样一句：

```php
$this->redis->zadd($queue.':reserved', $this->getTime() + 60, $job);
```

出队时，当前任务并没有被真正删除，而是带着一个 **60 秒后到期**的时间戳，被放进另一个 `reserved` 有序集合。如果 60 秒内这个任务没有被删除（即 `$job->delete()` 没有被调用），到期后它会被重新放回主队列，被下一个 worker 再执行一次。

也就是说：**任务执行超过 60 秒，必然重复执行**。这不是 bug 触发条件苛刻的边界问题，而是框架「至少执行一次」设计的直接后果——它假设你会在 60 秒内完成并删除任务，否则就认为 worker 已经挂了，需要重试。

## 解决办法

我的做法是调整任务逻辑的顺序——**先删除任务，再执行任务**：

```php
class SendEmail {

    public function fire($job, $data)
    {
        $job->delete(); // 先删除，断掉 reserved 超时重投的路径
        // 然后执行任务逻辑
    }

}
```

先 `delete` 再执行，任务从 reserved 集合中移除，超时重投的路径被断掉，重复执行的问题消失。

## 隐藏的代价：队列语义的取舍

多年后回看，这个解法其实是一次**语义换安全**的取舍，值得说透：

- **先删后执行**（当时的解法）：任务最多执行一次（at-most-once）。代价是——如果进程在执行中途崩溃，任务就丢了，没有任何重试机会；
- **先执行后删**（框架默认）：任务至少执行一次（at-least-once）。代价是——超时或崩溃后任务重投，业务必须容忍重复执行。

框架默认选 at-least-once 是有道理的：**队列消费者的黄金法则之一是幂等**。如果任务本身设计成幂等的（发邮件前查一下是否已发过、写库用唯一键约束），重复执行无害，就不需要「先删后执行」这种危险补丁。

后来版本的 Laravel 也把写死的 60 秒变成了可配置项（`retry_after`），并要求它大于任务的最长执行时间，同时提供 failed-job 表持久化失败任务——本质上还是在这两种语义之间给开发者留选择权，但把参数交还给你了。

## 写在后面

这次排查最大的收获不是那个 `zadd`，而是想明白了队列设计里一个绕不开的问题：**「不丢」和「不重」在分布式环境下不可兼得**，任何队列系统都要你选一边，然后让业务为另一边兜底。后来用 Kafka、RocketMQ 时遇到的种种「诡异」行为，背后都是同一个问题。
