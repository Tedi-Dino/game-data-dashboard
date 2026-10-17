# 只读审计报告 · 个人游戏数据仪表盘

- 审计日期：2026-10-16
- 审计性质：**只读**。未修改任何既有文件、未读写 Firestore 线上数据、未执行 `firebase deploy`、未运行 `tools/` 下任何写库脚本。
- 审计范围：`AGENTS.md`、`README.md`、`docs/*`、`firestore.rules`、`firebase.json`、`functions/*`、`js/`（全部 26 个模块）、`index.html`、`css/style.css`、`tools/`
- 方法：全文精读 + 交叉引用 grep + 在本地 Node 中复算日期逻辑（纯计算，无文件/网络写入）
- 本文档为审计产出，唯一新增文件。
- **修订：v2（2026-10-16）** —— 经独立对抗式复核（`docs/audit-verification-2026-10-16.md`）后修正。初版有 **1 处实质错误**（B13 清单误列 2 条仍有引用的代码）、**3 处夸大**（A3 / B14 / C 节 XSS）、**1 处计数错误**（摘要 P1 数）。修正明细见文末 **G 节**。

---

## 摘要

旧优化计划（`docs/optimization-plan.md`，2026-07-05）的 12 项：**已修复 4 项 · 部分修复 8 项 · 完全未处理 0 项**。

新发现 **23 项**（初轮 B1–B18 + 复核轮补充 B19–B23），其中 **P1 级 5 项**（B1–B5）。

最强的一条是 **B1**：`js/ui/dashboard.js:9` 把用户选择「以本地数据为准」的游戏整个从 KPI 中排除，而项目自己的书面规范 `docs/steam-monthly-playtime-upgrade.md:51` 明确要求「始终尊重本地数据…继续走原有本地均摊口径」。git 历史证实这是一次**可追溯的极性反转回归**（`908480a`），不是有意取舍——故**不再需要用户确认意图**。其次是 **B2**：一个已写好、已单测、却从未被生产代码调用的类型守卫。

复核轮另发现一条初轮完全遗漏的缺陷 **B19**：5 张图表中有 4 张的增量重渲签名字段清单不完备，最严重的 `genre` 图缺 `playTime`，导致每日 Steam 同步更新时长后该图整块不刷新。

---

# A. 旧计划 12 项校对

| # | 项目 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | 处理旧 `update_unsold_cost` | **部分修复** | A1 |
| 2 | CSV 全量替换失败恢复 | **部分修复** | A2 |
| 3 | 共享 AI prompt 契约 | **部分修复** | A3 |
| 4 | 收敛平台/类型映射 | **部分修复** | A4 |
| 5 | 统一日期解析 | **部分修复** | A5 |
| 6 | 图表增量更新 | **部分修复** | A6 |
| 7 | 表格事件委托 + 防抖 | **已修复** | `js/ui/data-table.js:251-263`、`js/ui/data-table.js:239` |
| 8 | 外部资源失败降级 | **部分修复** | B4 |
| 9 | 浏览器本地 DeepSeek Key | **已修复** | `js/ui/play-next.js:131-147`；设置面板位于 `ai-section` 内（`index.html:540-566`），非管理员整块隐藏 |
| 10 | Firestore 规则纳入仓库 + 说明 | **已修复** | `firestore.rules:1-38`、`firebase.json:50-52`、`docs/firebase-security.md:17-30` 三者一致 |
| 11 | 最小测试矩阵 | **部分修复** | A11 |
| 12 | 文档编码说明 | **已修复**（但引入新的过期描述） | `AGENTS.md` 含 PowerShell `-Encoding utf8` 说明；新问题见 B13 |

---

## A1 · 旧写库脚本已标记弃用，但验收标准仍未达成 · P1

`tools/update_unsold_cost/update_unsold_cost.js` 已默认 dry-run、有 DEPRECATED 横幅与 README 警告，这部分做对了。

**但旧计划的验收标准「仓库中不存在默认 live-run 的批量 Firestore 写脚本」不成立：**

`tools/bind_steam_ids/bind_steam_ids.js:22`
```js
const DRY_RUN = process.argv.includes('--dry-run');
```
这是**反向约定**——不带参数即写线上。同仓库 `tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js:22` 用的是 `--apply` 才写。两个脚本约定相反。

- **影响**：照直觉敲 `node tools/bind_steam_ids/bind_steam_ids.js` 会立刻 PATCH 线上文档。
- **建议**：将 `:22` 改为 `--apply` 语义，与另一脚本对齐；补一行 README。
- **风险/工作量**：低。
- **验证**：不带参数运行应只打印、不写入。

---

## A2 · `fb_id` 剥离已完成，导入预演摘要仍缺失 · P1

已完成：`js/services/firestore.js:132-134` 恢复备份时正确剥离了 `fb_id`。

未完成：`js/ui/csv-handlers.js:38` 的确认框仍只有一句 `导入CSV将覆盖所有现有数据，您确定吗？`，无任何条数摘要。详见 B5。

---

## A3 · 契约文档已建，prompt 仍是两份，解析函数仍无测试 · P2

- `docs/ai-recommendation-contract.md:1-112` 已存在，含同步流程。✔
- prompt 正文仍逐字重复两份：`functions/index.js:115-148` 与 `js/services/recommendations.js:56-89`。比对结果：**语义一致（34/34 行去掉 `\r` 后全等），尚未漂移**。
  - **【v2 修正】** 初版写「逐行一致」不准确——**字节层面不一致**：`functions/index.js` 为 CRLF（该文件 389 行 CRLF / 254 行 LF-only，自身即混用），`recommendations.js` 为纯 LF（0 CRLF / 280 LF）。裸 `diff` 会报 34 行全不同。
  - 这个 EOL 分歧本身就是漂移风险信号：任何跨文件一致性检查（含未来的 CI）都会被噪声干扰。详见 B20。
- 旧计划验收项「为 `parseRecommendations()` 增加轻量测试样例」**未做**。`tools/tests/core-tests.mjs` 仅覆盖 `netCost` / `normalizeMonth` / `parseLocalDateOnly` / `parseCSVLine`。

---

## A4 · `PLATFORM_META` 已建，但 4 个图表文件仍各自硬编码映射 · P2

单一数据源已建好：`js/config/constants.js:16-32`，且 `js/ui/dashboard.js:119-121` 已从它派生。✔

但旧计划点名的三个图表文件一个都没改。**【v2 修正】** 初版标题写「5 份」、正文写「6 份」、表格实为 5 行，三个数字互相矛盾。准确计数是：**1 份 canonical + 4 份独立硬编码 + 1 份派生**：

| 位置 | 形态 | 性质 |
|---|---|---|
| `js/config/constants.js:16-32` | `PLATFORM_META` | canonical ✔ |
| `js/charts/cost-distribution.js:6-22` | `COST_LABELS` | 硬编码 |
| `js/charts/time-distribution.js:6-12` | `TIME_LABELS` | 硬编码 |
| `js/charts/game-distribution.js:7-22` | `PLATFORM_MAP` | 硬编码 |
| `js/charts/monthly-trends.js:6-27` + `:85-89` | `DEFAULT_TREND` / `PLATFORM_DATA_KEYS` / `typeToKey` | 硬编码 |
| `js/ui/dashboard.js:119-121` | `TYPE_TO_PLATFORM` | 派生自 canonical ✔ |

**已发生漂移的证据**：`js/charts/game-distribution.js:21` 把 `drama` 标为 `剧集`，而 `js/config/constants.js:31` 标为 `剧`（`time-distribution.js:11` 与 `cost-distribution.js:21` 均为 `剧`，即只有散点图这一份漂了）。

**更脆的一点**：`js/charts/cost-distribution.js` 单文件内混用两套——`:27` 用本地 `COST_LABELS` 分组，`:65` 用 `COST_TYPE_MAP` 查 tooltip。两者一旦不同步，tooltip 直接查空。

**旧计划验收「新增一个平台类型时，只需要改一处配置」→ 未达成，实际需改 5 处。**

**附注（见 B20）**：canonical 那一份 `constants.js` 本身可读性最差——`:17-31` 的中文标签写成 `硬件设备` 这类 `\uXXXX` 转义，而**同一行的 `label: '硬件'` 又是字面 UTF-8**，一行之内两种写法混用。把「单一数据源」写成最难读的一份，与收敛目标相悖。

---

## A5 · `parseLocalDateOnly` 已写好并有测试，但只有 1 个调用点 · P1

helper 在 `js/core/utils.js:94-105`，测试在 `tools/tests/core-tests.mjs:135-160`。✔

但全仓库只有 `js/core/utils.js:26`（`formatDateForInput` 内部）调用它。仍在裸用 `new Date(str)` 的写/读路径：

- `js/core/utils.js:12-17` `parseDateOrNull` ← **真正写进 Firestore 的那条路**（经 `js/services/csv.js:20-24`、`js/ui/item-form.js:110-116`）
- `js/core/utils.js:47-53` `normalizeMonth` ← 月度归月
- `js/ui/on-this-day.js:36`、`js/ui/data-table.js:77`、`:91-92`、`js/charts/monthly-trends.js:32`

在 `TZ=Asia/Shanghai`（offset −480）下实跑复算：

```
'2026-07-01'         -> parseDateOrNull: 2026-07-01 | normalizeMonth: 2026-07   OK
'2026/7/1'           -> parseDateOrNull: 2026-06-30 | normalizeMonth: 2026-06   差一天且差一月
'2026-07-01T00:00:00'-> parseDateOrNull: 2026-06-30 | normalizeMonth: 2026-06   差一天且差一月
```

**【v2 加强】** 初版是照抄实现复算（弱验证）；复核轮改用 `import('file:///E:/NewGame/js/core/utils.js')` 直接加载真源码实跑，输出与上表**逐字一致**。这也顺带证实了 A11 的结论：`js/core/utils.js` 零 import，Node 中可直接加载，测试里抄写副本毫无必要。

**旧计划验收「『那年今日』不会因时区把日期偏到前一天」→ 未达成。** `js/ui/on-this-day.js:36-39` 用 `new Date('YYYY-MM-DD')`（解析为 UTC 零点）再取 `getDate()`（本地取值），在任何西半球时区都会整体偏一天。

---

## A6 · 每图独立签名已做，`chart.update()` 增量未做 · P2

「短期」目标达成：`js/main.js:41-64` 现为 5 张图各算一份字段签名，仅签名变化者重建。✔

「中期」目标（`chart.data = ...; chart.update()`）未做——每张图仍 `destroyChartWithTooltip()` + `new Chart()`（如 `js/charts/cost-distribution.js:34-36`）。

**【v2 补充】** 「短期」目标虽然做了，但**字段清单本身不完备**：5 张图中 4 张的签名漏掉了该图实际读取的字段，导致该重渲的图被 `main.js:56` 的 `continue` 挡掉。这是同一机制的另一半问题，详见 **B19**。

