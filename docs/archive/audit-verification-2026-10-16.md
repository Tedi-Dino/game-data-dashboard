# 对抗式复核报告 · 针对 `docs/audit-report-2026-10-16.md`

- 复核日期：2026-10-16
- 复核性质：**只读**（唯一例外：本文件）。未修改任何既有文件、未读写 Firestore、未执行 `firebase deploy`、未运行 `tools/` 下任何写库脚本。
- 立场：默认假设被复核报告的每条结论都可能错、夸大或行号过时，逐条尝试证伪。
- 判定口径：只有亲自打开文件看到那一行才判 `CONFIRMED`。

**判定汇总**

| 判定 | 数量 | 编号 |
|---|---|---|
| CONFIRMED | 25 | A1 A2 A4 A5 A6 A7 A9 A10 A11 A12 · B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B16 B17 B18 |
| PARTIALLY-CONFIRMED | 4 | A3、B13、B14、B15 |
| REFUTED（整体） | 0 | —（但 B13 有 **1 个子条目被证伪**，见下） |
| UNVERIFIABLE | 0 | — |
| STALE-LINE（整体） | 0 | —（仅个别行号 ±1~2，不影响结论） |

---

# 第一部分 · 判定表

## A 部分

| # | 判定 | 我的独立证据 | 与报告的差异 |
|---|---|---|---|
| **A1** | **CONFIRMED** | `tools/bind_steam_ids/bind_steam_ids.js:22` = `const DRY_RUN = process.argv.includes('--dry-run');`；`:9-10` 用法注释明写 `node ... # live run` / `... --dry-run # preview only`。`tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js:22` = `const APPLY = process.argv.includes('--apply');`。两个脚本的开关语义确实相反。 | 无。严重度 P1 成立——`bind_steam_ids.js` 不带参数即 PATCH 线上。 |
| **A2** | **CONFIRMED** | `js/services/firestore.js:133` = `const { fb_id, ...cleanItem } = item;`（`:132` 注释、`:134` `batch.set(ref, cleanItem)`）。`js/ui/csv-handlers.js:38` = `showConfirmation('导入CSV将覆盖所有现有数据，您确定吗？')` — 无任何条数。 | 无。 |
| **A3** | **PARTIALLY-CONFIRMED** | ①契约文档存在（`docs/ai-recommendation-contract.md`，3665 B）。②`parseRecommendations` 在 `tools/tests/` 中命中数 **0**（已 `grep -rn` 计数）。③两段 prompt **不是逐行一致**：用 Node 逐行比对 `functions/index.js:115-148` vs `js/services/recommendations.js:56-89`，34 行**全部不等**，原因是 `functions/index.js` 该段为 **CRLF**（全文件 389/643 行 CRLF），`recommendations.js` 为 **LF**（0/280 行 CRLF）。去掉 `\r` 后语义 34/34 一致。 | 报告称「逐行比对结果：当前一致，尚未漂移」——**语义对，字节错**。裸 `diff` 会报全部 34 行不同。且此 EOL 分歧本身就是漂移风险信号，报告未提。结论方向（未漂移）仍然成立，故不判 REFUTED。 |
| **A4** | **CONFIRMED** | 逐份打开核对，确有 5 份硬编码 + 1 份派生：`constants.js:16-32`（canonical）、`cost-distribution.js:6-22` COST_LABELS、`time-distribution.js:6-13` TIME_LABELS、`game-distribution.js:7-22` PLATFORM_MAP、`monthly-trends.js:6-27` DEFAULT_TREND+PLATFORM_DATA_KEYS（+`:85-89` typeToKey）、`dashboard.js:119-121` TYPE_TO_PLATFORM（派生✔）。漂移实证：`game-distribution.js:21` = `drama: { label: '剧集', ...}` vs `constants.js:31` = `{ type:'drama', label:'\u5267'(剧) }`。同文件双映射：`cost-distribution.js:27` `COST_LABELS[i.type]` 与 `:65` `COST_TYPE_MAP[label]?.includes(i.type)` 并存。 | 计数瑕疵：标题「仍有 **5** 份硬编码映射」与正文「仓库现有 **6** 份平台映射」自相矛盾（实为 5 份硬编码 + 1 份 canonical/派生）。当前实际漂移只有 `剧集/剧` 这一处。 |
| **A5** | **CONFIRMED**（并已**强验证**） | `utils.js:94` 定义；**真实 `import()` 源码后实跑**（非抄写）：`TZ=Asia/Shanghai`（offset −480）→ `'2026-07-01'`→`2026-07-01`/`2026-07`；`'2026/7/1'`→`2026-06-30`/`2026-06`；`'2026-07-01T00:00:00'`→`2026-06-30`/`2026-06`。与报告表格**逐字一致**。调用点计数：`parseLocalDateOnly` 全仓库 10 处命中，其中生产代码仅 `utils.js:26`（定义 `utils.js:94`），其余 8 处全在 `tools/tests/core-tests.mjs`。裸 `new Date` 残余：`utils.js:14`(parseDateOrNull)、`utils.js:48`(normalizeMonth)、`data-table.js:77/:91/:92`、`monthly-trends.js:32`、`on-this-day.js:36` — 全部实见。 | 无。报告用的是抄写复算，我用的是 `file:///E:/NewGame/js/core/utils.js` 真源码 import，结论更强。 |
| **A6** | **CONFIRMED** | `js/main.js:41-64` 为 `renderCharts`，`:43-49` chartConfigs 含 5 项（cost/time/scatter/monthly/genre），每项独立 `fields`；`:54-57` 逐图比对签名后 `continue`。仍走 `destroyChartWithTooltip()` + `new Chart()`：`cost-distribution.js:34,36`、`game-distribution.js:119`、`game-sort.js:21`、`monthly-trends.js:241`、`time-distribution.js:24`。 | 无。 |
| **A7** | **CONFIRMED** | `js/ui/data-table.js:251-263` = `setupItemsTableClick`；`:254-256` 幂等守卫真实存在：`// Use a flag...` / `if (tbody.dataset._delegated === 'true') return;` / `tbody.dataset._delegated = 'true';`。无残留 per-row 监听。 | 无。 |
| **A9** | **CONFIRMED** | `js/ui/play-next.js:131-146`：非管理员分支 `Array.from(aiSection.children).forEach(el => { if (!el.classList.contains('ai-locked-msg')) el.style.display = 'none'; })` 整块隐藏（含齿轮按钮与 key 输入框）。`index.html:540-566` `ai-section` 内含 `ai-api-key-input`（type=password）。 | 无残留。 |
| **A10** | **CONFIRMED** | 三者一致：`firestore.rules:1-38` 存在且入仓；`firebase.json:50-52` = `"firestore": { "rules": "firestore.rules" }`；`docs/firebase-security.md:17` = "Firestore rules are committed in `firestore.rules` and deployed through `firebase.json`."，`:19-23` 的 Read/Write/Metadata/Steam/Default 五条与 rules 逐条对应。 | 无。 |
| **A11** | **CONFIRMED**（实跑） | `node --test tools/tests/` → `Error: Cannot find module 'E:\NewGame\tools\tests'`（MODULE_NOT_FOUND，失败）。`node --test tools/tests/core-tests.mjs tools/tests/steam-playtime-tests.mjs` → `# tests 29 / # pass 29 / # fail 0`。`js/core/utils.js` 零 import（`grep -n "^import\|require("` 无命中），且我已用 `file:///E:/NewGame/js/core/utils.js` 成功 `import()` —— **可直接测真源码，抄写确无必要**。测试文件确为 `*-tests.mjs`。 | 无。报告的「最重要规则实际未被真正覆盖」成立。 |
| **A12** | **CONFIRMED** | `AGENTS.md` 含 PowerShell `-Encoding utf8` 说明 ✔。新过期描述属实：根目录 `index.js` `ls` 报 No such file、`git ls-files \| grep -x index.js` 无输出；`firebase.json:21` = `"index.js"` 在 hosting ignore 中。 | 无。 |

