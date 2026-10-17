# Firebase Spark（免费套餐）改造方案

> 本文档据 2026-10-17 的设计结论重建 —— 原文件在当天的分支切换事故中丢失。
> 目标：在不删代码、不改数据模型的前提下，让站点在 Spark 免费套餐下完整可用；
> 升回 Blaze 时只需翻转一个常量。

## 1. 背景

项目从 Blaze 降级到 Spark（免费套餐）。Spark 没有结算账号，因此：

| 能力 | Spark 可用 | 说明 |
| --- | --- | --- |
| Hosting（含自定义域名 / SSL） | ✅ | 部署不受影响 |
| Authentication（Google 登录） | ✅ | 免费额度足够 |
| Cloud Firestore（Native） | ✅ | 1 GiB 存储 / 50k 读 / 20k 写 每天 |
| App Check 本体 | ✅ | reCAPTCHA Enterprise 每月 1 万次免费评估 |
| **Cloud Functions** | ❌ | 需要结算，`firebase deploy --only functions` 必然 403 |
| **Cloud Scheduler** | ❌ | 随 Functions 一起失效 |
| **Secret Manager** | ❌ | 读取 `DEEPSEEK_API_KEY` / `STEAM_API_KEY` 需结算 |

**结论：断的只有 Cloud Functions 这一条链**，Firestore / Auth / Hosting 都不需要改造。

## 2. 失效面

| 功能 | 依赖 | 免费版后果 |
| --- | --- | --- |
| Steam 手动同步按钮 | `syncSteamData` callable | 点击必然失败 |
| 每日 04:00 自动同步 | `scheduledSteamSync` | 不再运行，`steamPlaytime*` 停写 |
| AI 推荐（云端通道） | `getAiRecommendations` callable | 调用必然失败 |
| 密钥读取 | Secret Manager | 不可访问 |

## 3. 设计原则

1. **开关式分支，不造平行分支。** 所有差异收敛到 `js/config/constants.js` 的
   `FEATURES`，回到 Blaze 只改这一个对象。前端其余代码不为 Spark 做结构性改写。
2. **不删 `functions/`。** 代码冻结保留，只是不部署。
   `tools/tests/config-consistency.test.mjs` 依赖 `functions/index.js` 里的
   ADMIN_UIDS / AI prompt / STEAM_ID 三处断言，删了测试立刻变红。
3. **不改数据模型。** Firestore 结构、`firestore.rules`、IndexedDB 缓存版本
   （`game-dashboard-cache` v1）全部保持不变，两个套餐指向同一个库。
4. **降级不能把页面搞挂。** App Check 初始化必须与 `getAuth/getFirestore`
   解耦 —— 原来三者在同一个 `try` 里，App Check 一抛错整页就落到"初始化失败"遮罩。

## 4. 开关定义

```js
// js/config/constants.js
export const FEATURES = {
    STEAM_SYNC: false,       // Steam 手动同步（Cloud Function）
    SCHEDULED_SYNC: false,   // 每日 04:00 自动同步（Cloud Scheduler）
    AI_LOCAL_ONLY: true,     // AI 推荐只用浏览器直连 DeepSeek
};
```

约束（由测试守卫）：

- `SCHEDULED_SYNC` 蕴含 `STEAM_SYNC` —— 没有 Cloud Functions 就不可能有 Cloud Scheduler。
- `AI_LOCAL_ONLY` 为真时，`getAIRecommendations` 不得调用 `callCloudFunction`。
- `STEAM_SYNC` 为假时，同步按钮不得出现在 DOM 里（管理员也一样）。

## 5. 前端改动

| 文件 | 改动 |
| --- | --- |
| `js/config/firebase.js` | App Check 单独 `try`；失败仅告警，`auth/db/functions` 照常初始化 |
| `js/services/steam.js` | `triggerSteamSync` 前置守卫，关闭时直接返回提示，不发请求 |
| `js/main.js` | 仅在 `STEAM_SYNC` 为真时绑定按钮；同步状态展示保留（读 `metadata/steamSync`，本地脚本也会写） |
| `js/ui/auth.js` | 管理员态只在 `STEAM_SYNC` 为真时显示按钮 |
| `js/services/recommendations.js` | `AI_LOCAL_ONLY` 为真时跳过云函数，直接打 DeepSeek；缺 Key 时给出可操作的提示 |
| `js/ui/play-next.js` | 隐藏"本地直连模式"复选框（免费版恒为直连），状态文案改为单一路径 |

## 6. 定时同步的替代：本地脚本

Spark 下不能再跑 Cloud Scheduler，但**本机脚本不受 Spark 限制** —— 它消耗的
只是 Firestore 的免费配额。

```
tools/steam_sync/sync.mjs
```

- 复用 `functions/steam-playtime.js`（增量计算）与
  `functions/steam-sync-core.js`（名称模糊匹配），保证两条路径算出相同结果。
- 认证走 `~/.config/configstore/firebase-tools.json` 的 OAuth 令牌（与
  `tools/create_items`、`tools/bind_steam_ids` 一致），不需要 service account 密钥。
- Steam Web API Key 从环境变量 `STEAM_API_KEY` 或 `tools/steam_sync/.env` 读取
  （`.env` 已被 `.gitignore` 的 `**/.env` 覆盖）。
- **默认 dry-run**，加 `--apply` 才写库，沿用项目既有约定。
- 写入字段与云函数逐字一致：`items.steam_app_id / steam_last_sync / playTime /
  fullyCompleted`、`metadata/steamSync`、`steamPlaytimeState/*`、
  `steamPlaytimeMonths/*`、`metadata/steamPlaytimeTracking`。
- 调度：Windows 任务计划程序每天 04:00 运行一次。

## 7. 已知数据风险（未在本次修复）

`computeDelta` + `collectSteamPlaytimeSnapshot` 把两次采样之间的全部增量记入
**运行当月**。若停更 N 天后才恢复同步，这 N 天的总增量会一次性算进「恢复当月」，
中间月份显示为 0。历史数据只能通过 Firebase 控制台或 Admin SDK 手工修正
（`firestore.rules` 里 `steamPlaytime*` 是 `write: false`）。

本地脚本按日调度可以把窗口压到最小，但无法根除。彻底修复需要每日快照表，属于
数据模型变更，本次不做。

## 8. 部署与回退

免费套餐下 `firebase.json` 移除了 `functions` 段，因此 `firebase deploy` 可以直接跑。
部署命令：

```bash
firebase deploy --only hosting,firestore:rules
```

回到 Blaze：

1. `firebase.json` 补回 `"functions": { "source": "functions" }`
2. `js/config/constants.js` 里把 `FEATURES` 三个开关翻回 `true/false`（云端）
3. `firebase deploy`（含 functions）
4. `firebase functions:secrets:set DEEPSEEK_API_KEY` / `STEAM_API_KEY` 重新配置
5. 停用本机任务计划程序里的 Steam 同步任务，避免两条路径同时写入

## 9. 验收清单

- [ ] 首页在无 Cloud Functions 的 Spark 项目下正常加载（KPI、图表、表格都有数据）
- [ ] 管理员登录后看不到 Steam 同步按钮，同步状态文案仍能显示上次同步时间
- [ ] AI 推荐在配置了本地 DeepSeek Key 后可正常返回
- [ ] `node tools/steam_sync/sync.mjs` dry-run 能打印匹配结果，`--apply` 后
      `metadata/steamSync.lastSyncTime` 更新
- [ ] 现有测试全绿
