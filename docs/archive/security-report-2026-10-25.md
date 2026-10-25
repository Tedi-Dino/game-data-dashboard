# 安全与维护审计报告（实施阶段记录）

> **归档状态**：本文件是 2026-10-25 至 2026-10-26 维护实施过程的记录，
> 不是发布状态的快照。最终发布状态见
> [`maintenance-release-2026-10-26.md`](maintenance-release-2026-10-26.md)。
>
> 文中的“实施阶段”“扫描时”均指当时的局部子任务；涉及提交、部署、历史改写和
> 测试结论时，以本文件“最终状态”和发布记录为准，不以实施过程中的中间状态为准。
>
> 开始日期：2026-10-25；收尾日期：2026-10-26

- 初始基线：维护前的 `free-tier`，远端标签
  `pre-maintenance-2026-10-25-free-tier`
- 最终代码提交：`c95cf7e1b0e094a85911bdba92d3606b3f1bef4a`（`free-tier`）
- 扫描范围：当前工作区 + 全部 git 历史 + commit / tag 元数据
- 维护主题：凭证与隐私审计、Git 历史脱敏、批量导入可靠性、CSV 边界、前端
  响应式与可访问性、文档事实修正

## 最终状态

1. 最终前端与数据安全维护代码已在 `free-tier` 提交
   `c95cf7e1b0e094a85911bdba92d3606b3f1bef4a`，本地与 `origin/free-tier`
   一致。`main` 仅完成历史元数据脱敏，功能未合并到 `main`。
2. Git 历史脱敏已完成：`90` 个 commits、`179` 条 identity lines（含 `1`
   个 tagger）中的私人邮箱已替换为 GitHub 已验证的 noreply 地址。公开
   `main`、`free-tier` 和维护前标签通过原子推送完成；最终复审待改写身份行
   为 `0`。原邮箱不写入本仓库或本报告。
3. 改写后校验了提交文件树、作者/提交者名字与时间、提交消息、标签名称与
   注释结构，均保持不变；`git fsck` 通过。无法清除第三方旧克隆、fork 或
   GitHub 侧缓存。
4. 改写前历史和维护前用户工作保存在私人本机
   `.git/maintenance-backups/2026-10-25`；远端标签
   `pre-maintenance-2026-10-25-free-tier` 保留。
5. 最终全量测试 `151/151`、`26` 个 suite 通过，`git diff --check` 无输出。
   本地与线上在 `1440 / 768 / 390 / 360` 四个宽度完成验收：5 张图表正常
   加载、无横向溢出、搜索 0 行后恢复 50 行、三个弹窗均可按 Escape 关闭、
   无 `pageerror`。
6. 仅执行 Firebase Hosting 发布，共 `35` 个运行文件；线上主页及 4 个核心
   资源的 SHA256 与本地一致，响应带 `nosniff`。敏感路径只返回 SPA HTML
   回退，未暴露实际文件。`billingEnabled=false`。
7. 未部署 Firestore 规则或 Functions，未修改凭证、计费、业务数据库或本机
   计划任务。Spark 套餐和原有产品取舍保持不变。
8. 旧 Functions 的 `ACTIVE` 元数据不代表当前可执行；Scheduler API 返回
   `403`，本机也未找到 Steam 同步计划任务，因此不声称云端或定时同步已启用。

## 一、实施阶段技术记录

### 1. 凭证、私钥与私人数据扫描

- 扫描当前文件与历史 blob，未发现真实 API Key、私钥、service-account
  凭据、手机号或类似敏感数据。
- 命中的只有公开 Firebase Web 配置和 firebase-tools 公开 OAuth 客户端。
- 真正需要处理的是 commit / annotated tag 元数据中的私人邮箱；正文和
  文件内容未发现该地址。
- 扫描基线为 89 个 commits、488 个唯一 blob；最终历史为 90 个 commits，
  差额来自本次维护提交。

### 2. Git 历史邮箱审计与脱敏工具

`tools/history_email_scrub/` 只处理 author / committer / tagger 身份邮箱：

- 以 **Buffer** 读取 fast-export，按 `data <N>` 精确跳过 N 字节，避免把
  提交正文、二进制、中文多字节或正文中的假身份行误当作控制区。
- 只改控制区身份邮箱；作者名、时间戳、文件树、提交消息、标签名称、
  tagger 名/时间、标签注释和 ref 名全部保留。
- 默认 dry-run；`--apply` 仅接受独立 bare mirror，并拒绝脚本所在仓库、
  当前工作仓库和非 bare 仓库。旧邮箱只在内存中映射，不写临时文件、不打印。
- 遇到 PGP/SSH 签名提交或签名标签时拒绝处理，不静默去除签名；tagger
  无法识别时在预检阶段拒绝。
- apply 后校验提交数、全部身份邮箱、ref 列表、每个提交的
  `tree + 作者/提交者名字与时间 + 消息`、每个 annotated tag 的名称、
  tagger 与正文，并执行 `git fsck`。