## B 部分

| # | 判定 | 我的独立证据 | 与报告的差异 |
|---|---|---|---|
| **B1** | **CONFIRMED**（并**显著加强**） | `js/ui/dashboard.js:8-9` 逐字吻合（含注释）。四个对照点全部实见：`data-table.js:15` `title="本地数据"`；`item-form.js:128` `data.steam_override = document.getElementById('steam-override').checked;`；`functions/index.js:549` `if (item.steam_override !== false && steamPlaytimeHours > (item.playTime \|\| 0))`；`monthly-trends.js:49` `getTrackedState` 返回 null 后 `:72-75` 回退 `calcAmortizedPlaytime(item.playTime, getStartDate(item), endDate, ...)` —— **同一款游戏在月度趋势里照算**。「同页面两个数字矛盾」成立。**反证搜索结果：找不到任何支持该排除的注释/文档/测试**（`grep -rn steam_override docs/ README.md AGENTS.md design.md` 仅命中报告自身与 `docs/steam-monthly-playtime-upgrade.md:11`，后者把 `steam_override !== false` 定义为「以 Steam 差量统计」——即**标准语义**，与 dashboard 相反）。**决定性证据（报告没有）**：`git log -L 8,10:js/ui/dashboard.js` 显示——`9c5433b` 原为 `useSteamData ? games : games.filter(g => !g.steam_app_id)`（关 Steam 时**排除 Steam 源**的游戏）；`908480a`（"feat: per-item Steam override…"，含 "KPIs respect per-item steam_override field"）改为 `games.filter(g => g.steam_override !== false)`——**极性被反转**：现在排除的恰是手填的那批。`50d8de3` 只补了 type 过滤，未动该条件。 | 无差异，**但结论强度高于报告**：这不是「可能有意」的取舍，而是一次可追溯的极性反转 bug。报告把 B1 排第 4 并注明「需确认意图」——我的复核认为意图可判定：应修。 |
| **B2** | **CONFIRMED**（并加强） | `functions/steam-playtime.js:8` 定义逐字吻合；`:104` 在 `module.exports` 中导出（第 3 项）。全仓库 `grep -rn shouldUseSteamPlaytime` 命中 **6** 处：仅 `steam-playtime.js:8`（定义）、`:104`（导出）、`tools/tests/steam-playtime-tests.mjs:6,68,69,70`。**`functions/index.js` 0 处**。`functions/index.js:10-13` import 仅 `{ getMonthKey, buildSnapshotChanges }` ✔。`:243` = `if (item.steam_app_id === sg.appid && !usedItemIds.has(item.fb_id))` 无 type 守卫 ✔；`:549` 无 type 守卫 ✔；`:253-289` 模糊匹配无 type 守卫 ✔。污染链前提：`firestore.js:85` = `await setDoc(ref, itemData, { merge: true });` ✔；`item-form.js:125-129` = `if (type === 'steam') { ... }` ✔。**加强点**：`functions/index.js:502` `const existingItems = snapshot.docs.map(doc => ({fb_id: doc.id, ...doc.data()}))` —— 取自**整个 items 集合，无任何 type 过滤**，所以剧集/硬件同样会被模糊匹配并绑定 `steam_app_id`，随后 `:549` 覆盖其 `playTime`。 | 无差异。报告未点出 `existingItems` 无 type 过滤这一环，实际影响比报告描述的更宽（不只是「steam 改成 epic」，drama/hardware 也会被绑）。 |
| **B3** | **CONFIRMED**（实跑） | `js/ui/fab.js:31-32` 两行 `new Date().toISOString().split('T')[0]` 逐字吻合。实跑：`node -e "const d=new Date('2026-10-16T03:00:00+08:00'); console.log(d.toISOString().split('T')[0])"` → **`2026-10-15`**，与报告预期一致。 | 无。 |
| **B4** | **CONFIRMED** | `js/main.js:113-116`：`// --- Initialization ---` / `const initApp = () => {` / `setupChartDefaults();` —— 无 try/catch、无守卫。`js/charts/setup.js:5` = `Chart.defaults.color = '#2d2927';` 直接解引用全局。`grep -rn "typeof Chart"` 全仓库命中数 = **0**（报告「无任何 `typeof Chart` 守卫」**证实**）。`grep -rn skeleton-loading` 命中 **2** 处：`index.html:43`（加）、`js/main.js:70`（删，位于 `updateDashboard` 内）。`setup.js:65,71,73` 确认 external tooltip 每次回调都 `formatter(tooltip)` → `innerHTML` → `void offsetHeight`。 | 无。 |
| **B5** | **CONFIRMED** | `csv.js:164-168`：`export const importCSV = async (text) => {` / `const { items: newItems } = parseCSVText(text);`（`skipped` 被丢弃）/ `await bulkReplaceItems(newItems);` ✔。`:160` = `return { items: newItems, skipped: skippedCount };` ✔。`:44` = `return (!item.id \|\| !item.name \|\| !item.type) ? null : item;` ✔。`:157-159` 仅 `console.warn` ✔。`csv-handlers.js:52-53` = `await importCSV(text); showAlert('导入成功！');` 无条件 ✔。`firestore.js:116-123` 每行 `doc(itemsCollectionRef)` 全新 ID ✔；`:109-113` 删批次 / `:116-123` 插批次之间**无事务**（`writeBatch` 分次 `commit`）✔；`importing` 标志仅在 `:34` 抑制本标签页渲染 ✔。 | 无。 |
| **B6** | **CONFIRMED** | `cost-distribution.js:30` = `Object.entries(rawData).filter(([_, v]) => v > 0)` ✔；`game-distribution.js:48` = `return (i.playTime \|\| 0) > 0 && chartCost(i) !== 0;` ✔。`git show --stat 74542a8` → `js/charts/game-distribution.js \| 6 +++---` / `1 file changed, 3 insertions(+), 3 deletions(-)` —— **只改了散点图**，报告准确。`dashboard.js:14` = `const totalActual = items.reduce((s, i) => s + netCost(i), 0);` 无过滤 ✔。 | 无。 |
| **B7** | **CONFIRMED** | `main.js:244` `setOnDataChange(updateDashboard)` ✔；`:247` `setupFirestoreListener()`、`:248` `setupMetadataListener()`、`:249` `setupSteamPlaytimeListener(updateDashboard)` ✔；`firestore.js:29`（缓存渲染后）、`:38`（快照后）✔；`steam-playtime.js:40`（months）、`:51`（states）、`:61`（tracking）三次 `notify()` ✔。`grep -n "debounce\|requestAnimationFrame\|setTimeout" js/main.js` → **0 命中**。 | 无。 |
| **B8** | **CONFIRMED** | `monthly-trends.js:309-321`：`topPlaytimeItems` 的 `.map(...calcMonthlyPlaytime(...))`（`:312`）与 `estimatedHours` 的 `.reduce(... calcMonthlyPlaytime(...).estimated, 0)`（`:321`）两遍全量计算 ✔。调用时机：`setup.js:65` `const html = formatter(tooltip);` 位于 external handler 内，`:71` `tooltipEl.innerHTML = html;` + `:73` `void tooltipEl.offsetHeight;` —— 每次 tooltip 更新（含仅移动）都执行 ✔。 | 无。行号 `:310-321` 与 grep 精确定位 `:312/:321` 差 2 行，不影响结论。 |
| **B9** | **CONFIRMED** | `auth.js:31-36`：`btn.classList.add('readonly-mode-disabled'); btn.title = '需要管理员权限';` ✔。`grep -c disabled js/ui/auth.js` = **2**，且两处均为字符串 `'readonly-mode-disabled'`（class 名），**从未设置 `btn.disabled` 属性** ✔。`css/style.css:266-271` 含 `pointer-events: none` ✔。`firestore.rules:11` = `allow write: if isAdmin();` ✔（故非安全漏洞成立）。推论 (a) `pointer-events:none` 使 title 无法弹出 — 成立（该属性使元素不再是 pointer 事件目标，`:hover` 与原生 tooltip 均不触发）；推论 (b) 键盘仍可激活 — 成立（`pointer-events` 不影响可聚焦性与键盘激活）。`:37` `tableBody.style.pointerEvents = 'none'` 顺带禁掉文本选中 ✔。 | 无。补充：实际受影响面比报告描述更小——`add-item-fab` 另有父容器 `.fab-container` 加 `hidden`（`:30`），`steam-sync-btn` 直接 `hidden`（`:39`），`delete-btn`/`save-btn` 在 item-modal 内而非管理员打不开（tbody 被 `pointerEvents:none` 挡住行点击）。**真正可达的只有 `import-btn`**。 |
| **B10** | **CONFIRMED**（逐字符） | Node 正则提取三处 UID 并 `===` 比较：`firestore.rules:6` / `functions/index.js:24` / `js/config/constants.js:2` → 三者均为 `ZPyHfPGUI4elNvRN2Q30ZqfzT6X2`，长度 28，`ALL IDENTICAL: true`，`char-by-char equal: true`。`firebase.json:50-52` ✔。`AGENTS.md:38` 与 `README.md:148` 均为裸 `firebase deploy` ✔。Steam ID：`functions/index.js:21` `const STEAM_ID = "76561199530798696";` 与 `index.html:74` `steamcommunity.com/profiles/76561199530798696/` ✔。 | 无。 |
| **B11** | **CONFIRMED** | `functions/index.js:34` = `const dayKey = new Date(nowMillis).toISOString().slice(0, 10);` ✔（UTC 日）。`:49-56` `transaction.set(ref, {... expiresAt: ...}, {merge:true})`，`expiresAt` 在 **`:55`** ✔。全仓库 `grep -rn expiresAt` 命中：`:55`（写）、`:367`、`:371-373`、`:375`（**另一处 lock 的 expiresAt，且被真正读取判断**）。`grep -rn functionRateLimits functions/` 仅命中 `:35`（构造 doc 路径），**无任何删除/清理/TTL**。`firebase.json` 与 `firestore.rules` 均无 TTL。定时时区 `:624-625` = `schedule: "0 4 * * *"` / `timeZone: "Asia/Shanghai"` ✔。 | 报告未提 `functions/index.js:367-375` 存在第二处 `expiresAt`（且是被真正消费的 lock）。故「`expiresAt` 是装饰性的」**仅对 `:55` 那条成立**——表述需限定范围。 |
| **B12** | **CONFIRMED** | `:411` = `const stateDocs = await Promise.all(games.map((game) => db.doc(\`steamPlaytimeState/${game.appid}\`).get()));` ✔。`:253-289` 双层循环，`:261` `const itemNorm = normalizeName(item.name);` 在**内层**每对重算 ✔。`:219-232` `levenshtein` 内 `:221` = `Array.from({length: m + 1}, () => new Array(n + 1).fill(0))` 每次新建二维数组 ✔。`:595-597` = `timeoutSeconds: 300` / `maxInstances: 1` / `concurrency: 1` ✔。 | 无。 |
| **B13** | **PARTIALLY-CONFIRMED**（**含 1 条 REFUTED**） | 逐条 grep 计数：①`destroyAllCharts` 全仓库 **1** 命中（`setup.js:117` 定义本身）→ 0 引用 ✔；②`on-this-day.js:22-25` `startDate`/`endDate` 实见，真正窗口在 `:26-30` 独立构建 ✔；③`csv-handlers.js:3-4` 三个 import（`parseCSVText`/`bulkReplaceItems`/`updateLastModifiedTimestamp`）在文件内仅出现在 import 行，无使用 ✔；④`csv.js:169` 孤立 `;` ✔；⑤`MINUTES_PER_HOUR` 命中 2 处（`:1` 定义、`:102` 导出），无外部引用 ✔；⑥`monthly-trends.js:49-50` `:49` 已判 `steam_app_id == null` 返回，`:50` 三元 `item.steam_app_id != null ? ... : null` 恒走真分支 ✔；⑦`monthly-trends.js:162-169` 为 JSDoc + `:168-169` 纯透传包装 ✔（注释说 `purchaseDate`，实现用 `getStartDate()` 优先 `startDate`，确不符 ✔）；⑧`modals.js:114` = ` export const showConfirmation`（前导空格）✔；⑨`dashboard.js:106` `!['physical','hardware'].includes(g.type)`，`:104` 的 `unfinishedGames` 已由 `:7` 过滤掉 hardware → `'hardware'` 死条件 ✔；⑩**`game-distribution.js:31-34` → REFUTED**：`radiusFromContext` 在 **`:84` `pointRadius: radiusFromContext,`** 与 **`:85` `pointHoverRadius: (ctx) => radiusFromContext(ctx) + 1.5,`** 有 2 处真实引用。另：根目录 `index.js` 不在磁盘、不在 `git ls-files` ✔；`firebase.json:21` ignore 不存在的文件 ✔。 | **报告第 10 条判错**。B13 标题为「可安全删除的死代码清单（零行为变更）」，且在 E 节排 **第 3 名**、标注「收益中等但风险接近零，最适合作为第一个改动」——按报告删掉 `radiusFromContext` 会**直接让散点图点半径逻辑崩掉**（Chart.js 收到 undefined 的 scriptable 选项）。报告的「全部 0 引用」也不成立：`calcMonthlyPlaytime`（第 7 条）在 `:312/:321` 有引用，只是它属于「包装冗余」而非死代码。 |
| **B14** | **PARTIALLY-CONFIRMED** | Node 抽取三块做 `JSON.stringify` 全等比较：`b1===b2: false`、`b1===b3: false`。差异在**注释行**：block1（`:46-53`）**无注释**，block2（`:171-178`）注释为 `// Only search visible columns (not collapsible-col without .expanded)`，block3（`:231-238`）注释为 `// Only search visible columns (not hidden collapsible columns)`；缩进亦不同。三块的** 5 行核心逻辑完全一致**。 | 报告称「**完全相同的** 8 行块出现在三处」——**不逐字相同**。重复逻辑成立、抽函数建议成立，故不判 REFUTED，但「逐字」是夸大。 |
| **B15** | **PARTIALLY-CONFIRMED**（**发现 1 处漏网**） | `auth.js:68-71` ui-avatars URL 实见（`:70` 含 `encodeURIComponent(user.displayName \|\| 'A')`）✔。`grep -n "Content-Security-Policy" index.html firebase.json` → **0 命中** ✔。`firebase.json:33-36` 4 个安全头（块范围 `:29-38`）✔。**反向验证 escapeHTML**：`utils.js:118-126` 覆盖 `& < > " '` ✔。`data-table.js:143` `statusClass` 拼接 + `:147` `row.className = classes.join(' ')` 属性赋值 ✔。**逐点检查报告列举的拼接点**：`dashboard.js:76,84,96,115,180,196,204` 全部 `escapeHTML(...)`/`formatCurrency`/`toFixed`/数字 ✔；`modals.js:84,132` `escapeHTML(message)` ✔；`play-next.js:124,143,188,197` `escapeHTML(...)` ✔；`game-sort.js:54-57` `escapeHTML(label)`/`escapeHTML(item.name...)`/`toFixed` ✔；`monthly-trends.js:332-344` `escapeHTML((item.name\|\|'').substring(0,20))` ✔。**漏网点**：`js/ui/data-table.js:154` = `<td ...>${item.playTime != null ? \`${item.playTime}h\` : '/'} ${renderSteamSource(item)}</td>` —— **`item.playTime` 未经 `escapeHTML` 直接内插**。另：报告列举点不含 `js/ui/on-this-day.js:87 content.innerHTML = htmlContent;`（该处 `escapeHTML(g.name)` + 数字 year/month，**干净**）；报告把 `monthly-trends.js:332-344`、`game-sort.js:54-57` 称为「innerHTML 拼接点」不准确——那里只构造字符串，真正的 `innerHTML` 赋值在 `setup.js:71`。 | 报告「所有 `innerHTML` 拼接点的动态值都经过它」**存在 1 个反例**（`data-table.js:154`）。**但须诚实评估可利用性**：`playTime` 在所有写入路径上都是数字（`item-form.js` 经 `parseFloatOrNull`、`csv.js:26` 经 `parseFloatOrNull`、Steam 同步为数字），且 `firestore.rules:11` 限定只有管理员可写 → **当前不可利用，属加固缺口而非活跃 XSS**。报告判「干净」属轻度假阴性，不建议据此升级严重度。 |
| **B16** | **CONFIRMED** | `firestore.js:41-47`（items 监听 error 分支）写 `#last-updated` = `'数据加载失败'` ✔；`:57-64`（metadata 监听 success 分支）`el.textContent = \`数据更新于 ${formatted}\`` ✔ —— 同一元素。启动顺序 `main.js:247` 后 `:248` ✔，回调到达顺序不由代码控制 ✔。`cache.js:45-58` `setCachedItems` 仅 `store.put(items, CACHE_KEY)`，**无任何时间戳** ✔；读取侧 `:34-36` 已兼容 wrapped（`Array.isArray(result)` / `result && Array.isArray(result.data)`）✔。`firestore.js:27-30` 先缓存渲染 ✔。 | 无。 |
| **B17** | **CONFIRMED** | `modals.js:38-41`：`const openModals = Array.from(document.querySelectorAll('[aria-modal="true"]:not(.hidden)'))` / `const topModal = openModals[openModals.length - 1];` ✔。DOM 行号与 z-index 逐行核对：`index.html:252 item-modal (--z-modal=100)`、`:442 list-modal (100)`、`:491 monthly-chart-fullscreen-modal (--z-modal-fullscreen=110)`、`:503 on-this-day-modal (100)`、`:514 confirm-modal (--z-modal-confirm=120)`、`:526 play-next-modal (100)`；`css/style.css:7-9` 三个变量值 100/110/120 ✔ —— **与报告表格完全一致**。反例搜索：全部 `showAlert`/`showConfirmation` 调用点为 `main.js:213`、`csv-handlers.js:18,38,43,48,53,56`、`item-form.js:182,193,201`。`play-next.js` 全文 `grep showAlert\|showConfirmation` **0 命中**；`main.js:213` 挂在页头 `steamSyncStatus`（非弹窗内）；`item-form.js:*` 触发自 item-modal。play-next 弹窗内无任何 alert/confirm 出口 → **当前确不会触发**，报告的「诚实标注」准确，不需从 P3 升级。 | 无。仅一处命名小差：报告写 `monthly-fullscreen`，实际 id 为 `monthly-chart-fullscreen-modal`。 |
| **B18** | **CONFIRMED**（含外部事实核实） | `index.html:38` = `<script src="https://cdn.tailwindcss.com" onerror="cdnLoadError('Tailwind CSS')"></script>` —— 无 `defer`/`async`/`integrity` ✔；`:39` Chart.js 有 `defer` + `integrity` + `crossorigin` ✔；`:40` Font Awesome 有 `integrity` + `crossorigin` ✔。**外部事实已核实**（非凭印象）：Tailwind 官方文档 Installation → Play CDN 页面原文：*"The Play CDN is designed for development purposes only, and is not intended for production."* → 报告引述成立。 | 无。补充：官方当前示例已改用 `cdn.jsdelivr.net/npm/@tailwindcss/browser@4`，本仓库用的 `cdn.tailwindcss.com` 是同类的旧版 Play CDN，结论不变。 |

