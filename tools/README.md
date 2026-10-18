# tools/

本机侧工具集。浏览器端的逻辑在 `js/`，这里放的是「不走 Cloud Functions」的一次性或运维脚本——
Spark 免费套餐下，原本由云函数 + Scheduler 完成的事都由这里接手。

## 目录

| 目录 | 状态 | 用途 |
| --- | --- | --- |
| [`steam_sync/`](steam_sync/) | **常用** | Steam 库同步到 Firestore（替代云函数与每日定时任务）。默认 dry-run，`--apply` 才写库 |
| [`tests/`](tests/) | **常用** | `node:test` 单元测试，`node --test tools/tests/*.test.mjs` |
| [`steam_info/`](steam_info/) | 按需 | 抓取 Steam 个人资料 / 游戏库为 CSV |
| [`bind_steam_ids/`](bind_steam_ids/) | 按需 | 通过 Firestore REST 批量回填 `steam_app_id` |
| [`create_items/`](create_items/) | 按需 | 批量新建条目，默认 dry-run |
| [`update_unsold_physical_estimates/`](update_unsold_physical_estimates/) | 按需 | 修正被误写入 `purchasePrice` 的 30 元展示估值 |
| [`cost_per_hour/`](cost_per_hour/) | 一次性 | 读导出的 CSV 生成时均成本趋势图 |
| [`perf_test/`](perf_test/) | 一次性 | Puppeteer 渲染/加载性能测试，需先 `npm install` |
| [`update_unsold_cost/`](update_unsold_cost/) | **已废弃** | 违反当前数据规则，仅保留作参考，不要运行 |

## 约定

- **默认 dry-run**：任何写库脚本不带 `--apply` 只打印计划，必须先跑一遍确认目标集合。
- **认证**：多数脚本复用 `~/.config/configstore/firebase-tools.json` 的 Firebase CLI OAuth 令牌，
  等同于项目所有者身份，**会绕过 `firestore.rules`**。不要对别人的项目执行。
- **密钥**：`STEAM_API_KEY` 放在 `tools/steam_sync/.env`（已被 `.gitignore` 的 `**/.env` 覆盖），
  或直接走环境变量；不要写进源码。
- **输出**：`tools/steam_info/output/`、`tools/perf_test/results.json` 等生成物不进仓库。

新增工具时请一并更新本表，并在脚本头部注明是否写库、是否需要额外依赖。