- 该工具本身不直接改写工作仓库；正式脱敏由监工在独立镜像执行，完成校验
  后再原子推送公开 refs。

`tools/tests/history-email-scrub.test.mjs` 覆盖 noreply 校验、Buffer
正文/二进制/多字节不变、假身份行不被误改、轻量/annotated tag 脱敏及结构
保持、签名 tag 拒绝、签名提交拒绝和非 bare 拒绝。

### 3. 批量导入回滚

- Firebase 依赖注入隔离在 `js/services/firestore.js`，纯逻辑移入
  `js/services/bulk-replace-core.js`，可用内存 mock 测试。
- 备份读取发生在任何写操作之前；读取失败直接以 `phase=backup` 失败，
  不执行删除、写入或创建 ref。
- 每个新文档 ref 在 `commitSet` 之前登记为 attempted；即使 commit 已到
  服务器而客户端报错，回滚仍会删除本次尝试创建的 ref。
- 失败时固定先按 400 条分批删除本次 attempted refs，再按 400 条分批恢复
  备份，不触碰本次运行之外的数据；清理或恢复失败时继续处理剩余批次并保留
  首个错误。
- `BulkReplaceError` 包含阶段、attempted/cleaned/backup/restored 数量及
  “数据可能不完整”的警告。`deferredSnapshot` 在回滚完成后应用，避免旧
  快照覆盖新监听结果。
- `tools/tests/bulk-replace.test.mjs` 覆盖成功分批、第二批失败、服务器已
  写入但客户端未知、删除失败、恢复失败、备份读取失败零写入和模块无
  Firebase import。

### 4. CSV 边界与负价格

- `purchasePrice` / `sellPrice` 允许
  `-10,000,000 .. 10,000,000`，用于退款、调整等有限负数；`playTime`、
  `episodeCount`、`episodeDuration` 仍为非负，`rating` 仍为 `0..10`。
- `serializeCSVField()` 将 Firestore Timestamp/Date 转为 ISO；只对字符串
  做 `= + - @` 公式前缀防护，数值 `-50` 不会被当成公式。
- 导出复用同一序列化逻辑，导入继续去除防护，负价格可完整往返。
- `tools/tests/csv-import.test.mjs` 覆盖负价格往返、边界拒绝、数值/文本
  公式防护和导入限制。

### 5. 文档事实修正与前端维护

- 云 API 核查结论：`billingEnabled=false`；`functions:list` 仍可能列出三个
  旧 `ACTIVE` 元数据；Scheduler API 返回 `403`；本机未发现按 `NewGame` /
  `steam_sync/sync.mjs` 注册的同步任务。相关文档统一改为“无可用的计费后端、
  旧元数据不代表可执行、仓库不创建计划任务”。
- 前端完成响应式布局、KPI 对比度、键盘焦点、弹窗焦点陷阱与 Escape、
  tooltip 边缘避让、表格筛选/搜索/排序/分页统一管线和空/加载状态维护。
- 并行 UI 改动曾在实施过程中造成前端测试短暂失败；该问题在最终提交前修复，
  最终全量测试通过。

## 二、验证

```text
$ node --test tools/tests/*.test.mjs
# tests 151 / suites 26 / pass 151 / fail 0

$ git diff --check
# 无输出
```

- 本地与线上 `1440 / 768 / 390 / 360` 四个宽度：5 张图表加载、无横向
  溢出、搜索 0 行后恢复 50 行、三个弹窗 Escape 关闭、无 `pageerror`。
- Firebase Hosting 共发布 `35` 个运行文件；线上主页及 4 个核心资源
  SHA256 与本地一致，响应带 `nosniff`。
- 敏感路径只收到 SPA HTML 回退，未暴露实际文件。
- 管理员验收仅为本地角色模拟：无真实登录、无业务数据库写入、无真实 AI
  调用。

## 三、剩余风险

1. **第三方副本不可控**：无法清理已有旧克隆、fork、本地 reflog、GitHub
   缓存或其他第三方备份；只能保证公开 refs 的当前历史已完成脱敏。
2. **旧 Functions 元数据不可当作运行证据**：计费关闭时函数不可执行，
   Scheduler API 返回 `403`；恢复 Blaze 必须重新部署并实际验证。
3. **Spark 既有取舍未改变**：公开只读数据、App Check `UNENFORCED`、无 CSP、
   DeepSeek Key 存在管理员浏览器 `localStorage`。这些是当前产品决策，不是
   本次维护的遗漏。
4. **本地工具仍使用高权限 OAuth 令牌**：可绕过 Firestore 规则；通过默认
   dry-run、示例文件与本地数据隔离降低误用风险。
5. **验收边界**：管理员流程只做了本地角色模拟，真实登录、真实写入和真实
   AI 调用需在后续人工验收中覆盖。

## 四、发布边界

本次发布只涉及 Hosting；未部署 Firestore 规则或 Functions，未修改凭证、
计费、业务数据库或本机计划任务。发布标签 `maintenance-2026-10-26`
指向已上线的代码提交，线上验收结果见发布记录。