副作用：旧的全量销毁函数 `js/charts/setup.js:117-124` `destroyAllCharts` 已**完全无引用**（grep 全仓库 0 处），成为死代码。详见 B13 ①。

---

## A11 · 测试目录存在，但两条验收都有缺口 · P2

- 29 个用例逐文件运行通过（`core-tests.mjs` 22/22、`steam-playtime-tests.mjs` 7/7）。
- **`node --test tools/tests/` 会失败**：文件名为 `*-tests.mjs`，不匹配 Node 默认测试文件通配（`*.test.mjs` / `test-*.mjs`），目录参数被当作模块解析 → `Cannot find module`。
- **更关键**：`tools/tests/core-tests.mjs:51-60`（`netCost`）、`:95-100`（`normalizeMonth`）、`:126-133`（`parseLocalDateOnly`）、`:165-195`（`parseCSVLine`）测的都是**文件内重新抄写的副本**，注释自称 "standalone, matching js/core/utils.js"。
  **已确认**：`js/core/utils.js` 零 import，在 Node 中可直接 `import()` 成功——无需抄写。
  **后果**：日后若有人改动 `js/core/utils.js` 的 `netCost`（即「未售实体卡按 30 元估算」这条核心业务规则），测试依然全绿。最重要的规则实际未被真正覆盖。

---

# B. 新发现（旧计划未提及）

---

## B1 · 「总游玩时长」把用户选择手动记录的游戏整个丢掉了 · P1

**证据**

`js/ui/dashboard.js:8-9`
```js
// Exclude items where user disabled Steam override (steam_override === false)
const gamesForPlaytime = items.filter(i => i.type !== 'hardware' && i.type !== 'drama' && i.steam_override !== false);
```

`steam_override === false` 在仓库其它每一处的含义都是「**别让 Steam 覆盖我的时长，用我填的**」，不是「把这游戏从统计里删掉」：

- `js/ui/data-table.js:15` — 图标 title 明写 `本地数据`
- `js/ui/item-form.js:128` — 就是个复选框
- `functions/index.js:549` — 只跳过「覆盖 playTime」这一步
- `js/charts/monthly-trends.js:49` — `getTrackedState` 返回 null 后，`:74-77` **回退到 `item.playTime` 本地摊销**，照样计入

### 【v2 新增】意图已可判定，无需再问用户

初版把本条标为「需要人工确认意图」并因此排在 Top 5 第 4。**复核轮找到两条决定性证据，该保留应撤销**：

**① 项目自己的书面规范与 `dashboard.js:9` 直接冲突。** `docs/steam-monthly-playtime-upgrade.md`：

- `:51` — 「**`steam_override === false` 始终尊重本地数据。** 它不参与 Steam 实测层，**继续走原有本地均摊口径**。」
- `:258` — 「`steam_override === false`：只返回本地估算。」
- `:289` — 验收项：「`steam_override === false`、未绑定 Steam App ID、剧集和其他平台的**现有图表行为未回归**。」

「继续走原有本地均摊口径」= 照样计入统计。把它整个从 KPI 中排除，正是 `:289` 明令禁止的回归。

**② git 历史证实这是一次极性反转。** `git log -L 8,10:js/ui/dashboard.js`：

```
9c5433b  const gamesForPlaytime = useSteamData ? games : games.filter(g => !g.steam_app_id);
         // 语义：关掉 Steam 开关时，排除「Steam 来源」的游戏
908480a  const gamesForPlaytime = games.filter(g => g.steam_override !== false);
         // "feat: per-item Steam override…" —— 排除对象从「Steam 源」反转成「手填的那批」
50d8de3  const gamesForPlaytime = items.filter(i => i.type !== 'hardware' && i.type !== 'drama' && i.steam_override !== false);
         // 只补 type 过滤，未动该条件
```

反转前的语义是自洽的（不用 Steam 数据时不计 Steam 游戏的时长）；反转后恰好把「用户明确要求用本地数据」的那批排除掉，与 `:51` 规范相反。全仓库无任何注释/文档/测试支持当前行为。

**影响**：你手动填了时长、并勾掉「以 Steam 为准」的每一款游戏，都会从 KPI「总游玩时长」「平均游玩时长」「单位时间价格」中彻底消失——但同一份数据在「月度趋势图」里被算进去了。**同一页面两个数字互相矛盾，且无任何提示。**

**建议**：删掉 `js/ui/dashboard.js:9` 的 `&& i.steam_override !== false`，并删掉 `:8` 那条误导性注释。一行改动。

**风险/工作量**：低（纯展示层，不写库）。**意图已由项目自身 spec + git 历史判定，属回归修复而非取舍变更。**

**验证**：勾掉某款游戏的 Steam override 并填一个 playTime，刷新后 KPI 总时长应增加该值，且与月度趋势图对得上。

---

## B2 · 类型守卫已写好、已有测试，但生产代码从未调用 · P1

**证据**

`functions/steam-playtime.js:8`
```js
const shouldUseSteamPlaytime = (item) => Boolean(item && item.steam_app_id != null && item.steam_override !== false && item.type !== "drama" && item.type !== "hardware");
```
`:104` 导出；`tools/tests/steam-playtime-tests.mjs:68-70` 有 3 条断言覆盖它。

而 `functions/index.js:10-13` 只 import 了 `getMonthKey` 与 `buildSnapshotChanges` — **`shouldUseSteamPlaytime` 从未被调用**。

实际同步逻辑用更弱的内联判断，缺 `type` 守卫：
- `functions/index.js:243` `if (item.steam_app_id === sg.appid && !usedItemIds.has(item.fb_id))` — 不看 `item.type`
- `functions/index.js:549` `if (item.steam_override !== false && ...)` — 不看 `item.type`
- `functions/index.js:259-289` 模糊匹配阶段同样不限制 type

叠加两个前端事实，构成完整污染路径：
1. `js/services/firestore.js:85` `saveItem` 使用 `{ merge: true }`
2. `js/ui/item-form.js:125-129` 仅在 `type === 'steam'` 时才写 `steam_app_id` / `steam_override`

**【v2 新增】影响面比初版描述的更宽。** `functions/index.js:501-505`：

```js
const snapshot = await db.collection("items").get();
const existingItems = snapshot.docs.map(doc => ({fb_id: doc.id, ...doc.data()}));
const {matched, unmatched} = fuzzyMatch(steamGames, existingItems);
```

`existingItems` 取自**整个 items 集合，无任何 type 过滤**就直接进模糊匹配。所以不只是「把 Steam 游戏改成 Epic」这一条路径——**剧集、硬件、Switch 实体同样会被 Levenshtein 匹配上并绑定 `steam_app_id`**，随后 `:549` 覆盖其 `playTime`。剧集的 `playTime` 本应由 `episodeCount * episodeDuration / 60` 派生（`js/ui/item-form.js:97`），被 Steam 值覆盖后与集数彻底脱钩。

**影响**：把一款游戏从 Steam 改成 Epic（或改成 Switch 实体）后，`merge: true` **不会删掉旧的 `steam_app_id`**。之后每天 04:00 的定时同步（`functions/index.js:622-643`）仍会按 appid 命中它，并**悄悄覆盖你手动填的 playTime**。UI 上看不出来——`js/ui/data-table.js:13` 对非 steam 类型直接不显示来源图标。

**建议**：在 `functions/index.js:10-13` 加 `shouldUseSteamPlaytime` 的 import，然后在 `:243` 与 `:549` 两处判断加 `&& shouldUseSteamPlaytime(item)`；**并给 `:502` 的 `existingItems` 加同一层 type 过滤**，从源头阻止非游戏条目进入模糊匹配。约 4 行。

**风险/工作量**：代码量低，但**需部署 Cloud Functions**，属中风险，须先确认。

**验证**：`node --test tools/tests/steam-playtime-tests.mjs` 保持 7/7；部署后把一条 steam 记录改成 epic，跑一次同步，确认其 `playTime` 不再变化。

---

## B3 · 每天 00:00–08:00，「添加记录」把购入日期预填成昨天 · P1

**证据**

`js/ui/fab.js:31-32`
```js
purchaseDate.value = new Date().toISOString().split('T')[0];
document.getElementById('start-date').value = new Date().toISOString().split('T')[0];
```
`toISOString()` 返回 **UTC** 日期。

实跑复算：
```
fab prefill @03:00 CST 2026-10-16 -> 2026-10-15
```

**影响**：北京时间每天早上 8 点前新增记录，「购入日期」与「开始日期」默认是**昨天**。若未注意直接保存，错误日期写入 Firestore，再经 `normalizeMonth` 落到**上一个月**的柱子里——月度趋势图出现一笔不属于该月的支出。这是会累积的静默数据错误。

**建议**：在 `js/core/utils.js` 增加 `todayLocalISODate()`（复用 `parseLocalDateOnly` 的反向逻辑，用 `getFullYear/getMonth/getDate` 拼接），`js/ui/fab.js:31-32` 改调它。顺带 `js/services/csv.js:194` 的导出文件名有同样问题（仅影响文件名，可一并改）。

**风险/工作量**：低，约 8 行。零构建约束完全满足。

**验证**：把系统时间调到凌晨 3 点（或在 `tools/tests/core-tests.mjs` 加一条断言），预填日期应等于本地今天。

---

## B4 · Chart.js CDN 一挂，整站永久停在骨架屏 · P1

**证据**

`js/main.js:115-116`
```js
const initApp = () => {
    setupChartDefaults();          // initApp 第一句，无 try/catch，无 typeof Chart 判断
```
`js/charts/setup.js:5` `Chart.defaults.color = ...` 直接解引用全局 `Chart`。

`skeleton-loading` 只在两处之一被摘掉：
- `index.html:43` `<body class="... skeleton-loading">`
- `js/main.js:70` `document.body.classList.remove('skeleton-loading')` — 位于 `updateDashboard()` 内，而它要等 `js/main.js:244` 注册回调、`:247` 启动监听后才会触发

已 grep 确认 `js/charts/setup.js` 与 `js/main.js` 中**没有任何 `typeof Chart` 守卫**。

**影响**：Chart.js（`index.html:39` jsdelivr CDN）加载失败时，`initApp` 在第 116 行抛异常直接中断——**Firestore 监听不启动、登录不启动、KPI 不渲染**。页面顶部会显示红色 CDN 警告条（`index.html:19-40`，旧计划已做这部分），但正文永远停在骨架屏。图表挂掉本该只影响图表。

**建议**：
1. `js/main.js:116` 改为 `if (typeof Chart !== 'undefined') { try { setupChartDefaults(); } catch (e) { console.error(e); } }`
2. 或将 `setupChartDefaults()` 移到 `initApp` 靠后，或让 `renderCharts()`（`js/main.js:41`）开头统一 `if (typeof Chart === 'undefined') return;`
3. 让 `document.body.classList.remove('skeleton-loading')` 在 `initApp` 内无条件执行一次，而非只挂在数据回调上

