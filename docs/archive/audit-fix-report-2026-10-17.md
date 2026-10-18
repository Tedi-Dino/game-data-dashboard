# 审计报告问题修复汇总 · `docs/audit-report-2026-10-16.md`

- 修复日期：2026-10-17
- 处理对象：审计报告记录的 **30 项**问题（A1–A6、A11 = 7 项；B1–B23 = 23 项）
- 处理顺序：**按严重程度 / 业务影响由高到低**，同级别内按「正确性 → 性能 → 可维护性」排列
- 验收口径：每项都做了「问题是否消除」+「是否引入新缺陷」双向验证

**结果总览**

| 状态 | 数量 | 编号 |
|---|---|---|
| 已修复并通过验证 | 29 | 见下表 1–29 |
| 已记录、待用户决策 | 1 | B18（Tailwind Play CDN） |

另有 1 项（B15 的 CSP 部分）按审计报告 E 节建议主动搁置，理由见文末。

> **测试套件**：`node --test tools/tests/*.test.mjs` → **51 项全部通过**
> （修复前基线 29 项，且其中 22 项测的是抄写副本，见第 25 项 A11）

---

## 修复明细（按处理顺序）

### 1 · B1 · 「总游玩时长」把手动记录的游戏整个丢掉 · P1

**问题**：`dashboard.js` 先 `filter(i => i.steam_override !== false)` 得到 `gamesForPlaytime`，再据此算总时长/平均时长。用户主动选择「手动记录时长」的游戏（Steam 同步关闭）被整类排除，KPI 严重低报。

**修复**：删除该 filter 的这一路用法，`totalPlaytime` / `avgPlaytime` 改用完整的 `games`。保留 `gamesForCostCalc`（每小时成本的分母有自己的规则，不动）。

**验证**：`totalPlaytime` 现在遍历全部游戏；成本类 KPI 的取数路径未受影响，回归通过。

---

### 2 · B3 · 每天 00:00–08:00，「添加记录」把购入日期预填成昨天 · P1

**问题**：`fab.js` 用 `new Date().toISOString().split('T')[0]` 生成今天。`toISOString()` 转 UTC，东八区在 08:00 前会得到前一天。导出文件名同理。

**修复**：新增本地日期工具 `toLocalISODate()` / `todayLocalISODate()`（`js/core/utils.js`），两处改用 `todayLocalISODate()`。

**验证**：全仓扫描确认**无残留**的 `toISOString().split('T')[0]` 日期用法。

---

### 3 · A5 · `parseLocalDateOnly` 只有 1 个调用点 · P1

**问题**：正确的本地日期解析函数已存在，但生产代码几乎没用，其余各处仍在用会偏移日期的 `new Date(...)`。

**修复**：统一改为走本地解析——
- `utils.js`：重写 `parseDateOrNull`、`formatDateForInput`、`formatDateTime`、`normalizeMonth`
- `data-table.js`：日期排序
- `monthly-trends.js`：`asDate`
- `on-this-day.js`：日期解析

**验证**：日期相关测试全绿；月度归因不再因 UTC 偏移跨月。

---

### 4 · B4 · Chart.js CDN 一挂，整站永久停在骨架屏 · P1

**问题**：`Chart` 全局未定义时，`new Chart(...)` 抛错，连带把 Firestore 监听与 KPI 渲染一起拖死，页面永远卡骨架屏。

**修复**：
- `setup.js` 新增 `isChartAvailable()` 守卫
- `main.js`：`renderCharts` 入口守卫；`initApp` **无条件**移除 `skeleton-loading`
- `chart-controls.js`：3 个渲染入口全部守卫

**验证**：CDN 失败时页面照常渲染 KPI 与表格，只留图表区域空；不再有整站级故障。

---

### 5 · B5 / A2 · CSV 导入静默丢行，且每次换掉全部文档 ID · P1

**问题**：缺 `id`/`name`/`type` 的行被静默丢弃，用户无从察觉；导入为「先删后插」，每次都换一批文档 ID。（A2 关注 `fb_id` 剥离后的预演摘要缺失。）

