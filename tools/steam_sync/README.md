# tools/steam_sync

免费套餐（Firebase Spark）下的 Steam 同步。Cloud Functions / Cloud Scheduler 不可用，
所以改由本机执行；写入走 Firestore REST API，认证复用 Firebase CLI 的 OAuth 令牌
（不需要 service account 密钥）。

## 用法

```bash
# 预演：拉 Steam、匹配、算增量，只打印不写库
node tools/steam_sync/sync.mjs

# 真正写入 Firestore
node tools/steam_sync/sync.mjs --apply

# 不联网到 Steam，用本地夹具演练（配合 --games-file）
node tools/steam_sync/sync.mjs --games-file games.json --no-achievements
```

`games.json` 形如：

```json
{ "games": [{ "appid": 255710, "name": "Cities: Skylines", "playtime_forever": 3600 }] }
```

## 配置

`STEAM_API_KEY` 从环境变量或本目录的 `.env` 读取（`.env` 已被仓库忽略）：

```
STEAM_API_KEY=你的密钥
```

密钥在 <https://steamcommunity.com/dev/apikey> 申请。

访问 `firestore.googleapis.com` 需要代理时，设置 `HTTPS_PROXY`：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 node tools/steam_sync/sync.mjs --apply
```

## 每天自动运行（可选，需自行创建任务）

> 仓库和部署流程**不会**创建计划任务；本机核查也未发现按 `NewGame` /
> `steam_sync/sync.mjs` 注册的任务。下面的步骤只是可选操作，执行前先确认任务
> 不存在，避免重复写入。

1. 任务计划程序 → 创建基本任务 → 每天 04:00
2. 操作：启动程序
   - 程序：`C:\Program Files\nodejs\node.exe`
   - 参数：`tools\steam_sync\sync.mjs --apply`
   - 起始于：`E:\NewGame`
3. 勾选"不管用户是否登录都要运行"，并在任务属性里设置 `HTTPS_PROXY`（如需要）

## 与云函数的一致性

- 名称匹配：`functions/steam-sync-core.js`（两边共用）
- 时长增量：`functions/steam-playtime.js`（两边共用）
- 写入字段：`items.steam_app_id / steam_last_sync / playTime / fullyCompleted`、
  `metadata/steamSync`、`metadata/steamPlaytimeTracking`、`steamPlaytimeState/*`、
  `steamPlaytimeMonths/*`
- `tools/tests/free-tier.test.mjs` 守卫上述字段与元数据键不被改单边

## 已知限制

- 月文档超过 750 KB 时脚本会直接报错退出：云函数会改用 `apps` 子集合，本地脚本
  不实现该分支（约 100 款游戏远达不到这个体量）。
- 两次采样之间的全部增量都记入运行当月。停更数天后恢复同步，这段增量会集中在
  「恢复当月」，中间月份显示为 0。按日运行可把窗口压到最小。