---

# 第二部分 · 报告未覆盖的问题

## N1 · 图表字段签名漏掉了图表真正读取的字段（P2，新）

**证据**

`js/main.js:44-48` 的 `chartConfigs`：

```js
{ name: 'cost',    fields: ['purchasePrice','sellPrice','type','sellDate','from','remarks'] },
{ name: 'scatter', fields: ['playTime','purchasePrice','sellPrice','rating','type','name','from','remarks'] },  // 无 sellDate
{ name: 'monthly', fields: ['playTime','purchasePrice','sellPrice','type','status','purchaseDate','startDate','sellDate','passDate','name','episodeCount','episodeDuration'] },  // 无 rating / remarks
```

- `scatter` 走 `js/charts/game-distribution.js:39-43` 的 `chartCost()` → `isUnsoldPhysical(item)` 依赖 **`sellDate`**，但签名里没有 `sellDate`。
- `monthly` 的 tooltip 在 `js/charts/monthly-trends.js:344` 用 `renderStars(item.rating)` 画星，但签名里没有 `rating`。

**影响**：给一条未售实体卡只填 `sellDate` 而不填 `sellPrice`（或改一条记录的 `rating`）时，字段签名不变 → `main.js:56` `if (window._chartHashes[name] === sig) continue;` 跳过重建 → 散点图/月度图**显示旧值**，必须刷新整页才更新。属静默陈旧，且与 A6「仅签名变化者重建」的优化机制同源——报告审了机制本身，没审字段清单的完备性。

