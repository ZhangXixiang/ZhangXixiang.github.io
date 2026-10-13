---
title: "64 张空闲 GPU 为何跑不起 64 卡任务：AI 算力调度的 Gang Scheduling 与拓扑感知"
date: 2026-10-13
category: "技术"
tags: ["Kubernetes", "AI Infra", "GPU"]
keywords: ["GPU 调度", "Gang Scheduling", "拓扑感知", "Volcano", "DRA", "NVL72"]
description: "空闲卡数不等于可用算力域。从 Gang Scheduling 到拓扑感知，拆解 AI 算力调度与普通 K8s 调度的五点本质差异，以及 Volcano、Kueue、DRA、Slurm topology 各自的解法。"
---

> 空闲卡数不等于可用算力域。这篇拆解 AI 算力调度与普通 K8s 调度的五点本质差异，以及 Volcano、Kueue、DRA、Slurm topology 各自的解法。

集群监控大屏上明明白白写着：空闲 GPU 64 张。

你提交一个 64 卡的训练任务，调度器告诉你：排不上。

这不是 bug，这是 AI 算力调度最核心的一个事实：**空闲卡数 ≠ 可用算力域**。64 张卡如果分散在两个 72 卡的 NVLink 互联域里，跨域做 AllReduce 的性能会掉一个台阶，这个任务宁可不用这 64 张卡。

理解这一点，就理解了"智算中心调度"这个方向到底在做什么。

## 一、AI 调度和微服务调度，根本不是一回事

普通互联网业务跑在 K8s 上，有几个默认前提：单 Pod 崩溃自己重启、互相独立；资源维度主要是 CPU/内存；水平扩缩，碎片化放置没问题。所以 kube-scheduler 的 filter + score 两阶段就够用了。

AI 训练/推理任务把这些前提全部打破：

| 维度 | 普通微服务 | AI 训练/推理 |
|---|---|---|
| 任务粒度 | 单 Pod 独立 | 一个任务要几十到几千张卡**同时就位** |
| 部分启动 | 可以 | 不行。1000 卡任务只起来 999 卡 = 整体死锁，还占着卡不放 |
| 资源维度 | CPU/内存 | 卡数、显存、HBM、卡间互联拓扑、NUMA、NIC 位置 |
| 通信模式 | 少量 RPC | AllReduce / All-to-All 大流量集合通信，放置位置直接影响 10%+ 性能 |
| 占用时长 | 常驻 | 训练几天到几周，排队是常态 |
| 故障影响 | 单实例 | 单卡故障拖垮整个千卡任务 |

于是 AI 调度要解决的问题变成五件：

1. **成组调度(Gang Scheduling)**：要么全部就位，要么一个都不起；
2. **拓扑感知(Topology-Aware)**：把通信密集的一组卡放进同一个高速互联域，而不是随机撒；
3. **碎片治理**：防止集群被切碎，导致大任务永远排不上；
4. **队列/配额/优先级**：多团队共享万卡集群时的公平与利用率；
5. **故障快恢**：万卡集群每天必有硬件故障，恢复速度 = 有效训练时长。

一句话：**kube-scheduler 回答"这个 Pod 放哪个节点"；AI 调度器回答"这个带通信约束的成组任务，放哪个性能域，怎么排队，怎么防碎片，怎么抢占，坏了怎么恢复"。**

## 二、调度策略是被硬件拓扑决定的

不懂硬件就没法懂调度。三层拓扑，一层比一层贵。

### 节点内：NUMA 与 NVLink

一台典型 8 卡服务器( NVIDIA HGX H100/B200，或华为 Atlas 800 这一类)：

- 2 颗 CPU，NUMA 结构，GPU 和 NIC 各归属某个 NUMA 节点；
- 8 张 GPU 通过 NVSwitch/NVLink 全互联(H100 单链路 900GB/s)；昇腾侧对应 HCCS；
- 8 张 400G NIC 负责跨机通信，每张 NIC 和某几张 GPU 同在某个 PCIe Switch / NUMA 下。

调度含义很直接：同一个 Pod 里的 8 卡，进程要绑 NUMA、要做 GPU 与 NIC 亲和。数据加载线程绑错 NUMA，吞吐掉 10–30% 是常事。

