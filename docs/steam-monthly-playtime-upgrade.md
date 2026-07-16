# Steam 月度真实游玩时长升级实施说明

## 1. 目标与结论

将仪表盘的 Steam 游戏月度时长从“按开始/通关日期均摊累计时长”升级为“定时读取 Steam 累计分钟数、保存快照并统计相邻快照差量”。

本项目已经有每日北京时间 04:00 的 `scheduledSteamSync`，因此不需要新增外部定时基础设施。改造重点是持久化 Steam 累计时长基线和各月增量，并让月度趋势图读取这些数据。

### 成功定义

- Steam API 追踪启用后，已绑定 Steam App ID 且 `steam_override !== false` 的游戏，其新增游玩时长以 Steam 的累计分钟差量统计。
- 相邻两次成功采样的差量只会写入一次；重复手动同步或定时任务重试不得重复累计。
- 已经存在的历史 Steam 时长不会被错误地一次性计入启用当月。
- 旧 Steam 历史保留为固定估算值，启用后产生的月度数据保持稳定，不会因累计时长增加而改写过去月份。
- 非 Steam 游戏、剧集和 `steam_override === false` 的本地时长维持现有均摊逻辑。

### 事实边界

Steam Web API 的 `GetOwnedGames` 返回的是累计字段 `playtime_forever`，不提供按月历史或逐次游玩会话。因此无法通过 API 精确回填过去几年每个月的真实时长。

“真实”在本方案中的含义是：**从追踪启用后的 Steam 累计值差量**。每日采样可准确获得该采样区间内的总新增分钟数；如果游玩、离线同步或 API 更新恰好跨越自然月边界，分钟的月份归属仍只能按采样时间近似。该限制必须在图表提示中说明。

## 2. 当前实现与问题

当前月度趋势图在 `js/charts/monthly-trends.js` 中，对每个非硬件条目的 `playTime` 按以下规则均摊：

1. 起点为 `startDate`，缺失时为 `purchaseDate`。
2. 已通关条目以 `passDate` 为终点；未通关条目以当天为终点。
3. 将当前累计 `playTime` 按日期比例分配进各月。

因此，进行中游戏每次增加累计时长，开始至今天的每一个历史月份都会被重新计算。例如一款游戏在一至三月累计 90 小时，四月增加至 100 小时后，一至三月的显示时长也会下降。这不是月度实际游玩记录。

现有 `functions/index.js` 已调用：

```text
IPlayerService/GetOwnedGames
  -> game.playtime_forever（累计分钟）
  -> 仅在大于 item.playTime 时更新 items/{id}.playTime
```

当前没有保存上次返回的累计分钟数，也没有任何 Steam 月度时长集合。现有同步还会为每个匹配游戏查询成就；采集时长不得因为未来可能提高采样频率而连带高频查询成就。

## 3. 固定产品决策

实现时采用以下决策，除非产品负责人明确变更，不要自行替换成其他口径：

1. **按整个 Steam 库的 App ID 追踪，不只追踪已匹配的仪表盘条目。** 这样先采集、后绑定 `steam_app_id` 的游戏仍可显示追踪期内的月度记录。
2. **内部统一以整数分钟存储和计算。** 只在界面显示时除以 60 并保留一位或两位小数，避免逐次四舍五入损失。
3. **首次完整库快照只建立基线，绝不写入任何月度增量。** 防止把历史累计时长误归入部署当月。
4. **切换前 Steam 历史固定为“估算”，切换后为“Steam 追踪”。** 两段数据可以在同一总时长折线中相加，但 tooltip 必须标明来源。
5. **`steam_override === false` 始终尊重本地数据。** 它不参与 Steam 实测层，继续走原有本地均摊口径。
6. **每日采样继续使用现有 04:00 调度。** 如将来需要提高分辨率，新增轻量采集函数；不要把成就轮询一并提频。
7. **不对 `items` 全量写入新历史字段。** 月度追踪数据应独立保存，避免污染 CSV 数据模型和触发所有 item 客户端监听器。

## 4. Firestore 数据模型

新增以下集合。字段名可微调，但语义和分钟单位必须保持一致。

### `metadata/steamPlaytimeTracking`

```js
{
  schemaVersion: 1,
  initializedAt: Timestamp,          // 首次完整库基线成功建立的时间
  lastCompletedAt: Timestamp,        // 最近一次完整采样处理成功的时间
  lastRunId: string,                 // 幂等/排错标识
  coverage: 'partial-first-month' | 'active',
  lastError: string | null
}
```

### `steamPlaytimeState/{appid}`