**风险/工作量**：低，约 6 行，不碰业务逻辑。

**验证**：DevTools → Network 将 `cdn.jsdelivr.net` 设为 block，刷新后 KPI 数字、数据表格、登录按钮均应可用，仅图表区显示占位。

---

## B5 · CSV 导入静默丢行，且每次都换掉全部文档 ID · P1

**证据 1（静默丢行）**

`js/services/csv.js:164-168`
```js
export const importCSV = async (text) => {
    const { items: newItems } = parseCSVText(text);   // skipped 被解构丢弃
    await bulkReplaceItems(newItems);
```
`parseCSVText` 明明返回 `{ items, skipped }`（`js/services/csv.js:160`），缺 id/name/type 的行会被 `js/services/csv.js:44` 判为 null 并跳过，但只在 `js/services/csv.js:157-159` `console.warn` 一句。

`js/ui/csv-handlers.js:52-53`
```js
await importCSV(text);
showAlert('导入成功！');
```

**影响**：一份 500 行 CSV 若有 30 行因拼写或空 type 被跳过，你会看到「导入成功！」，然后这 30 条记录**已从线上消失**（因为 `bulkReplaceItems` 先删后插）。唯一线索在浏览器控制台。

**证据 2（文档 ID 全部更换 + 跨标签页可见的空窗）**

`js/services/firestore.js:116-123`
```js
newItems.slice(i, i + BATCH_LIMIT).forEach(item => {
    const newDocRef = doc(itemsCollectionRef);   // 每行都是全新自动 ID
```
`js/services/firestore.js:94` 的 `importing` 标志只在 `:34` 抑制**本标签页**渲染。

**影响**：
- 每次导入后所有 `fb_id` 变化（旧计划已提「两阶段导入」，未做）
- 删除批次（`:109-113`）与插入批次（`:116-123`）之间非原子，**手机或另一标签页上打开的仪表盘会看到数据瞬间归零再回填**
- 写入量为 2N（N 删 + N 插），Firestore 计费翻倍

**建议**（均不违反零构建）：
1. `importCSV` 把 `skipped` 返回给调用方；`js/ui/csv-handlers.js:38` 的确认框改为带摘要的 `showConfirmation(..., true)`（该函数已支持 HTML 模式，见 `js/ui/modals.js:114-135`）。先调一次 `parseCSVText` 做纯本地预演，展示「新增 X 条 / 将删除 Y 条 / 跳过 Z 条（附前几条原因）」，确认后才真写。正好补上 A2 缺的那半。
2. 成功提示改为 `导入成功：X 条`；`skipped > 0` 时改警告色并列出被跳过行号。
3. ID 更换问题短期可接受，但建议在 `docs/` 写明「导入后 fb_id 会变」，避免日后误以为可外链某条记录。

**风险/工作量**：中（改的是破坏性路径）。

**验证**：准备一份故意含 3 行坏数据的 CSV，导入前应看到「跳过 3 条」摘要；取消后线上数据完全不变。

---

## B6 · 「卖出价高于买入价」的平台在成本环形图里凭空消失 · P2

**证据**

`js/charts/cost-distribution.js:30`
```js
const sortedEntries = Object.entries(rawData).filter(([_, v]) => v > 0).sort(...)
```
对比 `js/charts/game-distribution.js:48`
```js
return (i.playTime || 0) > 0 && chartCost(i) !== 0;
```

`git show 74542a8`（"fix: show profitable games in price-time chart"）证实：该次修复**只改了散点图**，把 `> 0` 改成 `!== 0`，环形图遗漏。

同时 KPI 侧无此过滤：`js/ui/dashboard.js:14` `items.reduce((s, i) => s + netCost(i), 0)`。

**影响**：若某平台整体是赚钱的（如 Switch 实体卡倒卖净收益），它在成本环形图上**整块消失**，但负值仍被算进「实际总支出」KPI。结果是环形图各扇区之和 ≠ KPI 总额，且看不出少了什么。

**建议**：`js/charts/cost-distribution.js:30` 改为 `.filter(([_, v]) => v !== 0)`，与散点图口径统一。注意 `js/charts/cost-distribution.js:60-62` 的百分比计算需处理负值（分母用绝对值之和，或负值扇区不显示百分比），否则出现负百分比。

**风险/工作量**：低-中。

**验证**：本地造一条 `purchasePrice: 100, sellPrice: 150` 的记录，环形图应出现该平台的负值扇区，且各扇区代数和等于 KPI。

---

## B7 · 冷启动时 `updateDashboard()` 被触发 5 次，完全没有合并 · P2

**证据**

`updateDashboard`（`js/main.js:69`）被注册为两条链路的回调：
- `js/main.js:244` `setOnDataChange(updateDashboard)` → 触发点 `js/services/firestore.js:29`（IndexedDB 缓存）+ `:38`（Firestore 快照）= **2 次**
- `js/main.js:249` `setupSteamPlaytimeListener(updateDashboard)` → 三个独立 `onSnapshot` 各自 `notify()`：`js/services/steam-playtime.js:40`（months）、`:51`（states）、`:61`（tracking）= **3 次**

已 grep 确认 `js/main.js` 内**无任何 debounce / requestAnimationFrame 合并**。

每次调用都会跑：
- `updateDashboardKPIs()` — 约 15 次全量 `items.filter/reduce`（`js/ui/dashboard.js:6-32`）
- `updateKpiTooltips()` — 约 8 次全量 `filter + sort + slice`，再重建 6 个 tooltip 的 `innerHTML`（`js/ui/dashboard.js:66-207`）
- `getSteamPlaytimeHash()`（`js/main.js:35-39`）将整个 months Map 连同 `minutesByApp` 对象 `JSON.stringify` 一遍
- 拼接一条覆盖 500 条记录 × 19 个字段的哈希字符串（`js/main.js:76`）

**影响**：首屏同样的重活做 5 遍。数据量涨到几百条时直接体现在「打开页面到数字稳定」的耗时上，且后 4 次结果与第 1 次完全相同。

**建议**：在 `js/main.js` 用 rAF 合并：
```js
let dashboardQueued = false;
const scheduleDashboardUpdate = () => {
    if (dashboardQueued) return;
    dashboardQueued = true;
    requestAnimationFrame(() => { dashboardQueued = false; updateDashboard(); });
};
```
然后把 `js/main.js:244` 与 `:249` 注册为 `scheduleDashboardUpdate`。约 8 行，不改计算逻辑。另 `js/main.js:75` 与 `:55` 各算一次 `getSteamPlaytimeHash()`，可在 `updateDashboard` 内算一次传下去。

**风险/工作量**：低。

**验证**：在 `updateDashboard` 首行加 `console.count('dash')`，冷启动应从 5 降到 1–2；`tools/perf_test/load_test.js` 可量化前后差异。

---

## B8 · 月度趋势图 tooltip 每次鼠标移动都对全部条目做两遍摊销计算 · P2

**证据**

`js/charts/monthly-trends.js:310-321`（位于 `createExternalTooltip` 的 formatter 内，即**每次 hover 都执行**；两次调用精确位于 **`:312`** 与 **`:321`**）
```js
const topPlaytimeItems = items
    .filter(i => i.type !== 'hardware')
    .map(item => ({ ...item, monthlyBreakdown: calcMonthlyPlaytime(item, currentMonthStart, currentMonthEnd, month) }))  // 第 1 遍
    ...
const estimatedHours = items
    .filter(i => i.type !== 'hardware')
    .reduce((sum, item) => sum + calcMonthlyPlaytime(item, currentMonthStart, currentMonthEnd, month).estimated, 0);      // 第 2 遍
```
每次 `calcMonthlyPlaytime` 内部走 `getItemMonthlyPlaytime`（`js/charts/monthly-trends.js:61-78`）→ `calcAmortizedPlaytime`（`:36-46`），含多次 `asDate()` 解析。

紧接着 `js/charts/setup.js:71-73` 每次都 `tooltipEl.innerHTML = html` + `void tooltipEl.offsetHeight`（强制同步重排）。

**影响**：鼠标在月度趋势图滑一下，即 `2 × N` 次日期密集计算 + 一次强制重排，每帧重复。库越大越卡，且第 2 遍完全是重复劳动。

**建议**：两遍合成一遍——formatter 开头 `const breakdowns = items.filter(...).map(i => ({ item: i, b: calcMonthlyPlaytime(...) }))`，`topPlaytimeItems` 与 `estimatedHours` 均由此派生。约 6 行，行为等价。

**风险/工作量**：低。

**验证**：DevTools Performance 录制 hover 过程，scripting 时间应约减半；tooltip 数字须逐字不变。

---

## B9 · 「只读模式」的禁用只是视觉的，且那句解释性提示永远显示不出来 · P2

**证据**

`js/ui/auth.js:31-36`
```js
writeButtons.forEach(btn => {
    if (btn) {
        btn.classList.add('readonly-mode-disabled');
        btn.title = '需要管理员权限';
    }
});
```
`css/style.css:266-271`
```css
.readonly-mode-disabled {
    cursor: not-allowed;
    background-color: #d6d0ca;
    opacity: 0.5;
    pointer-events: none;      /* 关键 */
}
```

两个问题：
1. `pointer-events: none` **同时禁用 hover**，所以 `btn.title = '需要管理员权限'` **永远不可能弹出**。为只读访客准备的唯一解释文字是死的。
2. `pointer-events: none` **不阻止键盘激活**。grep 确认 `js/ui/auth.js` 从未设置 `disabled` 属性（`grep -c disabled` = 2，两处均为 class 名字符串 `'readonly-mode-disabled'`）。只读访客可 Tab 聚焦 `import-btn`（`index.html:245`）按回车 → 文件选择器弹出 → 选完文件 → 在 Firestore 规则处被拒 → 看到 `js/ui/csv-handlers.js:56` 那句泛化的「导入失败：...」。

**【v2 修正】实际可达面比初版标题给人的印象小。** `js/ui/auth.js:20-25` 的 `writeButtons` 有 4 个，但其中 3 个另有隐藏手段：

| 按钮 | 是否可达 | 原因 |
|---|---|---|
| `add-item-fab` | 否 | `:30` 整个 `.fab-container` 被加 `hidden` |
| `steam-sync-btn` | 否 | `:39` 直接加 `hidden` |
| `delete-btn` / `save-btn` | 否 | 在 item-modal 内，而 `:37` `tableBody.style.pointerEvents='none'` 挡住了打开它的行点击；`tr` 默认不可聚焦，无键盘入口 |
| **`import-btn`** | **是** | 位于页头，始终可见可聚焦 |

所以**真正受影响的只有 `import-btn` 一个**。初版标题「只读模式的禁用只是视觉的」在字面上成立（确实从未设 `disabled`），但读者容易以为 4 个按钮都能被绕过——不能。