**建议**：`scatter` 的 `fields` 补 `'sellDate'`；`monthly` 补 `'rating'`。各 1 个词，零风险。

---

## N2 · 仓库换行符（CRLF / LF）混用，且 `constants.js` 的中文写成 `\u` 转义（P3，新）

**证据**（Node 统计 `\r\n` 占比）：

```
functions/index.js             lines 643  CRLF 389  LF-only 254
js/core/utils.js               lines 126  CRLF 112  LF-only 14
js/main.js                     lines 263  CRLF 237  LF-only 26
js/services/recommendations.js lines 280  CRLF 0    LF-only 280
```

`js/config/constants.js:17-31` 的中文标签全部写成 `\u786c\u4ef6\u8bbe\u5907` / `\u5267` 这类转义，而同仓库其它文件的中文是字面 UTF-8。

**影响**：
1. 这正是 A3 两段 prompt「逐行 diff 全不等」的根因——任何跨文件的逐行比对（包括这次审计和未来的 CI 一致性检查）都会被 EOL 噪声干扰。
2. 历史上有 `0e63680 fix: 移除 UTF-8 BOM (PowerShell Set-Content 引入)`，说明本仓库确实反复被 PowerShell 写坏编码；`constants.js` 的 `\u` 转义大概率是同一类事故的产物。
3. `constants.js` 是「单一数据源」，却是最难读的一份（中文不可直读），与 A4 的收敛目标相悖。