### 集群：交换机树

fat-tree / spine-leaf 结构下，同一 Leaf 下的服务器通信带宽最高、延迟最低，跨 Spine、跨 Core 逐级劣化。RoCE 网络常用 ECMP 做负载均衡，大流量集合通信可能因为**哈希碰撞**让某条链路拥塞——很多简历里写的"规避 ECMP 哈希碰撞"，说的就是这件事。

### 超节点：Scale-up 域成为第一公民

2024 年起机架级超节点成为主流：

- **GB200/GB300 NVL72**：一个机架 72 张 GPU 通过 NVLink 全互联成一个域，域内 130TB/s 级总带宽，跨机架才走 IB/RoCE；
- **Atlas 900 A3 超节点**：384 张 NPU 通过 UnifiedBus 全互联，单卡约 400GB/s、延迟 <200ns；跨超节点走 RoCE，约 50GB/s、μs 级——**域内外带宽差约 8 倍**。

这就是开头那个问题的答案：调度器必须知道"哪些卡构成一个完整的 Scale-up 域"，并把通信最重的并行组约束在域内。

### 并行方式对调度的硬约束

| 并行方式 | 通信特点 | 对调度的要求 |
|---|---|---|
| TP 张量并行 | 每层两次 AllReduce，量最大最频繁 | 必须落在**同一机内 / 同一超节点 / 最低层级域** |
| PP 流水线并行 | 点对点，量小 | 相邻 rank 靠近即可，可跨机 |
| DP 数据并行 | 周期性大块 AllReduce | 就近优先级低于 TP |
| EP 专家并行(MoE) | 大量 All-to-All | 建议同高速域或高吞吐网络 |
| ZeRO/FSDP | 类似 DP + 分块广播 | 与 DP 类似 |

Llama 一类模型的经典摆法：TP=8 吃满单机 NVLink，PP × DP 跨机。**TP 组一旦跨了交换机，训练速度直接受损**——这就是拓扑感知调度存在的根本原因。

## 三、第一层：让 K8s "看见" GPU

K8s 本体不认识 GPU。业界有四代方案。

**Extended Resource + Device Plugin(当前生产主流)。** NVIDIA k8s-device-plugin(或 GPU Operator 一键装齐驱动、container-toolkit、device-plugin、DCGM exporter、DRA driver)以 gRPC 向 kubelet 注册 `nvidia.com/gpu`，Pod 里写 `limits: nvidia.com/gpu: 8` 即可。昇腾、摩尔线程、沐曦、海光 DCU 基本都照这个模式实现自己的 device-plugin。局限也清楚：整卡整数粒度、拓扑信息不上报、不支持显存切分，scheduler 只会"数数"。

**MIG(硬件切分)。** A100/H100/B200 等可把一张卡切成最多 7 个硬件隔离实例，各自独立显存/SM/L2。真隔离、故障不互染，是多租户推理的首选；代价是 profile 静态，变更要求卡上无负载。

**Time-Slicing / MPS / vGPU(软件切分)。** time-slicing 把一张卡暴露成 N 份、零隔离，只适合开发测试；MPS 允许多进程并发共享，故障可能传染；真正生产可用的是 HAMi(开源，国产环境用得多)、趋动 VirtAI、NVIDIA vGPU 这一类：自研 device-plugin + scheduler 扩展，支持"显存配额 + 算力百分比"申请。

**DRA(Dynamic Resource Allocation，K8s 原生新标准)。** 1.26 引入、1.32 beta、1.35 GA。新增 `ResourceSlice`(驱动上报设备清单与属性，含拓扑关系)、`ResourceClaim`(声明式要设备)、`DeviceClass`(厂商模板)。Pod 不再写整数，而是声明"要一张显存 ≥20GB、支持 MIG 1g.5gb、且与我的 NIC 同 PCIe 域的 GPU"。NVIDIA 官方 k8s-dra-driver 已经支持整卡/MIG/时间片，以及把整个 NVLink 域建模成可申请资源的 **ComputeDomain**——直接服务 NVL72 场景。

工程口径的选型建议：生产训练用整卡 device-plugin；多租户推理用 MIG 或 vGPU；新集群可以试点 DRA，尤其是要管理超节点域的场景。