**注意：这不是安全漏洞**——`firestore.rules:11` `allow write: if isAdmin()` 会真正拦住写入，`docs/firebase-security.md:57-60` 的原则也写得很清楚。这纯粹是**体验与可解释性**问题。

附带：`js/ui/auth.js:37` `tableBody.style.pointerEvents = 'none'` 顺带禁掉了数据表格里的**文字选中与复制**。

**文档连带问题**：`docs/firebase-security.md:13` 与 `AGENTS.md` 的 Auth Model 小节都写「form actions disabled」，与实现不符——见 B21。

**建议**：`js/ui/auth.js:31-36` 同时设 `btn.disabled = true`（else 分支恢复 `false`），保留 class 做视觉。`disabled` 会同时屏蔽鼠标与键盘，且浏览器原生显示 title。表格那行改为给 `tbody` 加一个只禁用点击的 class，而非 `pointer-events: none`。

**风险/工作量**：低，约 4 行。

**验证**：以非管理员身份登录 → Tab 到导入按钮按回车应无反应；鼠标悬停应看到「需要管理员权限」；数据表格里的游戏名应可复制。

---

## B10 · 管理员 UID 硬编码在 3 处，而 `firebase deploy` 会连带覆盖线上安全规则 · P2

**证据**

```
firestore.rules:6        request.auth.uid == 'ZPyHfPGUI4elNvRN2Q30ZqfzT6X2'
functions/index.js:24    const ADMIN_UIDS = ["ZPyHfPGUI4elNvRN2Q30ZqfzT6X2"];
js/config/constants.js:2 export const ADMIN_UIDS = ['ZPyHfPGUI4elNvRN2Q30ZqfzT6X2'];
```
三处**当前完全一致**。

`firebase.json:50-52` 把 rules 接进部署：
```json
"firestore": { "rules": "firestore.rules" }
```
而 `AGENTS.md` 与 `README.md:146-149` 都教用户跑**裸的 `firebase deploy`** —— 那会一次性发布 hosting + functions + **rules**。

第 4 份副本：Steam ID `76561199530798696` 出现在 `functions/index.js:21` 与 `index.html:74`（另有 `tools/steam_info/steam_info.py:50`）。

**影响**：换管理员账号时漏改任何一处会出现三种不一致，且都难查：
- 漏改 `firestore.rules` → 新管理员 UI 上看得到按钮，但每次保存都失败
- 漏改 `functions/index.js` → 能编辑数据，但 AI 推荐与 Steam 同步报「只有管理员才能...」
- 漏改 `js/config/constants.js` → 登录后界面仍是只读模式

且因裸 `firebase deploy` 会带上 rules，一次不小心的部署就会把线上权限边界改成仓库当前状态。

**建议**（保持零构建）：
1. `tools/tests/` 加一致性测试：用 `fs.readFileSync` 读三个文件，正则提取 UID，断言集合相同。约 20 行，纯本地。
2. `AGENTS.md` 部署小节明确写出「裸 `firebase deploy` 会同时覆盖线上 Firestore 规则」，日常建议用 `--only hosting` / `--only functions`。
3. Steam ID 收敛到一处。

**风险/工作量**：低（仅加测试与文档，不改行为）。

**验证**：故意把 `js/config/constants.js:2` 的 UID 改一位，新测试应失败。

---

## B11 · `functionRateLimits` 文档永不清理，**其** `expiresAt` 字段是装饰性的；配额按 UTC 日重置 · P2

**证据**

`functions/index.js:49-56`
```js
transaction.set(ref, {
  ...
  expiresAt: admin.firestore.Timestamp.fromMillis(nowMillis + 3 * 24 * 60 * 60 * 1000),
}, {merge: true});
```
grep 确认：`firebase.json` 内**无任何 TTL 配置**，`functions/` 内**无任何清理任务**，`firestore.rules` 也无对应条目（客户端访问由 `firestore.rules:34-36` 默认拒绝兜住，这点正确）。

Firestore 的 TTL 策略只能在控制台/gcloud 配置，**不在仓库中**，故该 `expiresAt` 字段目前纯粹是写给自己看的。

**【v2 限定范围】** 全仓库 `expiresAt` 有**两处**，只有上面这处是装饰性的：

- `functions/index.js:55`（`functionRateLimits`）— 写入后**从不被读取**，无 TTL、无清理任务 → 装饰性。
- `functions/index.js:367-375`（`metadata/steamPlaytimeLock`）— `:371-374` **真的读它做过期判断**，`:384` 有 `releaseSteamPlaytimeLock` 主动删除 → 功能正常，不在本条问题范围内。

初版标题写「`expiresAt` 是装饰性的」未加限定，容易被误读成整个仓库的 `expiresAt` 都无效。

另 `functions/index.js:34`
```js
const dayKey = new Date(nowMillis).toISOString().slice(0, 10);   // UTC 日
```
而定时任务时区为 `functions/index.js:624-625` `timeZone: "Asia/Shanghai"`。

**影响**：
- 每天每函数每管理员产生 1 个文档，永久累积（约 730 个/年）。量不大，但代码里写了 `expiresAt` 会让人误以为会自动消失。
- 「今日调用次数已达上限」的**今日是 UTC 日**，即北京时间**早上 8 点**才重置，不是午夜。

**建议**：
1. 在 `docs/firebase-security.md` 补一句「`functionRateLimits` 需在 Firestore 控制台配置 TTL 策略（字段 `expiresAt`），仓库无法表达此配置」；或在 `scheduledSteamSync` 内顺手删除过期文档（约 8 行）。
2. `dayKey` 改用 Asia/Shanghai 计算，与定时任务时区一致（约 3 行）。

**风险/工作量**：低（文档）/ 中（改函数需部署）。

**验证**：改后在北京时间 00:30 触发限流，应在 00:00（而非 08:00）重置。

---

## B12 · Steam 同步对每款游戏发一次并行单文档读；模糊匹配在循环内重复计算 · P2

**证据 1**

`functions/index.js:411`
```js
const stateDocs = await Promise.all(games.map((game) => db.doc(`steamPlaytimeState/${game.appid}`).get()));
```
`games` 是整个 Steam 库。该句为**每款游戏**发一次独立单文档读，全部并发，**每天 04:00 自动运行**（`:622-643`）。

**证据 2**

`functions/index.js:253-289`
```js
for (const sg of steamGames) {              // G 次
  ...
  for (const item of existingItems) {       // × I 次
    const itemNorm = normalizeName(item.name);   // 每对都重算，item 侧完全可预计算
    ...
    const dist = levenshtein(steamNorm, itemNorm);   // 每次新建 (m+1)×(n+1) 数组
```
`levenshtein`（`functions/index.js:219-232`）每次调用 `Array.from({length: m+1}, () => new Array(n+1).fill(0))`。

**影响**：库有 1000 款、本地 500 条时，仅名称归一化即 50 万次，外加最多 50 万次 Levenshtein（每次一个新二维数组）。全部跑在 `timeoutSeconds: 300, maxInstances: 1`（`:595-597`）的实例内，**每天一次**。同时 1000+ 并发单文档读产生对应 Firestore 读计费，而一次集合查询即可拿到同样数据。

**建议**：
1. `:411` 改为 `await db.collection("steamPlaytimeState").get()` 一次取回（Admin SDK 不受 rules 限制），或分块 `db.getAll(...)`。
2. `:259` 循环外预计算一次 `const itemNorms = existingItems.map(i => ({ item: i, norm: normalizeName(i.name) }))`。
3. 可选：Levenshtein 加长度差剪枝（`Math.abs(m-n) > 2` 直接跳过），因为 `:285` 的判据本身就是 `dist <= 2 && lenDiff <= 3`。

**风险/工作量**：中（改每日自动任务，需部署 + 观察一次真实运行）。

**验证**：`node --test tools/tests/steam-playtime-tests.mjs` 保持 7/7；部署后手动触发一次同步，比对 `metadata/steamSync` 的 `matchedCount` 与改前完全一致（此为性能重写，匹配结果必须逐字不变）。

---

## B13 · 可安全删除的死代码清单（零行为变更）· P2

> **【v2 重大修正】** 初版把 10 条列在一张标着「逐条 grep 验证，**全部 0 引用**」的表里。复核后该全称判断**不成立**：其中 2 条仍有真实引用，照初版清单删除会**直接搞坏散点图的点半径逻辑**。现拆成三张表。

### ① 真·死代码 —— 0 引用，可直接删（8 条）

逐条 grep 计数确认：

| 位置 | 内容 |
|---|---|
| `js/charts/setup.js:117-124` | `destroyAllCharts` — 全仓库仅 1 处命中（定义本身），0 引用，A6 重构留下的旧路径 |
| `js/ui/on-this-day.js:22-25` | `startDate` / `endDate` 算了但从未使用（真正窗口在 `:26-30` 独立构建） |
| `js/ui/csv-handlers.js:3-4` | `parseCSVText`、`bulkReplaceItems`、`updateLastModifiedTimestamp` 三个 import 在文件内仅出现于 import 行 |
| `js/services/csv.js:169` | 一行孤立的 `;` |
| `functions/steam-playtime.js:1` | `MINUTES_PER_HOUR` — 命中 2 处（`:1` 定义、`:102` 导出），无外部引用 |
| `js/charts/monthly-trends.js:49-50` | `:49` 已判 `steam_app_id == null` 返回，`:50` 的三元永远走真分支（死分支，非死符号） |
| `js/ui/modals.js:114` | `export` 前多一个前导空格 |
| `js/ui/dashboard.js:106` | `!['physical','hardware'].includes(g.type)` 中 `'hardware'` 是死条件——`:67` 已过滤掉 hardware |

### ② 冗余包装 —— **有引用**，删除需先内联调用点（1 条，不可当死代码删）

| 位置 | 内容 | 引用点 |
|---|---|---|
| `js/charts/monthly-trends.js:162-169` | `calcMonthlyPlaytime` 只是 `getItemMonthlyPlaytime` 的透传包装；且 `:162-167` 那 6 行 JSDoc 写「from **purchaseDate** to passDate / to today」，实现 `:74-77` 用的是 `getStartDate(item)`（优先 `startDate`）——**注释与实现不符，确认** | `:312`、`:321` |

处理方式：要么删函数、把两个调用点改成直呼 `getItemMonthlyPlaytime`；要么只修那 6 行注释。**不能直接从文件里删掉。**

### ③ 【初版误列，实际在用】`radiusFromContext` —— 不得删除

`js/charts/game-distribution.js:31-34` 的 `radiusFromContext` 有 **2 处真实引用**：

```js
:84    pointRadius: radiusFromContext,
:85    pointHoverRadius: (ctx) => radiusFromContext(ctx) + 1.5,
```

