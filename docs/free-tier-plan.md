# Firebase Spark（免费套餐）改造方案

> **状态（2026-10-18）：长期主线。** 项目确定以后主要运行在 Spark 免费套餐，
> 本文档描述的不是一次性降级动作，而是常态能力边界。Blaze 仍作为可选分支保留，
> 任何时刻可以按 §8 升回去，但新功能一律先满足免费版。
>
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
| App Check 本体 | ⚠️ | 产品免费，但 reCAPTCHA Enterprise 需要 `www.google.com`，国内网络取不到令牌 |
| **Cloud Functions** | ❌ | 需要结算，`firebase deploy --only functions` 必然 403 |
| **Cloud Scheduler** | ❌ | 随 Functions 一起失效 |
| **Secret Manager** | ❌ | 读取 `DEEPSEEK_API_KEY` / `STEAM_API_KEY` 需结算 |

**结论：断的不只是 Cloud Functions** —— 见 §2.1，App Check 强制模式才是让整站空白的真凶。

> 2026-10-25 云 API 核查：`billingEnabled=false`。`firebase functions:list` 仍能
> 列出三个旧的 **ACTIVE** 函数元数据，但 Cloud Scheduler API 因未结算返回 **403**。
> 元数据存在不等于有可运行的后端或定时任务，不要据此判断自动同步仍在工作。

## 2. 失效面

| 功能 | 依赖 | 免费版后果 |
| --- | --- | --- |
| Steam 手动同步按钮 | `syncSteamData` callable | 点击必然失败 |
| 每日 04:00 自动同步 | `scheduledSteamSync` | 不再运行，`steamPlaytime*` 停写 |
| AI 推荐（云端通道） | `getAiRecommendations` callable | 调用必然失败 |
| 密钥读取 | Secret Manager | 不可访问 |

### 2.1 App Check 强制 = 整站空白（本次实测发现）

降级前项目对 `firestore.googleapis.com` 开启了 App Check **强制（ENFORCED）**。
降级后这条链路直接死掉：

1. 浏览器端 `initializeAppCheck` 仍会去拉 `https://www.google.com/recaptcha/enterprise.js`；
2. 国内网络下该脚本取不到（即使挂代理，令牌请求也一直 pending）；
3. Firestore SDK 拿不到 App Check 令牌 → 所有读写被拒，`getDocs` 要么抛
   `permission-denied`，要么一直挂着；
4. 页面骨架照常渲染，但 KPI 全是 `0.00`、图表全是空轴 —— 看起来"能打开"，实际没有数据。

实测证据（2026-10-18）：

| 状态 | 结果 |
| --- | --- |
| App Check ENFORCED + 浏览器 SDK | `permission-denied`，或 `getDocs` 永不返回 |
| App Check ENFORCED + REST（带 API key） | `403 Missing or insufficient permissions` |
| App Check UNENFORCED + REST | `200`，返回真实文档 |
| App Check UNENFORCED + 线上页面 | KPI `¥7490.39`，无控制台报错 |

**处理**：把 Firestore 的 `enforcementMode` 改为 `UNENFORCED`，并在 Spark 版关闭
浏览器端 App Check 初始化（`FEATURES.APP_CHECK = false`）—— 否则即使不强制，
SDK 仍会等一个永远拿不到的令牌。

安全影响可接受：`items` / `steamPlaytime*` 本来就是公开只读，写操作仍由
`firestore.rules` 的 `isAdmin()` 把关；Spark 下没有可被刷爆的计费资源。