**建议**：加 `.gitattributes`（`* text=auto eol=lf`）一次性归一化；把 `constants.js` 的 `\uXXXX` 还原为字面 UTF-8（纯可读性改动，`PLATFORM_META` 的取值不变，我已验证 `剧`/`硬件设备` 等值与 `COST_LABELS` 完全一致）。

---

## N3 · `docs/firebase-security.md:13` 与实际实现不符（P3，新）

**证据**：`docs/firebase-security.md:13` 写 *"Non-admin users are restricted client-side: FAB hidden, **form actions disabled**"*。但 `js/ui/auth.js:31-36` 只加 class + 设 `title`，**从未设 `disabled`**（见 B9，`grep -c disabled` = 2 且均为 class 名）。`AGENTS.md` 的 Auth Model 小节也写 "form actions disabled"，同样不准。

**影响**：文档描述了比实现更强的保证。读文档的人（含将来的 AI）会以为键盘路径也被封住，实际没有（B9 已证）。这是文档型假阳性，量级小但会误导。

**建议**：改为 "form actions visually disabled (class only; `pointer-events: none`, no `disabled` attribute)"。1 行。

---

## N4 · `tools/export_firestore_csv/export_firestore_csv.js` 硬编码 OAuth client_id/secret —— 但报告定性偏重（P2，修正定性）