初版把它写进「0 引用可删」表是**错的**——照做会让 Chart.js 收到 `undefined` 的 scriptable 选项，散点图点半径逻辑直接崩。

这里唯一成立的观察是**反方向的**：`:102-109`（glow 数据集）把 `ctx.raw?.rating || 0` → `ratingToRadius(...)` 这套取值逻辑又各自重写了一遍，**应当改成调用 `radiusFromContext`**，而不是删掉它。属可选重构，非清理。

**文档过期**：`AGENTS.md` 写着「The root `index.js` is only a reference copy; treat `functions/index.js` as authoritative.」——已确认**根目录 `index.js` 既不在磁盘上，也不在 `git ls-files` 中**。`firebase.json:21` 也仍在 ignore 一个不存在的文件。

**建议**：删除 ① 的 8 条 + 修正 `AGENTS.md` 那句 + 删掉 `firebase.json:21`。② 择一处理。③ **不动**（或做反向重构）。

**风险/工作量**：**极低**（① 为纯删除，无行为变更）。适合作为第一个练手改动——但**必须按修正后的 8 条执行**。

**验证**：删除后全仓库 grep 各符号应为 0 命中；`node --test tools/tests/*.mjs` 仍全绿（29/29）；本地静态服务器打开页面逐一点一遍五个图表与三个弹窗，**特别确认散点图点的大小仍随评分变化**。

---

## B14 · 表格搜索过滤逻辑复制了 3 份 · P2

**证据** — 同一段过滤逻辑出现在三处：
- `js/ui/data-table.js:46-52`（展开/折叠详情列后重新过滤）
- `js/ui/data-table.js:171-178`（渲染后恢复过滤）
- `js/ui/data-table.js:231-238`（搜索框 debounce 回调）

三处核心行均为：
```js
.filter(td => !td.classList.contains('collapsible-col') || td.classList.contains('expanded'))
```

**【v2 修正】** 初版写「**完全相同的 8 行块**」不准确。逐块 `JSON.stringify` 比对结果：**两两不等**。核心 5 行（`querySelectorAll('tr').forEach` → `Array.from(...td)` → `.filter` → `.map(textContent)` → `.join` → `row.style.display`）逻辑一致，但：

| 块 | 注释 | 缩进 |
|---|---|---|
| `:46-52` | 无 | 4 级 |
| `:171-178` | `// Only search visible columns (not collapsible-col without .expanded)` | 3 级 |
| `:231-238` | `// Only search visible columns (not hidden collapsible columns)` | 3 级 |

三处**注释各不相同**（且第二、三处对同一件事的措辞已经分歧——本身就是复制粘贴失同步的信号）。重复逻辑成立、抽函数建议成立，但应表述为「核心逻辑相同」而非「逐字相同」。

**影响**：日后想让「搜索也能搜到备注列」，必须记得改 3 个地方，漏一个就出现「搜到了但展开后又消失」这类难复现行为。且每次按键都对所有行做 `querySelectorAll('td')` + `textContent` 读取（强制布局）。

**建议**：抽模块内私有函数 `applyRowFilter(tbody, term)`，三处调用。净减少约 12 行。可选优化：建行时把可搜索文本写入 `row.dataset.search`，过滤时只读一个属性。

**风险/工作量**：低。

**验证**：搜索一个只出现在折叠列里的词 → 无结果；点「展开详情」→ 该行出现；再点「折叠」→ 消失。三个动作行为须与改前一致。

---

## B15 · 登录头像回退会把用户昵称发给第三方服务；页面没有 CSP · P2

**证据**

`js/ui/auth.js:68-71`
```js
if (userAvatar) {
    userAvatar.src = user.photoURL ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'A')}&background=random`;
}
```

grep 确认 `index.html` 内**无 `Content-Security-Policy` meta 标签**，`firebase.json:29-38` 设了 4 个安全头（`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`）但**无 CSP**。

**影响**：Google 头像缺失时，账号昵称会以查询字符串形式发给 `ui-avatars.com`。不属严重泄露（仅管理员自己会登录），但它是：一个非必要第三方请求、一个额外首屏依赖（该服务挂了就是破图）、一次 PII 外发。无 CSP 意味着一旦某个 `innerHTML` 路径漏了转义，浏览器侧没有兜底。

**转义基本扎实，但有 1 处漏网**：`js/core/utils.js:118-126` 覆盖 `& < > " '`，绝大多数 `innerHTML` 拼接点的动态值都经过它（`js/ui/data-table.js:150-163`、`js/ui/dashboard.js:77-205`、`js/ui/play-next.js:115-203`、`js/ui/modals.js:84,132`、`js/charts/monthly-trends.js:332-344`、`js/charts/game-sort.js:54-57`）。`js/ui/data-table.js:143` 把 `item.status` 拼接进 class 名，但走 `row.className` 属性赋值（`:147`）而非 innerHTML，**不构成注入**。

**【v2 修正】初版称此块「干净」，实为轻度假阴性。** 反例：

```js
// js/ui/data-table.js:154
<td class="px-4 py-3 whitespace-nowrap">${item.playTime != null ? `${item.playTime}h` : '/'} ${renderSteamSource(item)}</td>
```

`item.playTime` **未经 `escapeHTML` 直接内插**，而同一 `row.innerHTML` 模板里的 `:150-163` 其它每个动态字段都过了转义函数。同行的 `renderSteamSource(item)`（`:12-17`）只返回 4 个静态字符串常量、不内插任何 item 数据，所以该行唯一的未转义动态量就是 `playTime`。

**可利用性评估（诚实）**：**当前不可利用。** `playTime` 在所有写入路径上都被强制为数字或 null——`js/ui/item-form.js:89` 与 `js/services/csv.js:26` 均经 `parseFloatOrNull`（`js/core/utils.js:8-9` 返回 `parseFloat(value)` 或 `null`），Steam 同步写入的也是数字；且 `firestore.rules:11` 限定只有管理员可写。因此这是**加固缺口，不是活跃 XSS**，不应据此把 B15 升为 P1。

顺带修正初版的列举口径：`js/charts/monthly-trends.js:332-344` 与 `js/charts/game-sort.js:54-57` 只是**构造 HTML 字符串**，真正的 `innerHTML` 赋值在 `js/charts/setup.js:71`；另外初版漏列了 `js/ui/on-this-day.js:87`（该处 `escapeHTML(g.name)` + 数字 year/month，经复核**干净**）。

**建议**：`data-table.js:154` 顺手补 `escapeHTML(item.playTime)`（1 处，零风险）；头像回退改为本地生成（首字母 + `PLATFORM_COLORS` 已有色板画 CSS 圆块，约 6 行），彻底去掉第三方请求。CSP 可先在 `firebase.json` headers 加一条，但**必须先枚举全部 CDN 域名**（tailwindcss / jsdelivr / cdnjs / gstatic / googleapis / fonts.gstatic / ui-avatars / firebaseapp / deepseek），漏一个即打挂站点——建议最后做，且需人工确认。

**风险/工作量**：头像回退=低；CSP=中-高。

**验证**：断开 `ui-avatars.com` 后登录，头像位置应显示本地首字母圆块，无破图、无控制台报错。

---

## B16 · 缓存渲染 + 监听失败时，错误提示会被「更新时间」覆盖 · P2

**证据**

两个**互相独立**的异步监听写同一个 DOM 元素 `#last-updated`：

`js/services/firestore.js:41-47`（items 监听失败分支）
```js
const lastUpdated = document.getElementById('last-updated');
if (lastUpdated) lastUpdated.textContent = '数据加载失败';
```

`js/services/firestore.js:57-64`（metadata 监听**成功**分支）
```js
const el = document.getElementById('last-updated');
...
el.textContent = `数据更新于 ${formatted}`;
```

启动顺序为 `js/main.js:247` `setupFirestoreListener()` 后 `:248` `setupMetadataListener()`，但两者回调到达顺序不由代码控制。

同时 `js/core/cache.js` **不存任何时间戳**（`:45-58` 仅 `store.put(items, CACHE_KEY)`），而 `js/services/firestore.js:27-30` 会先用缓存渲染一版。

**影响**：若 items 集合读取失败（网络抖动、规则误改、App Check token 拿不到）而 metadata 读取成功，页面显示**上一次缓存的旧数据**，右上角写着「数据更新于 07/16 14:30」，看起来一切正常。「数据加载失败」那行字被覆盖掉。你以为在看今天的账，其实是三天前的缓存。

**建议**：
1. 引入独立错误标记（如 `data-error` 属性或单独的 `#data-error-banner` 元素），失败时显示，**不复用** `#last-updated`；metadata 回调只在无错误标记时写文案。
2. `js/core/cache.js:45` 存 `{ data: items, cachedAt: Date.now() }`（读取侧 `:34-36` 已兼容「wrapped object」格式，此改动**向后兼容**）；用缓存渲染时在 `#last-updated` 后追加「（缓存）」。

**风险/工作量**：低-中。

**验证**：DevTools 中只 block `firestore.googleapis.com` 的 items 查询（或临时收紧规则后本地跑），页面应明确显示「正在展示缓存数据 / 加载失败」，而非伪装成正常。

---

## B17 · 弹窗 Esc 关闭依赖 DOM 顺序而非 z-index（当前潜伏，未触发）· P3

**证据**

`js/ui/modals.js:38-41`
```js
const openModals = Array.from(document.querySelectorAll('[aria-modal="true"]:not(.hidden)'));
const topModal = openModals[openModals.length - 1];   // DOM 顺序最后一个
```

DOM 顺序 vs z-index（`css/style.css:7-9`：`--z-modal:100` < `--z-modal-fullscreen:110` < `--z-modal-confirm:120`）：

| 弹窗 | DOM 行 | z-index |
|---|---|---|
| item-modal | `index.html:252` | 100 |
| list-modal | `index.html:442` | 100 |
| monthly-chart-fullscreen-modal | `index.html:491` | 110 |
| on-this-day-modal | `index.html:503` | 100 |
| **confirm-modal** | `index.html:514` | **120** |
| **play-next-modal** | `index.html:526` | **100** |

`play-next-modal` 在 DOM 中最后，但 z-index 低于 confirm。**若**将来在「接下来」弹窗上打开一个 alert，Esc 会关掉底下的「接下来」而非上面的提示框。

**诚实标注**：已 grep 全部 `showAlert` / `showConfirmation` 调用点（`js/main.js:213`、`js/ui/csv-handlers.js:18,38,43,48,53,56`、`js/ui/item-form.js:182,193,201`），**目前无任何一个从 play-next 弹窗内触发**，故此 bug 现不会发生。它是脆弱的隐含假设，不是活跃缺陷。

**建议**：`js/ui/modals.js:40` 改为按 `z-index` 取最大者（`getComputedStyle` 读一次），或更简单——把 `confirm-modal` 移到 `index.html` body 最后。后者是纯 HTML 移动，风险最低。

