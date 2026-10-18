# 项目优化计划

生成日期：2026-07-05

## 范围与结论

本次只阅读并分析项目，没有修改业务代码。重点审阅了入口页、核心状态与工具函数、Firestore/CSV/Steam/AI 服务、UI 模块、Chart.js 图表、Cloud Functions、独立工具脚本和现有性能测试脚本。

整体判断：项目结构已经从单文件演进为清晰的 vanilla JS ES modules，数据流主线明确，`state.items -> KPI/图表/UI` 的方向是健康的；安全方面也已经在多数 `innerHTML` 路径前使用 `escapeHTML`。后续打磨应优先围绕数据写入安全、重复逻辑收敛、性能可观测性和可维护性，而不是引入框架或构建系统。

## P0：数据安全与高风险脚本

### 1. 处理旧的 `tools/update_unsold_cost`

现状：

- `tools/update_unsold_cost/update_unsold_cost.js` 会把未售 Switch 实体卡的 `purchasePrice` 直接改为 30，并写入 `remarks: "预估值"`。
- 这与当前规则冲突：Firestore 中 `purchasePrice` 应保留真实购入价，展示层通过 `netCost(item)` 计算 30 元估算。
- 仓库中已有修复脚本 `tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js`，说明旧脚本曾造成过误迁移。

计划：

- 将旧目录标记为 deprecated，或迁移到 `old/` 并在 README 中明确禁止使用。
- 如果仍需保留，默认必须 dry-run，写入模式改为显式 `--apply`，并在执行前打印强警告。
- 给 `tools/update_unsold_physical_estimates` 补一份 README，说明它是修复脚本，不是日常更新入口。

验收：

- 仓库中不存在默认 live-run 的批量 Firestore 写脚本。
- 所有会改 Firestore 的工具都具备 dry-run 默认路径或明确二次确认。

### 2. 改进 CSV 全量替换的失败恢复策略

现状：

- `js/services/firestore.js` 的 `bulkReplaceItems()` 当前流程是先读取备份，再批量删除，再批量插入，失败时尝试恢复。
- 这比直接覆盖安全，但仍存在窗口期：如果删除成功、插入失败、恢复也失败，线上集合会处于不完整状态。
- 恢复时把备份对象中的 `fb_id` 也写回文档字段，可能造成 Firestore 文档内部多出原本只该在客户端使用的字段。

计划：

- 恢复备份时剥离 `fb_id`，保持数据模型干净。
- 引入导入预演摘要：新增条数、重复 ID、缺失字段、即将删除条数，让用户在最终覆盖前看到影响面。
- 中长期考虑“两阶段导入”：先写入 `imports/{id}/items` 或临时集合，校验完成后再切换，降低主集合被清空的风险。

验收：

- 任意失败路径不会把 `fb_id` 写进 item 文档内容。
- 导入前弹窗展示可核对的影响摘要。

## P1：重复逻辑收敛与一致性

### 3. 抽出共享的 AI prompt 与响应解析契约

现状：

- `js/services/recommendations.js` 与 `functions/index.js` 各自维护了一份几乎相同的推荐 prompt。
- 修改推荐规则时必须同步改前后端，容易漂移。

计划：

- 在零构建约束下，不强行共享 npm 模块；可先建立 `docs/ai-recommendation-contract.md`，记录 prompt 输入字段、输出 JSON schema、错误策略。
- 后续可将 prompt 模板放入一个可复制到前后端的小型纯文本资源，并在文档中声明同步流程。
- 为 `parseRecommendations()` 增加轻量测试样例，覆盖纯 JSON、代码块 JSON、前后带解释文字、字段缺失等情况。

验收：

- prompt 修改有唯一说明源。
- 前端 fallback 与 Cloud Function 的输出契约一致。

### 4. 收敛平台映射与类型映射

现状：

- `js/config/constants.js` 已有 `TYPE_MAP`、`COST_TYPE_MAP`、`TIME_TYPE_MAP`、颜色映射。
- `js/charts/game-distribution.js`、`js/charts/monthly-trends.js`、`js/ui/dashboard.js` 仍各自维护平台分组或 type -> platform 逻辑。

计划：

- 在 `constants.js` 增加统一的平台元数据表，例如 type、display label、cost label、time label、color key、是否硬件。
- 图表和 KPI 从同一元数据派生，避免新增平台时漏改某个图。
- 保留现有展示文案，不做视觉重设计。

验收：

- 新增一个平台类型时，只需要改一处配置。
- 成本饼图、时长饼图、散点图、月度趋势、KPI tooltip 的平台归类一致。

### 5. 统一日期解析策略

现状：

- `normalizeMonth()` 使用 UTC，月度趋势里也有专门注释规避时区偏移。
- 其他模块仍直接 `new Date(dateStr)`，例如 `on-this-day.js`、表格排序、`formatDateForInput()`。

计划：

- 在 `utils.js` 增加 `parseLocalDateOnly()` 或 `parseDateOnlyParts()`，专门处理 `YYYY-MM-DD`。
- 所有只关心日期、不关心具体时刻的场景都改用该工具。
- 补充闰年、月初月末、UTC+8 时区的验证样例。

验收：

- `2026-07-01` 在任意时区都归入 7 月。
- “那年今日”不会因时区把日期偏到前一天。

## P1：性能与渲染体验

### 6. 将全量 chart destroy/recreate 改为可增量更新

现状：

- `main.js` 的 `renderCharts()` 每次数据 hash 变化都会 `destroyAllCharts()`，随后重建所有图。
- 单图控件变化时，局部函数会只重建对应图；但主数据变化仍是全量销毁。

计划：