**证据**：该文件 `:138` 有 `client_id: '563584335869-...apps.googleusercontent.com'`、`:139` 有 `client_secret: '...'`（值**不在本报告中复述**）。目录当前未跟踪（`git status --short` 显示 `?? tools/export_firestore_csv/`）。

**与报告的差异/补充**：这两个值正是 firebase-tools CLI 的**公开** OAuth 凭据（上游开源仓库中本来就是明文），所以称其为「密钥泄露」会夸大。真正的问题是：①把它抄进本仓库等于把第三方公开凭据固化成自己的实现细节，上游一改就失效；②该目录未跟踪，一旦有人 `git add .` 就会把凭据连同脚本一起入仓。

**建议**：要么改用读取 `~/.config/configstore/firebase-tools.json`（与 `bind_steam_ids.js:26-37`、`update_unsold_physical_estimates.js` 一致的做法），要么在 `.gitignore` 显式排除并加 README 说明。

---

## N5 · `js/charts/monthly-trends.js:75` 用 `new Date()` 作摊销终点，与图表缓存签名的时间无关性冲突（P3，新）

**证据**：`monthly-trends.js:75` `const endDate = (item.status === 'passed' && item.passDate) ? item.passDate : new Date();`（`:139` 同）。而 `main.js:44-48` 的 `monthly` 签名字段中**没有任何"今天"相关项**。