**风险/工作量**：低。优先级最低，可与 B13 一起做。

---

## B18 · Tailwind 用的是官方不建议上生产的 Play CDN，且阻塞首屏 · P2

**证据**

`index.html:38`
```html
<script src="https://cdn.tailwindcss.com" onerror="cdnLoadError('Tailwind CSS')"></script>
```
无 `defer`、无 `async`、**无 `integrity`**（对比 `:39` Chart.js 与 `:40` Font Awesome 均有 SRI）。

**影响**：
1. 这是 Tailwind Play CDN——在浏览器中**运行时编译 CSS** 的 JS 包，Tailwind 官方文档明确标注「不建议用于生产」。它是首屏最大的单一开销之一。
2. 无 `defer`，**阻塞首次绘制**。
3. 无 SRI，CDN 被篡改时浏览器不会拦。

**这是一个真实的取舍，不做粉饰**：正确修法是提供一份预先生成的静态 CSS 文件。生成它需跑一次 Tailwind CLI——**在技术上就是一个构建步骤**，与「零构建」硬约束冲突。故列为「知情选择」而非「待办」：

- **选项 A（推荐，符合约束）**：仅加 `integrity` + `crossorigin`，并给 `<script>` 加 `defer`。**注意**：加 `defer` 会改变样式应用时机，可能出现无样式闪烁（FOUC），需实测。SRI 哈希须从 CDN 实际响应计算，不可凭空编造。
- **选项 B**：接受现状，在 `AGENTS.md` 写明「本项目知情使用 Tailwind Play CDN，代价是首屏多一次运行时编译」，避免日后被误认为疏忽。
- **选项 C**：手动跑一次 Tailwind CLI 生成 `css/tailwind.generated.css` 并**手动固定版本 + 记录来源**（旧计划 `docs/optimization-plan.md:156` 本身即允许此做法：「如需本地 vendor 文件，必须手动固定版本并记录来源」）。这是一次性手工操作，不引入持续构建链——但每次改 class 都要重跑，对零构建体验是实质退化。

**风险/工作量**：A=低，B=零，C=中且改变开发流程。**需用户决定。**

---

# B+. 复核轮补充发现（B19–B23）

以下 5 条由独立复核轮（`docs/audit-verification-2026-10-16.md`）提出，已由原作者逐条重新验证后并入本报告。

---

## B19 · 图表增量重渲的签名字段清单不完备，5 张图中 4 张会静默显示旧数据 · P2（偏上）

**这是本次复核最有价值的一条，初轮完全遗漏。** A6 审的是「签名机制本身做对了」，没审「每张图的字段清单是否覆盖了它实际读取的字段」。

**证据** — `js/main.js:44-48` 的 `chartConfigs` 与各图实际读取字段逐个对照：

| 图 | 签名字段（`main.js`） | 图内实际读取但**签名缺失** | 后果 |
|---|---|---|---|
| `cost` `:44` | purchasePrice, sellPrice, type, sellDate, from, remarks | **`name`**（`cost-distribution.js:66,73` tooltip） | 改名后 tooltip 显示旧名 |
| `time` `:45` | playTime, type, status | **`name`**（`time-distribution.js:62` tooltip） | 同上（另 `status` 在签名里但该图从不读，属无害冗余） |
| `scatter` `:46` | playTime, purchasePrice, sellPrice, rating, type, name, from, remarks | **`sellDate`**（`game-distribution.js:40` → `isUnsoldPhysical` = `utils.js:107` `type==='physical' && !sellDate`） | 给未售实体卡只填卖出日期不填卖出价时，y 轴仍按 30 元估算画 |
| `monthly` `:47` | playTime, purchasePrice, sellPrice, type, status, purchaseDate, startDate, sellDate, passDate, name, episodeCount, episodeDuration | **`rating`**（`monthly-trends.js:344` `renderStars(item.rating)`） | 改评分后 tooltip 星星不更新 |
| **`genre` `:48`** | **仅 sort, type** | **`playTime`、`name`、`rating`**（`game-sort.js:6,9` 用 playTime **决定扇区大小**；`:57` 用 name/rating） | **改时长后整个环形图不刷新** |

**触发路径（已确认真实可达）**：`js/main.js:76` 的外层大 hash **确实包含** name / playTime / rating / sellDate，所以数据变化时 `renderCharts()` 会被调用——但 `:56` 的 `if (window._chartHashes[name] === sig) continue;` 随即把实际重渲挡掉。**外层门开着，内层门锁着。**

`genre` 是最严重的一条：`playTime` 参与 `game-sort.js:9` 的分组求和，所以**每天 04:00 的 Steam 同步更新了时长后（`functions/index.js:622-643`），游戏类型环形图整块停在旧值**，直到整页重载。点「立即同步」后当场就能看到。

**无缓解路径**：`js/ui/chart-controls.js:20`（checkbox→monthly）、`:25`（select→scatter）、`:54`（全屏→monthly）只在用户操作那三个控件时绕过签名重渲，**`cost` / `time` / `genre` 三张图没有任何绕过入口**。

**建议**：给 `js/main.js:44-48` 补齐缺失字段——`cost` +`name`、`time` +`name`、`scatter` +`sellDate`、`monthly` +`rating`、`genre` +`playTime`,`name`,`rating`。**共 8 个词，零风险，零行为变更**（只会让该重渲的图重渲）。

更稳的做法是把签名字段清单**下沉到各图表模块**（每个 `render*Chart` 旁 export 一个 `SIGNATURE_FIELDS` 常量），让「读什么字段」与「签什么字段」写在同一个文件里，从结构上消除这类失同步。约 20 行，仍满足零构建。

**风险/工作量**：低（补字段）/ 中（下沉重构）。

**验证**：改一条记录的 `playTime`（不动 sort/type），不刷新页面，`genre` 环形图应立即重算；改一条记录的 `name`，`cost`/`time` tooltip 应立即显示新名；给一条未售实体卡只填 `sellDate`，`scatter` 的 y 值应从 30 变为 purchasePrice。

---

## B20 · 仓库换行符 CRLF/LF 混用，且单一数据源 `constants.js` 的中文写成 `\u` 转义 · P3

**证据 1（EOL）** — Node 统计 `\r\n` 占比：

```
functions/index.js                 CRLF  389   LF-only  254     ← 文件内部自己就混着
js/core/utils.js                   CRLF  112   LF-only   14
js/main.js                         CRLF  237   LF-only   26
js/charts/game-distribution.js     CRLF  148   LF-only   23
js/services/recommendations.js     CRLF    0   LF-only  280     ← 纯 LF
```

**证据 2（转义）** — `js/config/constants.js:17-31` 的中文标签写成 `硬件设备` / `剧` 这类 `\uXXXX`，而**同一行 `:17` 的 `label: '硬件'` 又是字面 UTF-8**。一行之内两种写法混用，坐实是工具事故产物而非有意为之。仓库历史上确有 `0e63680 fix: 移除 UTF-8 BOM (PowerShell Set-Content 引入)`，说明本仓库反复被 PowerShell 写坏编码。

**影响**：
1. 这是 A3「两段 prompt 裸 diff 报 34 行全不同」的**根因**。任何跨文件一致性检查（含 B10 建议的 UID 一致性测试、未来的 CI）都会被 EOL 噪声干扰。
2. `constants.js` 是 A4 认定的「单一数据源」，却是全仓库最难读的一份，与收敛目标相悖。

**建议**：加 `.gitattributes`（`* text=auto eol=lf`）一次性归一化；把 `constants.js:17-31` 的 `\uXXXX` 还原为字面 UTF-8（纯可读性改动，`PLATFORM_META` 取值不变——已验证 `剧`/`硬件设备` 等值与 `COST_LABELS`/`TIME_LABELS` 完全一致）。

**风险/工作量**：低，但 `.gitattributes` 会产生一次全仓库 diff，**建议单独一个提交**，不要和任何功能改动混在一起。

**验证**：`node -e` 重新统计各文件 CRLF 数应全为 0；`git diff --stat` 在归一化提交之后应为空。

---

## B21 · 两处文档声称「form actions disabled」，但代码从未设置 `disabled` · P3

**证据**：`docs/firebase-security.md:13` — 「Non-admin users are restricted client-side: FAB hidden, **form actions disabled**」。`AGENTS.md` 的 Auth Model 小节同样写 "form actions disabled"。

但 `js/ui/auth.js:31-36` 只加 class + 设 `title`，`grep -c disabled js/ui/auth.js` = 2 且两处均为 class 名字符串，**从未设置 `disabled` 属性**（见 B9）。

**影响**：文档描述了比实现更强的保证。读文档的人（含将来的 AI agent）会以为键盘路径也被封住，实际没有。属文档型假阳性，量级小但会误导后续判断。

**建议**：改为 "form actions visually disabled (class + `pointer-events: none` only; no `disabled` attribute)"。或者——更好的做法是先按 B9 的建议真的加上 `btn.disabled = true`，那样文档就自动变准确了。两处各 1 行。

**风险/工作量**：极低（纯文档）。

---

## B22 · `tools/export_firestore_csv/` 含硬编码 OAuth 凭据，且**未被 `.gitignore` 覆盖** · P2

**证据**：`tools/export_firestore_csv/export_firestore_csv.js:138-139` 硬编码了 `client_id` 与 `client_secret`（值不在本报告中复述）。

关键一点：`git check-ignore -v tools/export_firestore_csv` 返回 **NOT ignored**。`.gitignore:66` 的 `**/.env` 覆盖不到这个 `.js` 文件。目录当前未跟踪（`git status --short` 显示 `?? tools/export_firestore_csv/`）纯因没人 `git add` 过。

**定性（比初版更准）**：这两个值是 **firebase-tools CLI 自身的公开 OAuth 凭据**（上游开源仓库中本来就是明文），称其为「密钥泄露」是夸大。真正的问题是：
1. 把第三方公开凭据抄进本仓库，等于把上游实现细节固化成自己的依赖，上游一改即失效；
2. **一旦有人 `git add .`，凭据连同脚本一起入仓**，而 `.gitignore` 拦不住。

同仓库已有正确做法可参照：`tools/bind_steam_ids/bind_steam_ids.js:26-37` 与 `tools/update_unsold_physical_estimates/` 都是从本机 `~/.config/configstore/firebase-tools.json` 读 token。

**建议**：二选一——① 改为读取本机 firebase-tools 配置（与另两个脚本对齐，约 10 行）；② 在 `.gitignore` 显式加 `tools/export_firestore_csv/` 并补 README 说明为何不入仓。

**风险/工作量**：低。**但优先级高于其 P2 标签所暗示的**——这是一条「一次误操作就永久留在 git 历史里」的路径，且修起来只要一行 `.gitignore`。

**验证**：`git check-ignore -v tools/export_firestore_csv` 应返回匹配行；`git status --short` 不再显示该目录。

---