- 短期：保留 hash，拆分每张图自己的数据签名，只重建受影响图表。
- 中期：对 Chart.js 实例使用 `chart.data = ...; chart.update()`，仅在图表类型或 canvas 变更时 destroy。
- 使用 `tools/perf_test` 记录优化前后的 KPI ready、chart ready 和交互延迟。

验收：

- 导入或 Firestore 更新后，不受影响图表不闪烁。
- 性能脚本输出可比较的优化前后数据。

### 7. 给大表格渲染加上低成本防抖或分片

现状：

- `renderItemsList()` 每次打开详情或数据刷新都会一次性构建所有行，并为每一行绑定 click 监听。
- 当前数据量不大时没问题，但随着记录增加，会成为列表弹窗的主要成本。

计划：

- 改为事件委托：在 `tbody` 上绑定一次 click，通过 `tr.dataset.fb_id` 定位。
- 搜索过滤继续保留 150ms debounce。
- 如果记录超过阈值，再考虑分页或虚拟列表；不提前引入复杂抽象。

验收：

- 表格每次渲染不再创建 N 个行级监听。
- 500 条记录内打开列表和搜索仍流畅。

### 8. 改善外部资源加载与离线失败体验

现状：

- 前端依赖 Tailwind CDN、Chart.js CDN、Font Awesome CDN、Google Fonts、Firebase gstatic 模块。
- 已有 preconnect 和 IndexedDB 数据缓存，但离线或 CDN 失败时主要靠浏览器报错。

计划：

- 为 Chart.js/Tailwind/Font Awesome 加载失败提供可见提示。
- 评估是否将 Font Awesome 的少量图标替换为已有文本/内联图标，减少关键路径外部依赖。
- 不引入构建系统；如需本地 vendor 文件，必须手动固定版本并记录来源。

验收：

- 网络失败时用户能看到明确错误，而不是长期 skeleton。
- 首屏关键 UI 在字体或图标 CDN 失败时仍可读。

## P2：安全与权限边界

### 9. 重新评估浏览器本地 DeepSeek API Key

现状：

- `js/services/recommendations.js` 允许把 DeepSeek API Key 存入 `localStorage` 并由浏览器直连 DeepSeek。
- 这对本地调试方便，但对公开站点不够理想：浏览器存储的 key 易被同源脚本读取，也可能被误用于生产。

计划：

- 在 UI 文案中明确“仅建议本地调试使用”。
- 生产默认隐藏本地直连入口，或仅管理员登录后显示。
- 优先使用 Cloud Function + Firebase Secret 作为主路径。

验收：

- 普通访客不会看到或误用本地 API Key 配置入口。
- README/AGENTS 中明确本地 key 风险。

### 10. 给 Firebase 配置与规则补安全说明

现状：

- Firebase Web config 暴露在前端是正常现象，但真正安全依赖 Firestore Rules、Functions 权限校验和 Auth。
- Cloud Functions 已做 admin UID 校验；前端也隐藏管理员操作，但 Firestore 规则未在仓库中看到。

计划：

- 若规则由 Firebase 控制台维护，补文档说明规则位置与期望策略。
- 若希望纳入仓库，增加 `firestore.rules` 和部署说明。
- 确保客户端只读 UI 不是唯一权限边界。

验收：

- 项目文档能回答“非管理员为什么不能写 Firestore”。
- Functions 与 Firestore 的权限模型一致。

## P2：质量保障与工具化

### 11. 建立最小测试矩阵，不引入前端构建

现状：

- 前端无测试套件，但 `tools/perf_test` 已经有 Puppeteer 脚本。
- 核心逻辑如 CSV parser、`netCost()`、日期归月、AI JSON 解析都适合用轻量 Node 测试覆盖。

计划：

- 增加 `tools/tests/`，使用 Node 内置 `node:test` 或简单脚本，不加全局构建。
- 优先覆盖：
  - `netCost()` 未售实体/已售实体/免费/赠送。
  - CSV 引号、逗号、换行、BOM、重复 ID。
  - `normalizeMonth()` 和日期解析。
  - `parseRecommendations()` 的容错。
- 给 `tools/perf_test` 增加 README，说明端口、依赖安装位置和输出文件。

验收：

- 常见数据规则有可重复验证脚本。
- 性能测试结果不会被误提交，输出目录进入 `.gitignore`。

### 12. 清理文档编码与历史上下文

现状：

- 文件本身是 UTF-8，但 PowerShell 默认读取时可能显示乱码。
- `CLAUDE.md` 是 legacy，`AGENTS.md` 是当前准则。

计划：

- 在 README 或 AGENTS 中补充 Windows PowerShell 建议：读取中文文件使用 `-Encoding utf8`。
- 保持 `CLAUDE.md` 只作历史资料，不从中同步新约束。

验收：

- 新协作者在 Windows 下不会误判中文文件损坏。
- 当前项目约束只维护在 `AGENTS.md`。

## 建议实施顺序

1. 先处理高风险写数据脚本和 CSV 恢复时写入 `fb_id` 的问题。
2. 再收敛平台映射、AI prompt、日期解析这些会持续制造维护成本的重复逻辑。
3. 然后做表格事件委托与图表增量更新，用现有 perf 脚本量化收益。
4. 最后补最小测试矩阵、权限说明和离线/CDN 失败体验。

## 暂不建议做的事

- 不建议引入 React/Vue、Vite、Webpack 或全量格式化；这会改变项目当前“零构建”的核心优点。
- 不建议一次性重写所有 UI 模块；当前模块边界可用，适合小步打磨。
- 不建议直接迁移 Firestore 数据；任何批量迁移都应先 dry-run、打印目标集合，再显式执行。
