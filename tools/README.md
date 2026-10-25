# tools/

本机侧工具集。浏览器端的逻辑在 `js/`，这里放的是「不走 Cloud Functions」的一次性或运维脚本——
Spark 免费套餐下，原本由云函数 + Scheduler 完成的事都由这里接手。

## 目录

| 目录 | 状态 | 用途 |
| --- | --- | --- |
| [`steam_sync/`](steam_sync/) | **常用** | Steam 库同步到 Firestore（替代云函数与每日定时任务）。默认 dry-run，`--apply` 才写库 |
| [`tests/`](tests/) | **常用** | `node:test` 单元测试，`node --test tools/tests/*.test.mjs` |
| [`steam_info/`](steam_info/) | 按需 | 抓取 Steam 个人资料 / 游戏库为 CSV（输出目录已忽略） |
| [`bind_steam_ids/`](bind_steam_ids/) | 一次性 | 按本机 `bindings.json` 批量回填 `steam_app_id`，默认 dry-run |
| [`dump_items/`](dump_items/) | 常用 | 只读导出 `items` 集合（写入前核对现状、写入后校验）；输出已忽略 |
| [`history_email_scrub/`](history_email_scrub/) | 一次性 | 在独立 bare mirror 中把 author/committer 邮箱改为 GitHub noreply；默认 dry-run，不碰本仓库 |
| [`create_items/`](create_items/) | 常用 | 按本机 `batch.json` 新建条目 + 字段级补全，默认 dry-run |
| [`update_unsold_physical_estimates/`](update_unsold_physical_estimates/) | 一次性 | 按本机 `repairs.json` 修正被误写入 `purchasePrice` 的 30 元展示估值 |
| [`cost_per_hour/`](cost_per_hour/) | 一次性 | 读导出的 CSV 生成时均成本趋势图 |
| [`perf_test/`](perf_test/) | 一次性 | Puppeteer 渲染/加载性能测试，需先 `npm install` |
| [`update_unsold_cost/`](update_unsold_cost/) | **已废弃** | 违反当前数据规则，仅保留作参考，不要运行 |

## 约定

- **默认 dry-run**：任何写库脚本不带 `--apply` 只打印计划，必须先跑一遍确认目标集合。
- **不自动创建计划任务**：本目录的 Steam 同步脚本需要手动运行；如要每日执行，
  由使用者自行创建任务。仓库不会安装任务，本机核查也未发现已注册的同步任务。
- **认证**：多数脚本复用 `~/.config/configstore/firebase-tools.json` 的 Firebase CLI OAuth 令牌，
  等同于项目所有者身份，**会绕过 `firestore.rules`**。不要对别人的项目执行。
- **密钥**：`STEAM_API_KEY` 放在 `tools/steam_sync/.env`（已被 `.gitignore` 的 `**/.env` 覆盖），
  或直接走环境变量；不要写进源码。
- **本地数据**：真实批次 / 绑定表 / 修复表分别放在 `create_items/batch.json`、
  `bind_steam_ids/bindings.json`、`update_unsold_physical_estimates/repairs.json`。
  这些文件含个人购买与游戏库数据，已被 `.gitignore` 忽略；仓库里只提交
  `*.example.json` 占位模板。不要把真实内容粘进文档、Issue 或聊天。
- **输出**：`tools/steam_info/output/`、`tools/dump_items/out/`、
  `tools/perf_test/results.json` 等生成物不进仓库。

新增工具时请一并更新本表，并在脚本头部注明是否写库、是否需要额外依赖。