每个 Steam App 一份状态，文档 ID 为十进制字符串 App ID。

```js
{
  appId: number,
  name: string,
  initialTotalMinutes: number,       // 首次完整库基线的累计分钟；仅用于固定旧历史估算
  initialObservedAt: Timestamp,
  lastTotalMinutes: number,          // 最近一次成功采样的累计分钟
  lastObservedAt: Timestamp,
  firstSeenMode: 'baseline' | 'new-after-tracking',
  lastDeltaMinutes: number,
  anomalyCount: number,
  lastAnomaly: {
    type: 'counter-decreased',
    previousMinutes: number,
    currentMinutes: number,
    observedAt: Timestamp
  } | null
}
```

### `steamPlaytimeMonths/{YYYY-MM}`

每月一个聚合文档，适合个人游戏库规模；App ID 只包含数字，可作为 map key。

```js
{
  month: '2026-07',
  minutesByApp: {
    '570': 120,
    '730': 45
  },
  trackedTotalMinutes: 165,
  firstObservedAt: Timestamp,
  lastObservedAt: Timestamp,
  updatedAt: Timestamp
}
```

实施中必须在写入前检查月度文档大小。个人库规模通常远低于 Firestore 的 1 MiB 限制；如果接近 750 KiB，改为 `steamPlaytimeMonths/{month}/apps/{appid}` 子集合，并相应调整前端读取方式。不要在无检查的情况下假设 map 永远无限大。

## 5. 后端实现方案

### 5.1 拆分职责

修改 `functions/index.js`，将现有 `performSteamSync` 拆分为可复用的逻辑：

```text
fetchOwnedSteamGames(apiKey)
  获取完整 Steam 库，保留 appid、name、playtime_forever 原始分钟数。

collectSteamPlaytimeSnapshot(apiKey, trigger)
  负责锁、基线、差量、月度写入和追踪元数据。

syncSteamItemsAndAchievements(apiKey, steamGames)
  复用现有模糊匹配、items.playTime 更新和成就同步逻辑。

performSteamSync(apiKey)
  依次调用采集、条目/成就同步；供手动和每日定时任务使用。
```

首次可以继续让每日任务同时执行两类工作。若以后将采集频率提高到小时级，新增只调用 `collectSteamPlaytimeSnapshot` 的任务，保留条目/成就同步为每日一次。

### 5.2 锁和幂等

手动 `syncSteamData` 与 `scheduledSteamSync` 可能重叠。差量计算必须避免两个运行都读取同一旧值后重复累加。

实现一个 Firestore 事务锁，例如 `metadata/steamPlaytimeLock`：

```js
{
  runId: string,
  startedAt: Timestamp,
  expiresAt: Timestamp
}
```

- 启动时在事务中取得未过期锁；拿不到锁则安全跳过并返回 `skipped: 'already-running'`。
- 函数的 `finally` 中仅删除自己持有的锁。
- 锁过期时间应略长于函数正常时限，例如 10 分钟；运行失败后允许下一次恢复。
- `lastTotalMinutes` 和对应月度增量必须在同一批原子提交中写入。个人库规模下用 Firestore batch 即可；锁保证无并发写入。

### 5.3 首次完整库基线

当 `metadata/steamPlaytimeTracking.initializedAt` 不存在时：

1. 成功获取完整 Steam 库后，为每个 App 写入 `initialTotalMinutes` 和 `lastTotalMinutes`。
2. 写入 `initializedAt`、`lastCompletedAt` 和 `coverage: 'partial-first-month'`。
3. **不写入 `steamPlaytimeMonths`。**
4. 仅在全部状态文档和元数据提交成功后才把基线视为完成；失败时下次仍作为首次基线重试。

这是无损保护：首次基线中的累计分钟可能来自几年以前，不能把它视为当月游玩。

### 5.4 常规增量采样

对每一个 API 返回的游戏：

1. 将 `playtime_forever` 读取为非负整数分钟 `currentMinutes`。
2. 若已有状态，计算 `delta = currentMinutes - lastTotalMinutes`。
3. `delta > 0` 时，将分钟写入采样观察时刻所属的 `YYYY-MM` 的 `minutesByApp[appid]` 和 `trackedTotalMinutes`。
4. `delta === 0` 时只更新 `lastObservedAt`，不写月度增量。
5. `delta < 0` 时不写负数；记录 `counter-decreased` 异常，刷新 `lastTotalMinutes` 为当前值。该情况应写入日志和 `metadata`，便于人工检查。
6. 无状态但追踪已完成时，视为新出现的 App：若本次是完整库结果，将其 `lastTotalMinutes` 设为当前值，并将首次正累计分钟写入本月，`firstSeenMode` 为 `new-after-tracking`。这是“自上次完整库快照后新拥有/首次游玩”的合理近似。