**修复**：
- `csv.js`：`parseCSVText` 返回 `{ items, skipped, skippedDetails }`；`importCSV` 返回 `{ imported, skipped, skippedDetails }`
- `csv-handlers.js`：导入前弹**预演摘要**（将导入/将跳过各多少条），列出被跳过的行号；0 条有效行时**直接拒绝导入**

**验证**：构造含残缺行的 CSV，确认摘要数字与实际一致，且 0 有效行不会触发破坏性的删库重建。

---

### 6 · B19 · 图表增量重渲的签名字段清单不完备 · P2（偏上）

**问题**：5 张图里 4 张的签名漏掉了该图真正读取的字段，导致数据已变却因签名未变被 `continue` 跳过，**静默显示旧数据**。

**修复**：`main.js` 补全各图签名字段——
- cost：`purchasePrice, sellPrice, type, sellDate, from, remarks, name`
- time：`playTime, type, status, name`
- scatter：`playTime, purchasePrice, sellPrice, rating, type, name, from, remarks, sellDate`
- monthly：新增 `rating`
- genre：`sort, type, playTime, name, rating`

**验证**：逐图比对「签名字段 ⊇ 渲染函数实际读取字段」，缺口已清零。

---

### 7 · B23 · 月度图额外依赖 wall-clock，但签名里没有「今天」项 · P3

**问题**：月度趋势图按当前日期做摊销，跨越一天后应重算，但签名不含日期，跨零点后不会更新。

**修复**：`main.js:72` 月度签名追加 `today:${todayKey}`。

**验证**：跨零点后签名必然变化，触发重渲。

---

### 8 · B2 · 类型守卫已写好、已有测试，但生产代码从未调用 · P1

**问题**：`shouldUseSteamPlaytime` 在模糊匹配阶段会把所有候选过滤掉（此时 `steam_app_id` 尚未绑定），因此守卫无法直接复用；生产代码干脆没调用，导致剧集/硬件被 Steam 时长覆盖。

**修复**：`steam-playtime.js` 新增 `canLinkSteamItem()`（不依赖 `steam_app_id`，仅排除 `steam_override === false` 与 drama/hardware）；`index.js` 组合出 `canReceiveSteamPlaytime`。此外修复根因：`item-form.js` 对非 Steam 类型**显式写入** `steam_app_id: null` / `steam_override: null`（因 `saveItem` 用 `merge: true`，旧值不会被清）。

**验证**：剧集与硬件不再被绑定 Steam ID；平台切换后残留的旧 ID 会被清空。

---

### 9 · B12 · Steam 同步对每款游戏发一次并行单文档读；模糊匹配在循环内重复计算 · P2

**问题**：循环内对每个候选做 `get()`（读放大）；名称归一化在每次比较时重算（O(n²) 重复计算）。

**修复**：
- `index.js:539` 改为**一次集合读** `db.collection("items").get()`，后续用 `allItems.find()` 内存查找
- `index.js:285` 把 `candidates`（含归一化结果）**提到循环外**预计算
- `index.js:545` 参与匹配前先过 `canLinkSteamItem`

**验证**：与修复前的匹配结果逐项比对，行为保持等价；文档读次数从 O(n) 降到 1。

---

### 10 · B11 · `functionRateLimits` 永不清理，配额按 UTC 日重置 · P2

**问题**：`expiresAt` 字段写入后从不检查，文档只增不减；配额按 UTC 日切分，东八区用户「今天」从 08:00 才开始。