**影响**：未完成游戏的「估算时长」随真实时间推移而变，但页面开着跨过午夜时图表不会重算（签名未变）。量级极小（需长时间挂机），但与 N1 同源：签名机制假设"图表只依赖 items 的字段"，而月度图额外依赖 wall-clock。

**建议**：低优先。若要修，可在 `main.js` 的 monthly 签名后附当日 `YYYY-MM-DD`。

---

# 第三部分 · 跨条目独立验证结果

## 1. 两个日期复算（**用真源码 import，非抄写**）

```
$ export TZ=Asia/Shanghai
$ node --input-type=module -e "import {parseDateOrNull, normalizeMonth} from 'file:///E:/NewGame/js/core/utils.js'; ..."
TZ= undefined | offset(min)= -480
"2026-07-01"          -> parseDateOrNull: 2026-07-01 | normalizeMonth: 2026-07
"2026/7/1"            -> parseDateOrNull: 2026-06-30 | normalizeMonth: 2026-06
"2026-07-01T00:00:00" -> parseDateOrNull: 2026-06-30 | normalizeMonth: 2026-06
```

与报告表格**逐字一致**。验证方式：真源码 `import()`（强验证），非照抄。

## 2. B3 fab 预填复算

```
$ node -e "const d=new Date('2026-10-16T03:00:00+08:00'); console.log(d.toISOString().split('T')[0])"
2026-10-15
```

与报告预期一致 → B3 成立。

## 3. `git show --stat 74542a8`

```
 js/charts/game-distribution.js | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)
```

**只**改了散点图 → B6 成立。

## 4. 没有任何前端代码把 30 元估算写回 Firestore —— **证实干净**

`grep` 全 `js/` 的写入点只有 4 处：`firestore.js:75`（metadata 时间戳）、`:85`（表单，`itemData`）、`:120`（CSV，`item`）、`:134`（备份恢复，`cleanItem`）。`netCost` 的 21 处引用**全在展示层**（`dashboard.js`、`data-table.js:107/137`、`cost-distribution.js:28/66`、`game-distribution.js:43`、`monthly-trends.js:111/292/293`），**无一进入写入路径**。C 节这条判「干净」**成立**。

## 5. 密钥卫生

- `.gitignore:66` = `**/.env` ✔；`git ls-files | grep -i "\.env"` → 无输出 ✔；`tools/steam_info/.env` 在磁盘（47 B）但未被跟踪 ✔。
- `git status --short`（本次复核结束时）：
  ```
  ?? docs/audit-report-2026-10-16.md
  ?? tools/export_firestore_csv/
  ```
  与报告 F 节所述相比**多出一行 `?? docs/audit-report-2026-10-16.md`** —— 这是审计报告自身，属预期，非仓库状态被改动。除此之外无其它变更。

## 6. `tools/` 三条断言

- `tools/export_firestore_csv/export_firestore_csv.js:138-139` 确有硬编码 client_id/secret → **CONFIRMED**（定性修正见 N4）。
- `tools/cost_per_hour/cost_per_hour_trend.py:39` = `with open(csv_path, encoding='utf-8') as f:` → 确缺 `utf-8-sig` → **CONFIRMED**。
- `tools/perf_test/` 目录内容：`cached_test.js / data_render_test.js / load_test.js / node_modules / package-lock.json / package.json / resource_test.js / results.json / warm_detail.js` → **无 README** → **CONFIRMED**。

---

# 第四部分 · 总体可信度评估

## 1. 有多少条被 REFUTED？「P1 级 6 项」还成立吗？

- **整体 REFUTED：0 条**。30 条断言中 25 条 CONFIRMED、4 条 PARTIALLY-CONFIRMED。
- **子条目 REFUTED：1 条** —— B13 清单的最后一项 `js/charts/game-distribution.js:31-34`（`radiusFromContext` 在 `:84/:85` 有真实引用）。
- **另有 3 条存在可复现的夸大/不准**：A3（"逐行一致"在字节层面不成立，CRLF vs LF）、B14（"完全相同的 8 行块"实为注释与缩进不同）、B15（"所有动态值都经过转义"有 1 个反例 `data-table.js:154`）。

**「P1 级 6 项」这个数字不成立**，但错因与我的复核无关——是报告**内部自相矛盾**：

```
$ grep -n "^## B[0-9]* ·.*P1" docs/audit-report-2026-10-16.md | wc -l
5
```

B 系列实际标 P1 的只有 **5** 条（B1/B2/B3/B4/B5），摘要却写「新发现 18 项，其中 P1 级 6 项」。若把 A 系列也算进来，全报告 P1 共 **8** 条（A1/A2/A5 + B1–B5）。**两个口径都对不上 6**。这是报告自身的计数错误，不是严重度判断错误——5 条 P1 我逐条独立复现，**每一条的严重度都站得住**。