## 四、第二层：调度器

### kube-scheduler 为什么不够

没有 gang scheduling：Job 控制器逐个建 Pod，先到的 Pod 占着卡等后面的卡，死锁加浪费；没有队列/配额/公平性语义(ResourceQuota 太粗)；没有拓扑感知(只看节点剩余数量，不看卡在哪个交换机下)；没有成组抢占。

### Volcano：国内 AI on K8s 的事实标准

CNCF 孵化项目，面向批调度/AI/HPC。核心对象三个：

- **VCJob**：AI 任务 CRD，一个 Job 内多个 taskset(1 个 launcher + N 个 worker)；
- **PodGroup**：把一组 Pod 标记为一个调度单元，`minMember` 就是 gang 门槛；
- **Queue**：层级队列 + 配额 + 优先级。

它的调度框架是 **Action × Plugin 正交组合**：Action 是 enqueue → allocate → backfill → preempt → reclaim 这条流水线，Plugin 是 gang、proportion、binpack、nodeorder、numaaware、networktopologyaware 这些可插拔能力。插件化是它的生命线。

### Kueue：管"什么时候允许开始跑"

K8s 官方 SIG 项目，不替代 scheduler，而是在它之上做任务级排队：ClusterQueue(配额池)/ LocalQueue(用户入口)/ Cohort(配额借用联盟)。和 Volcano 是互补关系——Kueue 管配额与准入排队，Volcano 管成组、节点选择与拓扑。**MultiKueue** 还能把 Job 远程派发到其他集群，是多集群调度的基础。

国内常见组合：Volcano(单集群成组 + 拓扑)+ Kueue 或 Volcano Queue(配额排队)+ 自研门户。

## 五、Gang Scheduling：AI 调度的基石

问题场景：PyTorch DDP 任务 1000 个 worker，每个都要等全员到齐进 barrier。调度器只起了 600 个，这 600 个占着卡干等，后面的任务也进不来——集群利用率塌方。

Volcano 的做法：

1. VCJob 创建时自动生成 PodGroup，`spec.minMember = N`；
2. `enqueue` 阶段 gang 插件先判断：集群当前**可用**资源是否 ≥ N？不够则整个 PodGroup 留在队列，不真正占卡；
3. `allocate` 阶段若分配到一半资源不足，严格模式下释放已分配的回滚等待；
4. 抢占时保证公平并最小化浪费。

几个生产细节值得记住：

- `minMember` 设小于总副本数 = "宽松 gang"，允许部分启动，适合弹性训练或推理；
- 万卡任务判定"够不够"本身就是一个分布式事务，Volcano 用 session 快照 + 单主调度器实现——这也是调度器单点性能瓶颈的来源之一；
- 训练框架侧配合(torchrun elastic、checkpoint 续训)才能让"放宽 gang"成为可能。

## 六、拓扑感知：核心中的核心

分三级：节点内(NUMA/PCIe)→ 卡间互联域(Scale-up 域)→ 网络(交换机层级)。最有代表性的是 Volcano 的 **HyperNode** 设计。

**HyperNode CRD** 表达一个"网络性能域"(通常对应一台交换机或一个 ToR)，多个 HyperNode 按 `tier` 组成树：leaf 的成员是真实 Node，非 leaf 的成员是子 HyperNode。tier 越小域内通信效率越高。相比给节点打 label 的方式，它语义统一、天然层级、调试直观，而且调度器之外的组件(网络管控、运维平台)能消费同一份拓扑。拓扑由 controller 周期从 IB 网管(UFM)/RoCE 网管/节点标签同步，自动增删改。

任务侧这样声明约束：

```yaml
spec:
  networkTopology:
    mode: hard            # hard=必须落在同一 HyperNode;soft=尽量
    highestTierAllowed: 2 # 最高允许 tier2 的域
```

调度算法从低 tier 到高 tier 分层搜索：先试 tier1 域能否容纳整个任务，不行升 tier2；同梯度多个可行域时打分，tier 低者优、同 tier 时"已放了本任务更多 Pod 的域"优(装箱倾向，减少跨域)。更细一层，它支持 Job 级与 SubJob 级分别约束——**TP 组落最低层域(NVLink/HCCS)，PP 组放宽到上层域**，这正是并行策略到拓扑的映射。

