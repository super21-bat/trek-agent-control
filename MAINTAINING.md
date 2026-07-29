# Trek Agent Control 维护与发布说明

本文面向维护 `super21-bat/trek-agent-control` 的 Codex、Claude、OpenClaw、
Hermes 和人工开发者。目标是让 GitHub、ClawHub、Trek MCP 与微信小程序
保持同一份字段语义，避免“工具能写入，但小程序不展示”的孤岛数据。

## 1. 仓库职责

本仓库只发布通用 Agent 接入层：

- `SKILL.md`：Agent 的行为规范、安全边界和执行入口。
- `references/configuration.md`：安装、MCP 地址、Key 与诊断说明。
- `references/field-guide.md`：字段归属、写入方式和小程序可见位置。
- `references/workflows.md`：研究、规划、写入、回读和审计流程。
- `scripts/trek-mcp.mjs`：零依赖 CLI 与 MCP 客户端。
- `tests/`：CLI、配置和 Skill 回归测试。
- `agents/openai.yaml`：Skill 展示元数据。

这里不存放小程序源码、服务端源码、数据库、用户行程或任何真实 Key。

主项目中的 `agent-packages/trek-agent-control/` 是开发源，公开 GitHub
仓库是发行镜像。两处内容必须同步；禁止只改其中一处。

## 2. 安全红线

- 真实 `trek_...` Key 不得出现在 Git、Issue、PR、截图、日志或示例中。
- 每个 Agent 使用独立 Key；不再使用时立即在小程序中撤销。
- 本地配置文件必须保持仅当前用户可读，推荐权限 `0600`。
- 测试默认只读。写入生产行程前必须明确目标行程，并先生成预期变更清单。
- 不允许用 `--force` 绕过失败的 `doctor`、字段校验或写后回读。
- 若密钥意外进入 Git，先撤销密钥，再清理历史；仅删除最新提交不等于安全。

## 3. 字段契约变更流程

字段或工具变化必须按以下顺序完成：

1. 在 Trek 服务端修改 MCP 工具 schema、实现和测试。
2. 运行生产或测试环境 `tools/list`，以实际工具 schema 为准。
3. 更新 `references/field-guide.md` 的字段归属与小程序可见位置。
4. 更新 `SKILL.md` 或 `references/workflows.md` 的调用步骤与回读规则。
5. 更新 CLI（若命令或参数发生变化）以及对应自动测试。
6. 核对小程序是否能展示、编辑或打开写入的数据。
7. 写入后使用 list/get 工具回读；不能只相信 create/update 返回成功。
8. 同步主项目 Agent 包与公开仓库，并比较文件哈希。

字段归属原则：

- 当次安排的时间、交通、类型和说明写入 assignment。
- 地点长期资料（介绍、备注、地址、电话、官网）写入 place。
- 预订号、二维码、门票、入住信息写入 reservation，并关联 assignment。
- 图片、PDF 等写入 file，并关联 assignment、reservation 或 place。
- 金额、币种、付款人、日期写入 budget/expense；不要埋在普通备注里。

新增字段必须同时回答三个问题：

1. Agent 用哪个工具和参数写入？
2. 写入后用哪个工具回读？
3. 用户在小程序哪里能看见或编辑？

任一问题没有答案，字段不得标记为稳定。

## 4. 本地开发

要求 Node.js 18 或更高版本。

```bash
git clone https://github.com/super21-bat/trek-agent-control.git
cd trek-agent-control
npm install
npm test
npm run prepack
npm pack --dry-run --json
git diff --check
```

修改后还应执行一次干净安装：

```bash
tmp_dir="$(mktemp -d)"
npm install --prefix "$tmp_dir" "github:super21-bat/trek-agent-control"
"$tmp_dir/node_modules/.bin/trek" --version
"$tmp_dir/node_modules/.bin/trek" skill check
```

如有临时有效 Key，再执行只读生产冒烟：

```bash
trek config init --endpoint https://api.superd.fun/mcp --key '由用户单独提供'
trek doctor
trek tools call list_trips '{}'
```

通过标准：

- `trek doctor` 返回 `ok: true`。
- MCP 工具数量为正数。
- `list_trips` 成功。
- 日志与终端输出中不出现完整 Key。

## 5. Git 提交与同步