> 回 Blaze 时若想恢复 App Check，必须先确认 reCAPTCHA Enterprise 能签发令牌
> （打开控制台 → App Check → 应用 → 查看"最近的有效请求"），再把 enforcement
> 调回 `ENFORCED`、`FEATURES.APP_CHECK` 置 `true`。顺序反了会再次白屏。

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
    APP_CHECK: false,        // App Check（reCAPTCHA Enterprise）初始化
};
```

约束（由测试守卫）：

- `SCHEDULED_SYNC` 蕴含 `STEAM_SYNC` —— 没有 Cloud Functions 就不可能有 Cloud Scheduler。
- `AI_LOCAL_ONLY` 为真时，`getAIRecommendations` 不得调用 `callCloudFunction`。
- `STEAM_SYNC` 为假时，同步按钮不得出现在 DOM 里（管理员也一样）。
- `AI_LOCAL_ONLY` 为真时，`接下来` 弹窗的 AI 栏对非管理员整列隐藏（访客没有 Key，
  只会看到"未配置"），待玩清单占满宽度。
- `firebase.json` 没有 `functions` 段时，`STEAM_SYNC` / `SCHEDULED_SYNC` 不得为真。

## 5. 前端改动

| 文件 | 改动 |
| --- | --- |
| `js/config/firebase.js` | App Check 由 `FEATURES.APP_CHECK` 控制且单独 `try`；失败仅告警，`auth/db/functions` 照常初始化 |
| `js/services/steam.js` | `triggerSteamSync` 前置守卫，关闭时直接返回提示，不发请求 |
| `js/main.js` | 仅在 `STEAM_SYNC` 为真时绑定按钮；同步状态展示保留（读 `metadata/steamSync`，本地脚本也会写） |
| `js/ui/auth.js` | 管理员态只在 `STEAM_SYNC` 为真时显示按钮 |
| `js/services/recommendations.js` | `AI_LOCAL_ONLY` 为真时跳过云函数，直接打 DeepSeek；缺 Key 时给出可操作的提示 |
| `js/ui/play-next.js` | 隐藏"本地直连模式"复选框（免费版恒为直连），状态文案改为单一路径；AI 栏对非管理员整列隐藏 |

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
- 调度：可选。需要自动运行时，自行在 Windows 任务计划程序创建；仓库不会创建任务，
  本机核查也未发现按 `NewGame` / `steam_sync/sync.mjs` 注册的任务。不要假设每日
  04:00 同步已经存在。

## 7. 已知数据风险（未在本次修复）

`computeDelta` + `collectSteamPlaytimeSnapshot` 把两次采样之间的全部增量记入
**运行当月**。若停更 N 天后才恢复同步，这 N 天的总增量会一次性算进「恢复当月」，
中间月份显示为 0。历史数据只能通过 Firebase 控制台或 Admin SDK 手工修正
（`firestore.rules` 里 `steamPlaytime*` 是 `write: false`）。

本地脚本若能自行配置按日调度，可以把窗口压到最小，但无法根除。彻底修复需要每日快照表，属于
数据模型变更，本次不做。

## 8. 部署与回退

免费套餐下 `firebase.json` 移除了 `functions` 段，因此 `firebase deploy` 可以直接跑。
部署命令：

```bash
firebase deploy --only hosting,firestore:rules
```

回到 Blaze：

1. `firebase.json` 补回 `"functions": { "source": "functions" }`
2. `js/config/constants.js` 里把 `FEATURES` 翻回 `{STEAM_SYNC: true, SCHEDULED_SYNC: true, AI_LOCAL_ONLY: false}`
3. `firebase deploy`（含 functions）
4. `firebase functions:secrets:set DEEPSEEK_API_KEY` / `STEAM_API_KEY` 重新配置
5. 如果你曾经自行创建本机 Steam 同步计划任务，停用它，避免两条路径同时写入；
   仓库从未自动创建该任务
6. 确认 reCAPTCHA Enterprise 能签发令牌后，再把 `FEATURES.APP_CHECK` 置 `true`，
   并把 Firestore 的 App Check `enforcementMode` 调回 `ENFORCED`（先确认再强制）

## 9. 验收清单

- [ ] 首页在无 Cloud Functions 的 Spark 项目下正常加载（KPI、图表、表格都有数据）
- [ ] 管理员登录后看不到 Steam 同步按钮，同步状态文案仍能显示上次同步时间
- [ ] AI 推荐在配置了本地 DeepSeek Key 后可正常返回
- [ ] `node tools/steam_sync/sync.mjs` dry-run 能打印匹配结果，`--apply` 后
      `metadata/steamSync.lastSyncTime` 更新
- [ ] 现有测试全绿