效果有公开实测背书：Crusoe 在 GB200 NVL72 上，拓扑对齐 vs 不对齐，训练吞吐差 **10–13%**，扩展到 8 机架 512 卡仍近似线性。

Slurm 阵营的对应物是 **topology/block 插件**(23.11+，NVIDIA 与 SchedMD 联合开发，为 NVL72 而生)：`topology.conf` 定义交换机树与 NVLink 域(clique)，`--segment=N` 让任务按 N 节点段放置并对齐域边界。NVIDIA 在 5000 节点 20000 卡的模拟里，拓扑感知调度让 GPU 占用率达到理论值的 99%。

## 七、碎片治理：一套组合拳

碎片怎么来的：任务要 6 卡、8 卡节点剩 2 张孤儿卡；长短任务混跑，长任务占满好域；64 卡任务横跨两个 72 卡域，两个域各废几十卡。

治理手段：

1. **装箱打分**：binpack 优先填已有负载的节点/域，而不是 least-requested 撒胡椒面；
2. **重调度**：周期性把可迁移任务挪去填缝；
3. **任务画像 + 规格约束**：引导用户按 8/16/32 申请，后台小任务自动打包；
4. **切分兜底**：整卡切 MIG/vNPU/time-slicing 吃掉小任务需求，保住整卡池；
5. **配额 + 抢占**：保高优大任务的 SLA；
6. **指标**：碎片率(= 1 − 可运行最大任务规模 / 总空闲卡数)、域完整率、排队时长分布。

## 八、推理侧是另一个世界

训练调度追求"成组 + 拓扑"，推理调度追求"利用率 + 时延 + 弹性"。指标换成 TTFT(首 token 时延)、TPOT、吞吐、KV Cache 命中率。

最值得关注的架构变化是 **P/D 分离**：prefill 是计算密集型、decode 是访存密集型，混跑互相干扰；新架构把两者部署在不同卡池，prefill 算完把 KV Cache 通过 RDMA 推给 decode 侧。调度器要管 P 池与 D 池的配比与弹性、请求路由、KV 传输亲和。开源代表是 vLLM disagg 和 K8s 原生的 ll-d(Gateway API + 端点感知路由)。

## 九、记住三句话

1. AI 调度 = gang(成组)× topology(落对域)× quota/fairness(排队公平)× fragmentation(不浪费)× recovery(坏得快修得快)；
2. **64 张空闲卡 ≠ 64 卡高速互联资源域**，拓扑域是第一公民；
3. 业界收敛路径：K8s 为底座，Volcano/Kueue 为调度面，DRA 为未来的设备 API，超节点(Scale-up 域)调度是接下来几年的主战场。

```text
        ┌────────────── 跨集群/跨智算中心层 ──────────────┐
        │  统一资源视图 / 选集群 / 容量 / 成本 / 数据位置   │
        │  (Kueue MultiKueue / Karmada / 商业调度中台)     │
        └───────────────────┬────────────────────────┘
                            │ 派发 Job
        ┌─────────────── 单集群层 ─────────────────────┐
        │  队列/配额/优先级(Kueue CQ / Volcano Queue)   │
        │  Gang Scheduling(Volcano PodGroup)          │
        │  抢占/回收(reclaim / preempt)                │
        │  拓扑感知(HyperNode / DRA ComputeDomain /     │
        │           Slurm topology-block / clique)     │
        │  装箱与碎片(binpack / rescheduling / MIG)     │
        └───────────────────┬────────────────────────┘
                            │ 分配具体设备
        ┌─────────────── 节点层 ───────────────────────┐
        │  Device Plugin / DRA driver(发现+暴露+隔离)  │
        │  NUMA/PCIe 绑定、MIG/vGPU/vNPU 切分           │
        │  Runtime:NCCL/HCCL 通信域 ←→ RankTable       │
        └───────────────────┬────────────────────────┘
                             │
   硬件:GPU/NPU ← NVLink/UB/HCCS(Scale-up 域)← IB/RoCE 交换机树(Scale-out)
```

下次再看到"空闲 64 卡"却排不上队，你就知道该去问调度器要哪三张图了：域拓扑图、队列水位图、碎片率曲线。