从 API 消失的 App 不要将其累计值归零，也不要删除状态文档。游戏退款、隐藏、可见性变化都不应抹去已统计历史。

### 5.5 月份归属规则

默认把全部 `delta` 计入**本次观察时间**所在月份。这个规则简单、可审计、幂等，并符合“Steam 在本次同步前报告了这些新增分钟”的事实。

若两次成功同步跨月，分钟实际可能分布在两个自然月。不要伪造精确会话数据。可在后续增强版中按两个采样时间的间隔比例分摊，并在 UI 标为“跨月估算”；首版不做比例分摊。

## 6. 历史数据和图表合并

### 6.1 固定历史估算

对于有 `steam_app_id`、有 `steamPlaytimeState` 且 `steam_override !== false` 的 Steam 项：

- 历史总量使用 `initialTotalMinutes / 60`，而不是持续增长的 `item.playTime`。
- 历史估算的结束点固定为 `initialObservedAt`；若 `passDate` 更早，则以 `passDate` 结束。
- 沿用现有按日期均摊逻辑，但以固定基线和固定结束点计算。
- 这保证旧月份在后续 Steam 同步后不再变化。

首次基线所在月份是“部分估算 + 部分追踪”的过渡月。月度图和 tooltip 应显示“追踪于 MM/DD 开始；本月包含切换前估算”。从下一个完整月起，Steam 增量不再含估算成分。

没有 App ID、没有状态或明确关闭 Steam 覆盖的条目，仍完全使用现有 `playTime` 均摊逻辑。

### 6.2 前端读取与合并

新增 `js/services/steam-playtime.js`，负责订阅 `steamPlaytimeMonths` 和追踪元数据；不要把这部分塞进已有 `js/services/steam.js` 的按钮调用代码。

建议在 `js/core/state.js` 新增：

```js
export let steamPlaytimeMonths = new Map();
export let steamPlaytimeTracking = null;
export const setSteamPlaytimeMonths = (value) => { /* ... */ };
export const setSteamPlaytimeTracking = (value) => { /* ... */ };
```

修改 `js/main.js`：

- 初始化 Steam 月度数据监听器。
- 当月度数据或追踪元数据变化时，重绘月度趋势图。
- 月度图的渲染签名必须包含月度数据版本/哈希，不能只依赖 `items`；否则 Cloud Function 写入月度集合后页面不会刷新。

修改 `js/charts/monthly-trends.js`：

1. 抽取当前均摊计算为可复用函数，并新增可传入 `totalHours`、`startDate`、`endDate` 的固定区间版本。
2. 构建趋势时，对受追踪 Steam 条目只加入固定历史估算，不再将当前 `item.playTime` 均摊到今天。
3. 再将 `steamPlaytimeMonths` 中每月 App ID 对应的分钟相加到游戏时长曲线。
4. tooltip 的游戏 Top 5 也必须改为相同数据源，不能继续调用旧 `calcMonthlyPlaytime` 并显示不一致结果。
5. 在 tooltip 中分别显示 `Steam 追踪`、`Steam 历史估算`、`本地估算`；过渡月显示覆盖提示。

月度总线仍可显示“游戏时长”总数，但来源必须可追溯。建议在 tooltip 增加一行 `Steam 实测：Xh；估算：Yh`，无需增加新的常驻图例。

## 7. 文件级任务清单

| 文件 | 任务 |
| --- | --- |
| `functions/index.js` | 抽取 Steam 拉取函数；实现锁、状态基线、月度差量采集；保持既有匹配/成就逻辑行为不变。 |
| `js/core/state.js` | 保存 Steam 月度数据与追踪元数据，并提供 setter。 |
| `js/services/steam-playtime.js`（新增） | Firestore 月度集合、追踪元数据的实时监听和取消订阅。 |
| `js/main.js` | 初始化监听器；将 Steam 月度数据纳入月度图重绘哈希。 |
| `js/charts/monthly-trends.js` | 合并固定历史估算、Steam 追踪增量和原有本地/剧集数据；统一 tooltip 口径。 |
| `tools/tests/steam-playtime-tests.mjs`（新增） | 覆盖纯计算函数：首次基线、正差量、零差量、负差量、跨月、混合历史。 |
| Firestore 安全规则（仓库外，如有） | 仅为仪表盘所需角色授予 `steamPlaytimeMonths` 与追踪元数据读取权限；Cloud Functions 通过 Admin SDK 写入。不可为了方便放宽其他集合规则。 |
| `README.md`（可选） | 简述月度 Steam 时长从何时开始追踪、历史数据为何标为估算。 |