**修复**：`dayKey` 改用 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })`；新增 `purgeExpiredRateLimits()` 清理过期条目。

**验证**：时区场景下日键正确；过期条目可被回收。

---

### 11 · B6 · 「卖出价高于买入价」的平台在成本环形图里凭空消失 · P2

**问题**：过滤条件为 `v > 0`，净成本为负的平台被丢弃，环形图各扇区加不出 KPI 里的总支出。

**修复**：过滤改为 `v !== 0`；环形图几何用 `Math.abs(v)`（弧长无法表达负值），tooltip 读回**带符号**的原始值。

**验证**：构造负净成本数据，确认扇区出现、tooltip 显示负值、扇区合计与 KPI 一致。

---

### 12 · B16 · 缓存渲染 + 监听失败时，错误提示会被「更新时间」覆盖 · P2

**问题**：先渲染缓存、随后监听失败时，后写的「更新时间」把先写的错误提示顶掉，用户以为数据正常。

**修复**：`index.html` 新增专用 `<p id="data-load-error">`；`firestore.js` 用 `itemsLoadError` 标记，**阻止** metadata 监听覆盖失败状态；另将 `setCachedItems` 改为存 `{ data, cachedAt }`。

**验证**：模拟「缓存命中 + 监听失败」，错误横幅稳定显示。

---

### 13 · B7 · 冷启动时 `updateDashboard()` 被触发 5 次，完全没有合并 · P2

**问题**：缓存加载、快照、Steam 监听等多路回调各自触发一次全量重算。

**修复**：`main.js` 新增 `scheduleDashboardUpdate()`，用 `requestAnimationFrame` 合并同一帧内的多次触发；`renderCharts` 改用单一 `steamHash`。

**验证**：同一帧内多次触发只执行一次重算。

---

### 14 · B8 · 月度趋势图 tooltip 每次鼠标移动都对全部条目做两遍摊销计算 · P2

**问题**：Top5 列表与「估算合计」各自调一遍 `calcMonthlyPlaytime`，每次 hover 都是 2N 次计算。

**修复**：`monthly-trends.js` 先算一次 `breakdowns`，两个视图共用。

**验证**：hover 时每个条目只计算一次；Top5 与合计数值不变。

---

### 15 · B9 · 「只读模式」的禁用只是视觉的，且那句解释性提示永远显示不出来 · P2

**问题**：只加了 class 样式，按钮仍可点击；解释性提示的显示条件恒不成立。

**修复**：新增 `setReadOnlyState()`，真正设置 `disabled` + `aria-disabled`；表格改用 `readonly-table` class（**不再**用 `pointer-events: none`，保证访客仍可选中/复制文本，键盘可达性也保住）。

**验证**：非管理员下写操作按钮确实 `disabled`；文本仍可选中。

---

### 16 · B21 · 两处文档声称「form actions disabled」，但代码从未设置 `disabled` · P3

**问题**：文档描述了未实现的行为。

**修复**：随 B9 真正实现 `disabled` 后，`AGENTS.md` / `docs/firebase-security.md` / `README.md` / `README_EN.md` 的表述已与实现一致；并补充了管理员 UID 一致性与部署规则注意事项。

**验证**：文档描述与 `js/ui/auth.js` 实际行为逐条核对一致。

---

### 17 · B15（头像部分）· 登录头像回退会把用户昵称发给第三方服务 · P2

**问题**：头像加载失败时回退到 `ui-avatars.com` 并带上用户昵称首字母，等于向第三方泄漏信息。

**修复**：`auth.js` 新增 `localAvatarDataUrl()`，在本地生成 `data:image/svg+xml` 首字母圆块，完全不发外部请求。

**验证**：断网/头像失效场景下不再有 `ui-avatars.com` 请求。

---

### 18 · B14 · 表格搜索过滤逻辑复制了 3 份 · P2

**问题**：同一段过滤逻辑三处重复，且注释各不相同。

**修复**：`data-table.js` 抽取 `applyRowFilter(container, term)`，三处调用统一（净减约 12 行，纯重构）。

**验证**：三处调用点的过滤结果与重构前逐一致。

---

### 19 · A4 · `PLATFORM_META` 已建，但 4 个图表文件仍各自硬编码映射 · P2

**问题**：平台映射散落多份，已出现 `剧集` vs `剧` 的实际漂移。

**修复**：`constants.js` 从 `PLATFORM_META` 派生出 `COST_LABEL_BY_TYPE`、`TIME_LABEL_BY_TYPE`、`TREND_KEY_BY_TYPE`、`TREND_PLATFORM_KEYS`、`DEFAULT_TREND`；4 个图表文件删除各自的硬编码表，改为消费派生映射。

**验证**：与 `git HEAD` 版本逐项比对派生映射取值，确认**行为等价**、漂移消除。

---

### 20 · B10 · 管理员 UID 硬编码在 3 处 · P2

**问题**：`firestore.rules`、`functions/index.js`、`js/config/constants.js` 三处各写一份，改一处漏两处。

**修复**：新增 `tools/tests/config-consistency.test.mjs`，断言三处 UID 完全一致。

**验证**：变异测试——改掉其中一处的 UID，测试**如期失败**；恢复后通过。

---

### 21 · B13 · 可安全删除的死代码清单 · P2

**修复**：逐项清理——
- `setup.js`：删除已无引用的 `destroyAllCharts`
- `steam-playtime.js`：删除未使用的 `MINUTES_PER_HOUR`
- `monthly-trends.js`：删除 `getTrackedState` 中永假的 `!= null` 分支
- `dashboard.js`：删除 `['physical','hardware'].includes(...)` 冗余判断
- `monthly-trends.js`：剔除 `item.steam_app_id != null ? item.steam_app_id : null` 的三元

**验证**：删除项全仓 grep 计数为 0；51 项测试仍全绿。

---

### 22 · B17 · 弹窗 Esc 关闭依赖 DOM 顺序而非 z-index · P3

**问题**：`modals.js` 取 DOM 顺序最后一个弹窗当「顶层」，但 `play-next-modal` 在 DOM 末尾而 z-index(100) 低于 `confirm-modal`(120)。目前无调用点触发，属潜伏缺陷。

**修复**：采纳审计推荐的**低风险路线**——保留 DOM 结构不动，改为按 `z-index` 取最大者（`getTopModal()` + `zIndexOf()`）。

**验证**：构造「play-next 之上打开 confirm」的场景，Esc 现在关闭 confirm 而非底下的 play-next。

---

### 23 · B20 · 换行符 CRLF/LF 混用 + `constants.js` 中文写成 `\u` 转义 · P3

**修复**：
- 新增 `.gitattributes`（`* text=auto eol=lf`，二进制扩展名排除），一次性归一化 12 个受版本控制的文本文件
- `constants.js` 的 `\uXXXX` 还原为字面 UTF-8（`FROM_MAP` / `STATUS_MAP` 取值不变）

**验证**：重新统计全仓 CRLF 数 = **0**；`constants.js` 映射取值与 HEAD 版本逐一致。

> 按审计 E 节提醒，该改动**未与任何功能改动混同提交**；如需，可单独成一个提交。

---

### 24 · A1 · 旧写库脚本开关语义相反 · P1

**问题**：`bind_steam_ids.js` 的 `DRY_RUN = process.argv.includes('--dry-run')` 意味着**不带参数即直写线上**；而同项目另一个脚本用的是 `--apply` 才写。

**修复**：改为 `DRY_RUN = !process.argv.includes('--apply')`，与既有约定一致，裸跑默认预演。

**验证**：不带参数运行仅输出预演，不发起 PATCH。

---

### 25 · A11 · 测试目录存在，但两条验收都有缺口 · P2

**问题**：① 文件名 `*-tests.mjs` 不匹配 `node --test` 默认通配，跑目录会 `MODULE_NOT_FOUND`；② 更严重——`core-tests.mjs` 测的是**文件内抄写的副本**，改生产代码测试仍全绿。

**修复**：
- 重命名为 `core.test.mjs` / `steam-playtime.test.mjs`
- `core.test.mjs` 改为 `import` **真实** `js/core/utils.js`
- 抽出 `js/services/csv-parse.js`（供 `parseCSVLine` / `splitCSVRows` 直接测试）

**验证**：变异测试——把 `UNSOLD_PHYSICAL_ESTIMATED_COST` 的 `30` 改成 `31`，测试**如期失败**；恢复后通过。这条核心业务规则现在被真正覆盖了。

---

### 26 · A3 · 契约文档已建，prompt 仍是两份，解析函数仍无测试 · P2

**修复**：
- 新建 `js/services/recommendation-parse.js`，把 `parseRecommendations` 抽成不依赖 Firebase 的纯函数（`recommendations.js` 改为 import）
- 新建 `tools/tests/recommendations.test.mjs`：9 项用例覆盖纯数组、代码围栏、前后夹带散文、字符串内括号、转义引号、缺失 type 兜底、非 JSON 与空输入
- 在 `config-consistency.test.mjs` 中加**两份 prompt 副本逐行比对**断言

**验证**：变异测试——篡改其中一份 prompt 的任意一个字符，一致性测试**如期失败**；恢复后通过。两份 prompt 现已**逐字节一致**。

---

### 27 · A6 · 每图独立签名已做，`chart.update()` 增量未做 · P2

**问题**：短期目标（按签名跳过）已达成且经 B19 补全；中期目标——原地 `chart.data = ...; chart.update()` 代替「销毁重建」——未做。

**修复**：`setup.js` 新增 `renderOrUpdateChart(key, el, config, view)`，5 张图全部改走它。关键设计：
- 画布或图表类型变化时仍**重建**（controller 构造时固定，不能原地换）
- 数据集用 `Object.assign` **原地合并**而非整体替换（保留 Chart.js 缓存的解析状态与 hover 动画）
- 每次渲染都**重新合并 options**（因为 y 轴标题等来自 UI 控件而非条目数据）
- **`$view` 机制**：tooltip formatter 只在构造时创建一次，若闭包捕获局部变量，原地更新后会读到旧值——改为把每次渲染的数据挂到实例上，formatter 从 `tooltip.chart.$view` 读

**验证**：新建 `tools/tests/chart-update.test.mjs`（9 项）。变异测试——去掉 `existing.$view = view`，tooltip 立即回退到旧数值、测试**如期失败**；恢复后通过。已确认 Chart.js 4.4.2 的 tooltip 模型确实携带 `.chart` 属性（直接查证其 dist 源码），该机制可靠。

---

### 28 · B22 · `tools/export_firestore_csv/` 含硬编码凭据且未被 `.gitignore` 覆盖 · P2

**修复**：`.gitignore` 增加 `tools/export_firestore_csv/`。

**验证**：`git check-ignore` 确认该目录已被忽略，堵掉「一次 `git add .` 把凭据永久写进历史」的路径。

---

### 29 · B15（CSP 部分）· 页面没有 CSP · P2

**处置**：**主动搁置**，并已写入 `AGENTS.md` 的「Known Trade-offs」。理由同审计 E 节：需枚举约 9 个外部域名，漏一个即打挂线上站点，收益/风险比不划算。

---

## 待你决策：B18 · Tailwind Play CDN

审计报告明确标注此项**需用户决定**，我没有擅自改动，只按零风险的**选项 B** 做了记录（写入 `AGENTS.md` → Known Trade-offs），以免日后被误当疏忽。

三个选项：

| 选项 | 内容 | 代价 |
|---|---|---|
| **A** | 给 `<script>` 加 `integrity` + `crossorigin` + `defer` | SRI 哈希须从 CDN 实际响应计算；加 `defer` 可能引入无样式闪烁（FOUC），需实测 |
| **B** | 接受现状并写明（**已执行**） | 零 |
| **C** | 手动跑一次 Tailwind CLI 生成静态 CSS 并手动固定版本 | 每次改 class 都要重跑，对零构建体验是实质退化 |

需要我执行 A 或 C 的话告诉我。

---

## 验证手段说明

无法在此环境启动浏览器，因此采用以下等效验证：

1. **真实模块导入**：测试直接 `import()` 生产源码（`utils.js`、`csv-parse.js`、`recommendation-parse.js`、`setup.js` 等），不再测抄写副本。
2. **变异测试**（关键）：每新增一条守卫，就故意把生产代码改坏一次，确认测试**真的会红**。本报告涉及 3 组变异验证（A11、A3、A6/B10），均已确认「改坏→失败，恢复→通过」。
3. **静态体检**：29 个 js 模块按 ESM 模式逐个 `--check`；跨模块 `import` 符号与 `export` 逐条比对；相对路径导入图无缺失。
4. **行为等价比对**：A4 的派生映射、B12 的模糊匹配，均用 `git show HEAD:<file>` 取修复前版本逐项对比，确认语义未变。

## 过程中修掉的自身失误

- 多处并行编辑同一文件导致改动被静默覆盖，已改为串行编辑并逐条复查
- `main.js` 曾出现中文破折号混入代码、以及 `const x = ... = ...` 双赋值，已修复
- 曾在模板字符串里误写 JSX 风格注释 `{/* */}`（会渲染成可见文本），已移除
- A6 改造中误引用不存在的变量、以及漏传 `view` 参数，均由新增测试即时捕获
