# tools/history_email_scrub

一次性隐私工具：把 **git 提交的 author / committer 邮箱**以及 **annotated tag 的
tagger 邮箱**改写成已验证的 GitHub noreply 地址，同时保留作者名、时间戳、文件树、
提交消息、tag 名称和 tag 注释正文。

> 本工具不直接改写 `E:/NewGame`，也不执行 push：默认 dry-run，`--apply` 只接受
> 独立 bare mirror，且拒绝脚本所在仓库和当前工作仓库。最终发布由监工在独立副本
> 上验证后决定。

已核实的本账号 noreply 地址为
`231012603+Tedi-Dino@users.noreply.github.com`（通过 `gh api users/Tedi-Dino`
确认）。文档和命令中只使用这个公开地址；旧地址不写入仓库、日志或临时文件。

## 安全流程

```bash
# 1. 先做一个独立的 bare mirror（不要在原仓库上操作）
git clone --mirror <原仓库或远端 URL> /path/to/private-history-mirror.git

# 2. dry-run：只输出计数，绝不打印旧邮箱
node tools/history_email_scrub/history_email_scrub.mjs \
  --repo /path/to/private-history-mirror.git \
  --noreply 231012603+Tedi-Dino@users.noreply.github.com

# 3. 确认计数无误后，才在镜像上改写
node tools/history_email_scrub/history_email_scrub.mjs \
  --repo /path/to/private-history-mirror.git \
  --noreply 231012603+Tedi-Dino@users.noreply.github.com \
  --apply

# 4. 独立验证（工具在 apply 后已自动做结构校验 + git fsck）
git -C /path/to/private-history-mirror.git log --all --format='%ae%n%ce' | sort -u
git -C /path/to/private-history-mirror.git for-each-ref refs/tags --format='%(refname) %(taggeremail)'
git -C /path/to/private-history-mirror.git rev-list --all --count
git -C /path/to/private-history-mirror.git fsck --full

# 5. 验证通过后，清掉镜像里不可达的旧提交对象（确认不再需要回滚镜像）
git -C /path/to/private-history-mirror.git reflog expire --expire=now --all
git -C /path/to/private-history-mirror.git gc --prune=now
```

noreply 地址必须是 GitHub 账户设置里给出的
`<id>+<username>@users.noreply.github.com`（或旧式
`<username>@users.noreply.github.com`），工具会校验格式。

## 实现要点

- **按字节解析 fast-export**：读取完整 `git fast-export --all` 流（Buffer），
  识别 `data <N>` 帧后精确跳过 N 字节。commit/tag 消息、blob、inline 文件数据中
  即使出现形如 `author X <a@b> 123 +0800` 的假控制行，也不会被改写；PNG 等二进制
  和中文多字节内容逐字节保留。
- **只改控制区身份行**：仅匹配行首的 `author`、`committer`、`tagger`，且要求
  完整的 `<email> <timestamp> <tz>` 结构。作者名、时间戳、ref 名、提交消息和
  tag 注释正文保持不变。
- **默认 dry-run**；只有显式 `--apply` 才调用 `git fast-import`。
- `--apply` 只接受 **bare mirror**，并拒绝：
  - 脚本所在仓库（即使从其他目录调用）；
  - 当前工作仓库；
  - 非 bare 仓库。
- 旧邮箱只在内存中读取和映射；fast-export 与 fast-import 都走内存管道，不写
  含旧地址的临时文件，也不打印它。
- **签名提交/签名 tag 默认拒绝**：改写会使签名失效。签名 tag 通过 tag 对象正文
  中的 PGP/SSH 签名标记识别，绝不静默 `--signed-tags=strip`。确认可接受签名失效
  后才可显式加 `--allow-broken-signatures`（此时 fast-export 以 `verbatim` 保留
  签名数据）。
- 没有 tagger 标识的 annotated tag 无法安全脱敏，`--apply` 会预检拒绝，避免
  只改一半。

## apply 后自动验证

验证失败会抛错，错误信息明确写明**只影响镜像，原始仓库未被修改**：

- 提交数不变；
- 所有 author/committer 邮箱和所有 annotated tag 的 tagger 邮箱都等于目标地址；
- ref 名称列表不变；
- 每个提交的 `tree + 作者名/时间 + 提交者名/时间 + 提交消息` 多重集合不变；
- 每个 annotated tag 的 tag 名称、目标类型、tagger 名/时间、注释正文不变；
- `git fsck --full --no-dangling` 通过。

错误详情只指出字段名（如“第 N 条记录的 author 字段”），不打印字段值或旧邮箱。

## 计数但保留的内容

- commit 消息或 tag 注释正文里出现的邮箱：**只计数，不自动修改**。它们属于正文
  数据，工具不会触碰；发布前需要决定是否另行接受。
- 旧地址仍可能出现在正文中；工具的目标只是身份元数据。

## 边界

- 改写只影响这个镜像中 refs 可达的对象；推送后也无法清除已有克隆、fork、
  reflog、GitHub 缓存/不可达对象或第三方备份。不能声称“清空所有旧副本”。
- 镜像内改写后仍需 `reflog expire --expire=now --all` + `gc --prune=now` 才能
  清掉本地不可达旧对象；远端缓存和搜索索引有自己的保留周期。
- 工具不执行推送，也不改写 `E:/NewGame`。最终是否强推由监工在真实副本上验证后
  决定。

## 发布建议

1. 在镜像上完成改写并用上面的命令复核。
2. 把镜像推到新的临时远端，用浅克隆 + `git log` / `git for-each-ref` 抽查
   author、committer、tagger、tag 正文。
3. 监工确认后再决定是否 `git push --force-with-lease`；本工具不执行推送。
4. 原仓库备份（含旧历史）在确认前保持离线，确认后按隐私要求销毁。

## 本轮 dry-run 事实

对 `E:/NewGame` 只执行过只读 dry-run，未改写：

```text
Commits: 89
Refs: 6
Distinct author/committer/tagger emails: 1 (values withheld)
Identity lines needing rewrite: 178
Commits needing rewrite: 89
Annotated tags needing tagger rewrite: 1
Signed commits/tags: 0/0
Commit/tag messages containing an email: 0/0
DRY RUN — no refs or objects were changed.
```