提交前先确认工作区，不能覆盖其他 Agent 的未提交修改：

```bash
git status --short
git diff --check
git diff --stat
```

推荐提交范围：

```bash
git add SKILL.md MAINTAINING.md agents package.json references scripts tests
git commit -m "docs: update Trek Agent maintenance contract"
git push origin main
```

推送后检查 GitHub Actions：

```bash
gh run list --repo super21-bat/trek-agent-control --limit 5
gh run watch --repo super21-bat/trek-agent-control
```

必须等 `verify` 成功后，才能对外宣称 GitHub 版本已更新。

主项目与公开仓库同步时，建议使用：

```bash
diff -ru \
  --exclude .git \
  /path/to/trek-cn-rebuild/agent-packages/trek-agent-control \
  /path/to/trek-agent-control
```

允许存在的差异必须在交接日志中逐条说明。

## 6. 版本与发布

遵循语义化版本：

- patch：文案、兼容修复、不破坏旧调用的字段说明。
- minor：新增命令、工具支持或可选字段。
- major：删除/重命名字段、改变默认写入行为或破坏旧配置。

版本发布步骤：

1. 更新 `package.json` 版本。
2. 完成本地测试和干净安装。
3. 提交并推送 `main`。
4. 创建与版本一致的标签，例如 `v0.2.0`。
5. 推送标签，等待 `.github/workflows/release.yml`。
6. npm `NPM_TOKEN` 未配置时，GitHub 安装方式仍是正式入口，不能宣称 npm 已发布。

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

## 7. ClawHub 同步

ClawHub 是 Skill 目录，不替代 GitHub 源码与自动测试。同步前必须：

- GitHub `main` 已推送且 Actions 通过。
- `SKILL.md`、`references/` 和 `agents/openai.yaml` 已是同一版本。
- 页面描述不包含真实 Key、内部服务器凭据或用户数据。
- 安装说明指向公开仓库。

本仓库同时包含 npm CLI 的 `package.json`，直接发布仓库根目录可能被 ClawHub
识别为插件。Skill 发布必须使用只包含 `SKILL.md` 和 `references/` 的临时
目录；`README.md` 与 `MAINTAINING.md` 是 GitHub 用户文档，不进入 Skill：

```bash
skill_dir="$(mktemp -d)/trek-agent-control"
mkdir -p "$skill_dir"
cp SKILL.md "$skill_dir/"
cp -R references "$skill_dir/"

clawhub skill publish "$skill_dir" \
  --slug trek-agent-control \
  --name "Trek Agent Control" \
  --owner super21-bat \
  --source-repo super21-bat/trek-agent-control \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref main \
  --source-path . \
  --changelog "同步最新 MCP 字段归属、回读规则与维护说明"
```

ClawHub 当前对发布到目录的 Skill 统一采用 MIT-0；GitHub 仓库中的 CLI 仍按
仓库 `LICENSE` 发布。维护者发布前必须理解这是两个独立分发面的许可状态。

同步后记录：

- ClawHub 条目 URL。
- 对应 Git commit SHA。
- 更新时间与发布人。
- ClawHub 页面显示的版本/描述。
- 是否完成一次从 ClawHub 安装后的 `skill check`。

如果 ClawHub 尚不支持自动从 GitHub 更新，则每次 GitHub 契约变更都要手动
重新提交或更新条目，不能把“GitHub 已更新”视为“ClawHub 已更新”。

## 8. 回滚

- 文档或 CLI 出错：使用 `git revert <commit>`，不要在共享主分支强推。
- 标签发布错误：先发布新的修复版本；不要静默替换已发布标签。
- ClawHub 条目错误：恢复到最近一个已验证 Git commit 对应内容。
- MCP 服务端 schema 出错：按服务端自己的备份与部署手册回滚，Skill 回滚
  不能替代服务端回滚。
- 涉及密钥泄露：先撤销密钥，再处理 Git/ClawHub 内容。

## 9. 每次交接最小记录

维护者应记录：

- 修改目的与字段契约。
- Git commit SHA 和 Actions run。
- 测试命令与结果。
- GitHub、npm、ClawHub 各自的真实发布状态。
- 是否执行有效 Key 的只读 `doctor`。
- 未完成的真机、生产写入或用户验收。

没有证据的步骤必须写“未验证”，不得用“应该可用”替代。