## 2. E 节 Top 5 是否被我的核查动摇？

**排序整体仍成立，但两处需要调整：**

| 排名 | 项 | 我的意见 |
|---|---|---|
| 1 | B3 fab 本地日期 | **维持第 1**。实跑复现 `2026-10-15`，8 行修复、零风险、正在每天发生。 |
| 2 | B4 `typeof Chart` 守卫 | **维持第 2**。`typeof Chart` 全仓库 0 命中已证实，失效模式确为全站骨架屏。 |
| 3 | B13 删死代码 | **需降级或改写**。清单第 10 条是**反的**——照单删除会搞坏散点图点半径。且报告称「全部 0 引用」也不成立（`calcMonthlyPlaytime` 有引用）。建议改为「按 9 条执行，跳过 `radiusFromContext`」后再做，或把它挪出「最适合第一个改动」的位置。**这是本次复核最有实际价值的一条修正。** |
| 4 | B1 删 `steam_override` 排除 | **建议升到第 1~2 位，并去掉「需确认意图」的保留**。我用 `git log -L` 找到了报告没有的决定性证据：极性在 `908480a` 被反转过一次，且全仓库无任何文档/注释/测试支持当前行为。`docs/steam-monthly-playtime-upgrade.md:11` 用的是标准语义（与 dashboard 相反）。这不再是"意图不明"，而是"意图可判定为 bug"。 |
| 5 | B2 接 `shouldUseSteamPlaytime` | **维持第 5**，但真实影响面比报告更宽：`functions/index.js:502` 的 `existingItems` 无 type 过滤，剧集/硬件也会被模糊匹配并绑上 `steam_app_id`。修复时应同时考虑给 `existingItems` 加过滤。 |

## 3. C 节「已确认干净」里有没有哪条其实不干净？

**有 1 条不干净，但量级很小：**

- **「XSS 转义：所有 `innerHTML` 拼接点的动态值均经过它」→ 不干净**。`js/ui/data-table.js:154` 的 `${item.playTime}h` 未转义（`escapeHTML` 未包裹）。诚实评估：`playTime` 在所有写入路径都是数字、且写入受 `firestore.rules:11` 限制为管理员 → **当前不可利用**，属加固缺口。建议顺手补 `escapeHTML`，不要据此把 B15 升级为 P1。
- 顺带：报告列举的拼接点**漏了** `js/ui/on-this-day.js:87`（该处干净），并把 `monthly-trends.js:332-344` / `game-sort.js:54-57` 误称为 innerHTML 拼接点（那里只构造字符串，赋值在 `setup.js:71`）——属列举口径不严谨，非结论错误。

**其余 C 节条目我逐条复核后确认干净**，其中两条我做了加强验证：
- 「没有任何前端代码把 30 元估算写回数据库」——已用写入点穷举 + `netCost` 全 21 处引用定位证实（见第三部分第 4 条）。
- 「AI 推荐 prompt 两份副本当前一致」——**语义**一致成立，但字节不一致（CRLF/LF），建议表述改为「语义一致，字节不一致」。

## 4. 一句话总评

这是一份**质量明显高于平均水平**的审计报告：30 条断言里我独立复现了 25 条，行号准确率接近 100%（我未发现需要判 STALE-LINE 的条目），P1/P2 分级经得起挑战，D 节的「未验证事项」诚实标注也属实。**它的缺陷集中在"清单类"条目上**——凡是罗列多项（B13 的 10 条死代码）或声称"完全相同/完全一致"（A3、B14、B15）的地方，都出现了未经逐一验证就下全称判断的问题。真正需要修正的只有一处实质错误（B13 的 `radiusFromContext`），但它恰好落在被推荐为"第一个改动"的那一格上，所以必须在动手前拦住。

---

# 第五部分 · 本轮操作声明

**本轮未修改任何既有文件、未触碰线上数据。** 唯一新增文件为本报告 `docs/audit-verification-2026-10-16.md`（已获得用户许可）。

执行过的命令类别：

- 只读文件读取：`sed -n`、`cat`、`cat -A`、`ls`、`wc -l`
- 只读搜索：`grep -rn`、`grep -c`、Grep 工具
- 只读 git：`git log --oneline`、`git log -S`、`git log -L`、`git log -1 --format=%B`、`git show`、`git show --stat`、`git status --short`、`git ls-files`
- 纯计算/只读 Node（`node -e` / `node --input-type=module -e`，仅 `fs.readFileSync` 与数学运算，无 `fs` 写入、无网络请求、无 Firebase 调用）：UID 逐字符比对、换行符统计、两段 prompt 逐行比对、三块过滤代码全等比对、`COST_LABELS`/`COST_TYPE_MAP` 一致性检查、日期复算
- 本地单测（不连网、不连库）：`node --test tools/tests/`（预期失败）、`node --test tools/tests/core-tests.mjs tools/tests/steam-playtime-tests.mjs`（29/29 通过）
- 一次联网只读文档核实：Tailwind 官方 Play CDN 页面（用于 B18 的外部事实）

**未**运行 `firebase deploy`；**未**运行 `tools/` 下任何写库脚本（`bind_steam_ids.js`、`update_unsold_cost.js`、`update_unsold_physical_estimates.js`、`export_firestore_csv.js` 一律只读未执行）；**未**读写 Firestore。