## B23 · 月度图额外依赖 wall-clock，但签名里没有任何「今天」项 · P3

**证据**：`js/charts/monthly-trends.js:75` 与 `:139` 均用 `new Date()` 作为未完成游戏的摊销终点：

```js
:75   const endDate = (item.status === 'passed' && item.passDate) ? item.passDate : new Date();
:139  const endDate = state ? getHistoryEndDate(effectiveItem, state) : ((item.status === 'passed' && item.passDate) ? asDate(item.passDate) : new Date());
```

而 `js/main.js:47` 的 `monthly` 签名字段中没有任何与「今天」相关的项。

**影响**：未完成游戏的「估算时长」随真实时间推移而变，但页面开着跨过午夜时图表不会重算（签名未变）。量级极小（需长时间挂机不刷新），但与 B19 同源：**签名机制假设「图表只依赖 items 的字段」，而月度图还额外依赖 wall-clock。**

**建议**：低优先。若要修，在 `js/main.js:55` 的 monthly 签名后附当日 `YYYY-MM-DD`（1 行），与 B19 一并处理即可。

**风险/工作量**：极低。

---

# C. 已检查并确认干净的部分

- **XSS 转义（v2 修正：有 1 处例外）**：`js/core/utils.js:118-126` 覆盖完整（`& < > " '`），`js/ui/data-table.js:143` 的 class 名拼接走 `className` 属性赋值（`:147`）而非 innerHTML，不构成注入。**但 `js/ui/data-table.js:154` 的 `${item.playTime}h` 未经 `escapeHTML` 直接内插**——经复核当前不可利用（所有写入路径经 `parseFloatOrNull` 强制为数字，且 `firestore.rules:11` 限管理员写），属加固缺口而非活跃 XSS。详见 B15。除此一处外，`js/ui/dashboard.js`、`js/ui/play-next.js`、`js/ui/modals.js`、`js/ui/on-this-day.js:87`、以及四个图表模块构造的 HTML 字符串，动态值均已转义。
- **Firestore 规则 / 前端只读 UI / Functions 三层一致**：`firestore.rules:11`、`functions/index.js:80`、`:602` 均做真实服务端校验；`docs/firebase-security.md:57-60` 表述准确。`metadata` 白名单 `firestore.rules:15` 与前端实际监听的三个文档（`dashboard` / `steamSync` / `steamPlaytimeTracking`）完全对应。`functionRateLimits` 被默认拒绝规则正确兜住。
- **Chart tooltip 元素不泄漏**：`js/charts/setup.js:46-57` 按 `chart.id` 复用，`js/charts/setup.js:109-114` `destroyChartWithTooltip` 成对移除；`js/ui/chart-controls.js:62-65` 关闭全屏时正确 destroy + `removeChart`。
- **`onSnapshot` 监听不重复注册**：`js/services/firestore.js:18`、`:53`、`js/services/steam.js:35-38`、`js/services/steam-playtime.js:13-15` 均先退订旧的。
- **弹窗监听器不叠加**：`js/ui/modals.js:86-87`、`:138-143` 用 cloneNode 清旧监听；`js/ui/modals.js:163-167` 有 `cleanup()`；`settled` 标志防重复 resolve。焦点陷阱（`:45-61`）与焦点恢复（`:29-32`）均在。
- **表格事件委托**：`js/ui/data-table.js:251-263` 有 `_delegated` 幂等守卫。
- **`netCost` 口径本身正确**：`js/core/utils.js:107-115` 未售实体卡返回固定 30，数据库 `purchasePrice` 保持真实值；`js/charts/monthly-trends.js:111` 与 `js/charts/game-distribution.js:39-44` 均正确经 `isUnsoldPhysical` / `netCost` 走此路。**没有任何前端代码把 30 元估算写回数据库。**
  - **【v2 强验证】** 复核轮用穷举法证实了这条：`js/` 下的 Firestore 写入点只有 4 处——`firestore.js:75`（metadata 时间戳）、`:85`（表单 `itemData`）、`:120`（CSV `item`）、`:134`（备份恢复 `cleanItem`）；而 `netCost` 的全部 21 处引用**无一进入写入路径**，全在展示层（`dashboard.js`、`data-table.js:107/137`、`cost-distribution.js:28/66`、`game-distribution.js:43`、`monthly-trends.js:111/292/293`）。
- **`tools/` 密钥卫生**：`tools/steam_info/.env` 在磁盘但被 `.gitignore:66` 正确忽略，`git ls-files` 确认未跟踪。四个 Node 脚本均从本机 Firebase CLI 配置读 token，仓库内无凭据。`tools/perf_test/node_modules` 与 `results.json` 均正确忽略、未跟踪。
- **AI 推荐 prompt 两份副本当前语义一致**（比对 `functions/index.js:115-148` 与 `js/services/recommendations.js:56-89`，去掉 `\r` 后 34/34 行全等），尚未漂移。**【v2 修正】** 初版称「逐行一致」——字节层面不成立，两文件 EOL 不同（CRLF vs 纯 LF），裸 diff 会报全不同。详见 A3 / B20。
- **Functions 输入校验与限流**：`functions/index.js:93-112` 长度/类型校验齐全；`:31-69` 用事务实现冷却 + 日配额；`:76-77` 启用 App Check 且 `consumeAppCheckToken` 防重放；`:73-75` 有实例与并发上限。
- **`steamPlaytimeMonths` 接近 1MB 时的降级路径**：`functions/index.js:434-464` 有 750KB 阈值判断并回退到 `apps` 子集合，前端 `js/services/steam-playtime.js:28-37` 对应读取子集合。前后端一致。

---

# D. 未验证事项（诚实标注）

- `docs/firebase-security.md:25-30` 声称的 App Check 强制启用、reCAPTCHA Enterprise provider 配置、浏览器 API key 域名白名单——**均为 Firebase 控制台设置，仓库内无法验证**。仅验证了前端确实初始化 App Check（`js/config/firebase.js:21-24`）与 Functions 确实声明 `enforceAppCheck` / `consumeAppCheckToken`。
- `functions/index.js` 所需的 IAM `tokenVerifier` 角色是否已授予——同样只能在 GCP 侧确认。
- 未运行 `tools/perf_test/` 下任何脚本（需 Puppeteer 与浏览器启动），故 B7 / B8 / B12 的性能结论基于**代码路径分析与复杂度推算**，**非实测数字**，实际收益需跑 perf 脚本量化。
- `tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js:24-30` 中 5 个硬编码修复价格是否与线上 Firestore 一致——需读生产数据，超出只读范围。
- **【v2 新增】** B19 的「图表静默显示旧数据」由**签名字段清单与各图实际读取字段的静态对照**推出，未在浏览器中实操复现（本轮只读、未启动本地服务器点验）。字段缺失本身是确凿的（逐个 grep 可见），但「用户实际多久会遇到一次」需跑一遍页面确认。
- **【v2 新增】** B18 的外部事实（Tailwind Play CDN 官方不建议用于生产）已由复核轮查阅 Tailwind 官方文档原文核实：*"The Play CDN is designed for development purposes only, and is not intended for production."* 该条从「未验证」移出。

---

# E. Top 5 建议清单（按 收益 ÷ 风险 排序）

> **【v2 重排】** 初版排序为 B3 → B4 → B13 → B1 → B2。复核后有两处调整：**B1 升至第 1**（`docs/steam-monthly-playtime-upgrade.md:51` 与 git 历史已证实是回归，「需确认意图」的保留撤销，见 B1）；**B13 从第 3 降至第 5**（初版清单误列 2 条仍有引用的代码，必须先按修正后的 8 条执行，见 B13）；**新增的 B19 进第 4**（8 个词的改动，修好 4 张图的静默陈旧）。B2 移出 Top 5，归入下面「需单独一轮」——它是唯一需要部署 Cloud Functions 的项。

## 第一梯队 · 纯前端、无需部署、当场可验证

| 排名 | 项 | 严重度 | 改动量 | 风险 | 理由 |
|---|---|---|---|---|---|
| **1** | **B1** — 删掉 `js/ui/dashboard.js:9` 的 `&& i.steam_override !== false` | P1 | **1 行** | **低** | 收益/风险比最高的一条。**项目自己的 spec（`docs/steam-monthly-playtime-upgrade.md:51`、验收项 `:289`）明确要求本地时长「继续走原有本地均摊口径」，代码与之相反**，git 历史（`908480a`）显示这是一次极性反转回归。一行改动修好「同页面 KPI 与月度趋势图两个数字互相矛盾」，纯展示层、不写库、不部署。 |
| **2** | **B3** — `js/ui/fab.js:31-32` 改用本地日期而非 UTC | P1 | 约 8 行 | **低** | **正在每天发生的静默数据错误**（北京时间早 8 点前新增记录，购入/开始日期默认写成昨天，再经 `normalizeMonth` 落到上一个月）。已实跑复现 `2026-10-16T03:00+08:00 → 2026-10-15`。`js/core/utils.js:94` 已有 `parseLocalDateOnly` 可复用，加一个反向的 `todayLocalISODate()` 即可。可单测。 |
| **3** | **B4** — 给 `setupChartDefaults()` 加 `typeof Chart` 守卫 | P1 | 约 6 行 | **低** | 把「图表 CDN 挂 → **整站永久停在骨架屏**、Firestore 监听与登录都不启动」的全站失效模式，降级为「仅图表不可用」。已 grep 确认全仓库 `typeof Chart` **0 命中**、`skeleton-loading` 只在 `js/main.js:70` 一处被摘除。改动纯防御性，不触碰业务分支；验证方式简单（DevTools block 一个域名）。 |
| **4** | **B19** — 补齐 `js/main.js:44-48` 五张图的签名字段 | P2（偏上） | **8 个词** | **极低** | 改动量最小的一条：往 5 个数组里补 8 个字段名，**零行为变更**（只会让本该重渲的图重渲）。修好 4 张图的静默陈旧，其中 `genre` 图缺 `playTime` 意味着**每日 Steam 同步后环形图整块停在旧值**，点「立即同步」当场可见。 |
| **5** | **B13** — 删除死代码（**修正后的 8 条**）+ 修正 `AGENTS.md` / `firebase.json:21` | P2 | 纯删除 | **极低** | 收益中等、风险接近零，适合走通「改代码 → grep 验证 → 本地跑一遍」的完整流程。**但必须按 v2 修正后的清单执行**：初版 10 条里有 2 条仍有引用（`calcMonthlyPlaytime` 需先内联调用点；`radiusFromContext` **完全不能删**，删了散点图点半径直接崩）。 |

## 第二梯队 · 需部署 Cloud Functions，建议单独一轮