若为可测试性需要移动纯函数，可新增一个不依赖 Firebase Admin 的 CommonJS 工具模块，例如 `functions/steam-playtime.js`。不要把前端 ES Module 直接导入 Cloud Functions，也不要引入构建系统。

## 8. 实施顺序

### 阶段 A：先写纯计算和测试

1. 实现 `getMonthKey(date)`、`computeDelta(previous, current)`、首次基线判定、月度增量写入 payload 构建等纯函数。
2. 为以下场景写 `node:test`：
   - 首次基线：只生成状态，无月度分钟。
   - 120 -> 180 分钟：本月增加 60 分钟。
   - 180 -> 180 分钟：不增加。
   - 180 -> 150 分钟：记录异常，不增加负数。
   - 新 App 在追踪后第一次出现：按本月新增处理。
   - 切换后继续游玩的旧游戏：历史基线与新月增量不重叠。
   - `steam_override === false`：只返回本地估算。

### 阶段 B：实现后端但先不部署写入

1. 增加 `dryRun` 参数或内部开关，仅记录“将创建/更新的 state 和 month 文档”。
2. 本地模拟至少一份完整 Steam 库响应，检查首次运行不产生月度写入。
3. 检查 batch 写入数量不超过 400，保留当前项目的保守批大小惯例。
4. 确认失败不会写入 `initializedAt`，避免不完整基线被误认定为成功。

### 阶段 C：实现前端读取和图表

1. 在模拟月度数据下验证总折线、Top 5 和 tooltip 来源一致。
2. 验证未登录/只读用户的正常展示；图表读取失败时降级为既有估算并在控制台记录错误，不得让页面崩溃。
3. 验证旧缓存中没有新集合数据时的首次渲染表现。

### 阶段 D：受控上线

1. 先部署 Functions 和必要安全规则，再部署 Hosting。
2. 首次生产同步只建立基线。记录基线时间和 Steam 库数量。
3. 在第二次同步后检查：仅有实际增加的 App/分钟进入本月文档。
4. 连续观察至少两次自动同步和一次手动同步，确认无重复累计。
5. 在下一个自然月初检查过渡月提示和新月份增量；不要在未经核对前对历史 Firestore `items` 做批量回写。

## 9. 验收清单

- [ ] 首次成功同步后，`steamPlaytimeState` 已有完整 Steam 库状态，但 `steamPlaytimeMonths` 无由历史总时长产生的突增。
- [ ] 第二次同步时，某游戏 Steam 累计增加 90 分钟，本月对应 App 精确增加 90 分钟。
- [ ] 对同一累计值重复执行同步，月度分钟不增加。
- [ ] 手动同步与定时同步重叠时，其中一个安全跳过，月度分钟不重复。
- [ ] Steam 累计值下降时，页面没有负时长，后台有可定位的异常日志/元数据。
- [ ] 已追踪 Steam 游戏的旧月份在多次同步后保持不变。
- [ ] `steam_override === false`、未绑定 Steam App ID、剧集和其他平台的现有图表行为未回归。
- [ ] 月度图主线、全屏图和 tooltip Top 5 使用同一套合并数据。
- [ ] `node --test tools/tests/*.mjs` 通过；现有核心测试未回归。
- [ ] `firebase deploy --only functions` 与 `firebase deploy --only hosting` 分别完成后，生产页面可正常读取数据。

## 10. 不做的事项

- 不尝试从 Steam API 回填历史月份或假装能够获得逐次游玩会话。
- 不将首次抓取到的 `playtime_forever` 全部算作当前月时长。
- 不修改旧游戏的真实 `purchasePrice`、`playTime`、CSV 格式或非 Steam 数据。
- 不引入框架、包管理器、构建步骤或第三方数据库。
- 不提高成就 API 查询频率。

## 11. 工作量估计

| 范围 | 预计工作量 |
| --- | --- |
| 纯差量采集、基线、月度集合 | 6～8 小时 |
| 前端状态、监听、图表和 tooltip 合并 | 5～7 小时 |
| dry-run、测试、异常/锁处理、部署核验 | 5～9 小时 |
| **推荐完整实施** | **16～24 小时（约 2～3 个工作日）** |

后续若增加“跨月按采样间隔比例拆分”“小时级轻量采样”“手动导入 Steam 年度回顾”等功能，另行设计，不能混入本次基础升级。