| 项 | 严重度 | 改动量 | 风险 | 说明 |
|---|---|---|---|---|
| **B2** — 把已测试的 `shouldUseSteamPlaytime` 接进 `functions/index.js:243` 与 `:549`，并给 `:502` 的 `existingItems` 加 type 过滤 | P1 | 约 4 行 | **中** | 堵住一条**每天 04:00 自动运行、悄悄覆盖手填时长**的数据污染路径；守卫函数已写好且有 3 条单测。复核发现影响面比初版更宽——`existingItems` 无 type 过滤，**剧集与硬件也会被模糊匹配并绑定 `steam_app_id`**，剧集的 `playTime` 会与集数脱钩。列在第二梯队仅因它是唯一需部署的项。 |
| **B11** — `dayKey` 改用 Asia/Shanghai 计算 | P2 | 约 3 行 | **中** | 与 B2 同一次部署顺带做，省一轮。当前「今日调用上限」在北京时间早 8 点才重置，与 `:624-625` 定时任务的 `Asia/Shanghai` 不一致。 |
| **B12** — Steam 同步性能（`:411` 改集合查询、`:259` 循环外预计算归一化） | P2 | 约 10 行 | **中** | 值得做，但改的是每日自动任务，**建议等 B2 那次部署验证通过后单独做一轮**——B12 是纯性能重写，匹配结果必须逐字不变，与 B2 的行为修正混在一起会难以归因。 |

## 紧随其后的低风险速赢

- **B22** — `.gitignore` 加一行 `tools/export_firestore_csv/`。**一行、零风险**，堵掉「一次 `git add .` 就把 OAuth 凭据永久写进 git 历史」的路径。收益/风险比实际上不输第一梯队，只是严重度低。
- **B7** — `updateDashboard` 加 rAF 合并，约 8 行，冷启动从 5 次全量重算降到 1–2 次，零业务逻辑变更。
- **B14** — 表格搜索三处重复抽成一个函数，净减约 12 行，纯重构（注意三处**注释各不相同**，合并时需挑一句保留）。
- **B21** — 两处文档的「form actions disabled」改为准确表述，2 行；或先按 B9 真的加上 `btn.disabled = true`，文档自动变准。
- **B15（仅头像部分）** — 去掉 `ui-avatars.com` 第三方请求，改本地首字母圆块，约 6 行；顺带补 `data-table.js:154` 的 `escapeHTML`（1 处）。

## 建议暂不触碰

- **B18（Tailwind Play CDN）** — 正确修法（预生成静态 CSS）与「零构建」硬约束直接冲突，是产品取舍而非技术问题。**仍待用户在 A/B/C 三个选项中决定。**
- **B15 的 CSP 部分** — 需枚举 9 个外部域名，漏一个即打挂线上站点，收益/风险比不划算，建议最后做。
- **B20（`.gitattributes` 归一化 EOL）** — 改动本身安全，但会产生**一次全仓库 diff**，必须**单独一个提交**、不与任何功能改动混在一起，否则后续 `git blame` 全部失真。建议在功能修复告一段落后再做。
- **B5（CSV 导入预演摘要）** — 收益高，但改的是**破坏性路径**（先删后插），需要仔细设计与测试，不宜与上面的速赢混在一轮里。

---

# F. 操作记录与声明

## F.1 初轮（审计报告产出）

**本轮未修改任何既有文件、未触碰线上数据。**

实际执行过的操作，供核查：
- 只读命令：`ls`、`find`、`grep`、`sed -n`、`cat`、`diff`、`test -f`、`wc -l`
- 只读 git 命令：`git ls-files`、`git log`、`git show`、`git status --short`
- 两次 `node -e` 内联计算，**仅做本地日期字符串运算**，无 `fs` 写入、无网络请求、无 Firebase 调用
- 一个子代理执行了 `node --test tools/tests/*.mjs`（纯本地单元测试，不连网、不连库）
- **未**运行 `firebase deploy`；**未**运行 `tools/` 下任何写库脚本（`bind_steam_ids.js`、`update_unsold_cost.js`、`update_unsold_physical_estimates.js`、`export_firestore_csv.js` 一律只读未执行）；**未**读写 Firestore
- 审计结束时 `git status --short` 仅显示 `?? tools/export_firestore_csv/`，该未跟踪目录**在审计开始前即已存在**，非本次产生
- 本文档 `docs/audit-report-2026-10-16.md` 为初轮唯一新增文件

## F.2 复核轮（对抗式核查）

由独立 agent 执行，产出 `docs/audit-verification-2026-10-16.md`（复核轮唯一新增文件）。30 条断言判定：25 CONFIRMED / 4 PARTIALLY-CONFIRMED / 0 整体 REFUTED / 0 UNVERIFIABLE，另证伪 B13 的 1 个子条目，并提出 5 条新发现（N1–N5）。同样全程只读、未触碰线上数据。

## F.3 修订轮（本次 v2）

由原作者对复核结论**逐条独立复现**后修订本文件。除本文件外**未修改任何文件、未触碰线上数据**。执行的只读命令：`Read`、`Grep`、`Glob`、`git log -L`、`git check-ignore`、`node -e`（仅统计换行符，无写入）。

复现结果：**复核报告的每一条争议均成立，无一误判**；其 5 条新发现（N1–N5）亦全部成立，其中 N1 经逐图核对后范围比复核描述更广（4 张图而非 2 张有签名缺口）。

---

# G. v2 修订明细（修订日志）

| # | 位置 | 初版内容 | v2 修正 | 性质 |
|---|---|---|---|---|
| 1 | **B13** | 10 条列在「全部 0 引用 / 可安全删除」表内 | 拆为三张表：**8 条真死代码可删** + 1 条冗余包装（`calcMonthlyPlaytime`，`:312/:321` 有引用，需先内联）+ 1 条**误列**（`radiusFromContext`，`game-distribution.js:84/:85` 有 2 处引用，**不得删除**；真正该做的是让 `:102-109` 反过来调用它） | **实质错误** |
| 2 | **摘要** | 「新发现 18 项，其中 P1 级 6 项」 | 实际 B 系列 P1 = **5**（B1–B5），A 系列另有 3（A1/A2/A5），全报告 P1 = 8。并更新为 23 项（含 B19–B23） | **计数错误** |
| 3 | **B1** | 「需要人工确认意图」，排 Top 5 第 4 | 撤销保留：`docs/steam-monthly-playtime-upgrade.md:51/:258/:289` + `git log -L` 的 `908480a` 极性反转，双向证实为回归。**升至 Top 5 第 1** | 结论加强 |
| 4 | **B15 / C 节** | 「所有 `innerHTML` 拼接点的动态值都经过它」「此块是干净的」 | 反例：`js/ui/data-table.js:154` 的 `${item.playTime}h` 未转义。同时给出可利用性评估（当前不可利用，属加固缺口，**不升级严重度**），并修正列举口径（`monthly-trends.js:332-344` / `game-sort.js:54-57` 只构造字符串，真正 `innerHTML` 赋值在 `setup.js:71`；漏列了干净的 `on-this-day.js:87`） | **假阴性** |
| 5 | **A3 / C 节** | 「逐行比对结果：当前一致」 | 语义一致（34/34 去 `\r` 后全等），**字节不一致**：`functions/index.js` CRLF vs `recommendations.js` 纯 LF。根因归入新增的 B20 | **夸大** |
| 6 | **B14** | 「完全相同的 8 行块出现在三处」 | 逐块 `JSON.stringify` 两两不等：核心 5 行逻辑相同，但**三处注释各不相同**、缩进不同。改为「核心逻辑相同」 | **夸大** |
| 7 | **A4** | 标题「5 份」/ 正文「6 份」/ 表格 5 行，三个数字互相矛盾 | 统一为「1 份 canonical + 4 份独立硬编码 + 1 份派生」，表格加「性质」列 | 内部矛盾 |
| 8 | **B9** | 标题「只读模式的禁用只是视觉的」，未界定影响面 | 补充可达性表：4 个 `writeButtons` 中 3 个另有隐藏手段，**真正可达的只有 `import-btn`** | 影响面收窄 |
| 9 | **B11** | 标题「`expiresAt` 是装饰性的」（无限定） | 限定到 `:55`（`functionRateLimits`）；`:367-375`（`steamPlaytimeLock`）的 `expiresAt` **被 `:371-374` 真实消费**，不在问题范围 | 表述失准 |
| 10 | **B2** | 污染路径仅描述「Steam 改成 Epic」 | 补 `functions/index.js:501-505`：`existingItems` 无 type 过滤即进模糊匹配，**剧集/硬件同样会被绑定并覆盖 `playTime`**，影响面更宽；建议同步给 `:502` 加过滤 | 结论加强 |
| 11 | **B17** | 表格写 `monthly-fullscreen` / `on-this-day` | 实际 id 为 `monthly-chart-fullscreen-modal` / `on-this-day-modal`（`chart-controls.js:14` 佐证） | 命名错误 |
| 12 | **A5** | 照抄实现复算（弱验证） | 改用 `import('file:///E:/NewGame/js/core/utils.js')` 加载真源码实跑，输出逐字一致；顺带证实 A11「无需抄写副本」 | 证据加强 |
| 13 | **新增 B19** | — | 5 张图中 **4 张**的签名字段清单不完备（`cost`/`time` 缺 `name`、`scatter` 缺 `sellDate`、`monthly` 缺 `rating`、`genre` 缺 `playTime`+`name`+`rating`），且无缓解路径 | 初轮遗漏 |
| 14 | **新增 B20–B23** | — | EOL 混用 + `constants.js` `\u` 转义；两处文档「form actions disabled」与实现不符；`export_firestore_csv/` 凭据**未被 `.gitignore` 覆盖**；月度图依赖 wall-clock 但签名无「今天」项 | 初轮遗漏 |
| 15 | **E 节 Top 5** | B3 → B4 → B13 → B1 → B2 | **B1 → B3 → B4 → B19 → B13**；B2 移入「需部署，单独一轮」梯队，并与 B11 合并部署、B12 排在其后 | 排序调整 |
| 16 | **D 节** | B18 的 Tailwind 外部事实未核实 | 已由复核轮查阅官方文档原文核实，移出「未验证」；同时补记 B19 为静态对照推出、未在浏览器实操复现 | 状态更新 |

**未改动**：A1、A2、A6、A7、A10、A11、A12、B3、B4、B5、B6、B7、B8、B10、B12、B16、B18 的结论与严重度——复核轮全部判 CONFIRMED，行号准确率接近 100%（无需判 STALE-LINE 的条目）。

---

**审计后待用户确认的问题（v2 已缩减为 2 个）**：

1. ~~**B1 意图确认**~~ —— **已解决**。`docs/steam-monthly-playtime-upgrade.md:51` 与 git 历史（`908480a`）证实为回归，无需再问，直接修。
2. 是否按 v2 重排后的顺序推进（第一梯队 B1 → B3 → B4 → B19 → B13 全为纯前端、无需部署），或先挑其中某几项。
3. **B18（Tailwind Play CDN）** 倾向选项 A / B / C 哪一个。
