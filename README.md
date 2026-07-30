# Trek 微信旅行小程序 × Agent 自动化

让旅行计划不只停留在聊天记录里。Trek 把微信小程序作为用户可见、可编辑、
可协作的行程中心，用户只要复制一次并发给 WorkBuddy，它就能研究资料、
制定计划，并把结构化结果同步回小程序。Codex、Claude、OpenClaw、Hermes
等支持 MCP 或命令行的 Agent 也兼容同一套接入方式。

[![Verify and publish](https://github.com/super21-bat/trek-agent-control/actions/workflows/release.yml/badge.svg)](https://github.com/super21-bat/trek-agent-control/actions/workflows/release.yml)

<p align="center">
  <img src="assets/trek-miniapp-code.png" alt="微信扫码打开 Trek 旅行小程序" width="240" />
</p>

<p align="center">
  <strong>微信扫码打开 Trek 旅行小程序</strong><br />
  <sub>当前为测试阶段，是否可直接进入以微信侧体验权限为准。</sub>
</p>

## 小程序和 Agent 如何配合

```text
微信小程序创建行程与 Agent Key
            ↓
Agent 搜寻攻略、交通、餐饮和预订信息
            ↓
通过 Trek MCP 写入日程、地点、费用、票据与清单
            ↓
用户在小程序查看、修改、导航、分享和共同协作
```

小程序是行程的可视化工作区和最终数据来源；本仓库提供的是自动化接入层，
不是另一套旅行应用，也不会把用户数据保存到 GitHub。每个 Agent 使用独立、
可撤销的 Key，用户可以在微信端停止连接。

## 在小程序里可以做什么

- 查看首页下一站、当天时间线和地图导航。
- 编排国内或海外多日行程，维护地点、交通方式和当次安排。
- 保存酒店、机票、门票等预订信息、确认号、二维码、图片和 PDF。
- 管理费用、出发清单、待办事项和行程状态。
- 邀请同行者共同查看和修改行程。
- 为不同 Agent 创建独立连接，随时撤销不再使用的 Key。

## Agent 可以自动完成什么

- 结合用户时间、同行人、预算和已确认预订研究可执行的旅行方案。
- 读取、新建和更新行程、逐日日程、地点、交通与时间。
- 管理住宿、航班、门票、餐厅预订及关联附件。
- 写入费用、清单、待办、成员和协作提案。
- 写入后自动回读，核对计划是否真正出现在小程序对应位置。
- 使用 `doctor` 检查配置、网络、鉴权、工具发现与读取能力。

## 两步连接 WorkBuddy

1. 在 Trek 小程序“我的”页面点“创建并复制”。
2. 打开 WorkBuddy，把复制内容直接发给它。

安装、配置、Skill 同步和连接检查都由 WorkBuddy 完成，普通用户不需要理解
MCP、CLI 或 `doctor`。

## 其他兼容 Agent

- **原生支持 Streamable HTTP MCP**：直接配置 MCP URL 和 Bearer Key。
- **支持终端但不支持远程 MCP**：安装零依赖 Node.js CLI。
- **Codex / Claude / OpenClaw / Hermes**：使用同一个复制接入包；支持原生 MCP 时直接连接，否则使用 CLI。

仓库中不包含任何用户 Key、行程数据、小程序源码或服务端凭据。

## 快速开始

先在 Trek 小程序的「我的 → Agent 连接」创建连接并复制配置。要求
Node.js 18 或更高版本：

```bash
npm install -g https://github.com/super21-bat/trek-agent-control/archive/refs/heads/main.tar.gz
trek config init --api-key '由用户单独提供' --url 'https://api.superd.fun/mcp'
trek skill sync --global
trek doctor
```

最小只读验证：

```bash
trek call list_trips '{"include_archived":false}'
```

原生 MCP 配置：

```text
URL: https://api.superd.fun/mcp
Authorization: Bearer <用户自己的 Trek Agent Key>
```

不要把真实 Key 写入 Git、聊天记录、截图、共享日志或公共配置示例。

## Agent 执行原则

1. 先读取现有行程，再研究和生成计划。
2. 写入前展示变更预览，避免覆盖真实数据。
3. 一条可见日程必须是 Place + Assignment，不能只写在备注里。
4. 地点介绍、电话、官网属于 Place；当次时间和说明属于 Assignment。
5. 订单号和票据属于 Reservation/File；金额属于 Budget/Expense。
6. 每次写入后使用 list/get 工具回读，并核对小程序可见位置。
7. 不猜工具名或字段；服务端变化后先调用 `tools/list`。

## 常用命令

```bash
trek doctor
trek tools place
trek summary 3
trek audit-plan 3 /absolute/path/expected-assignments.json
trek upload-file 3 /absolute/path/ticket.pdf --assignment 42
trek batch /absolute/path/actions.json
trek batch /absolute/path/actions.json --apply
```

`batch` 默认只预览；高风险操作需要额外确认。生产诊断默认只读。

## 文档

| 文档 | 用途 |
| --- | --- |
| [SKILL.md](SKILL.md) | Agent 必须遵守的执行流程与安全边界 |
| [字段指南](references/field-guide.md) | MCP 字段归属、写入工具和小程序可见位置 |
| [工作流](references/workflows.md) | 研究、规划、同步、回读与审计 |
| [配置指南](references/configuration.md) | 各 Agent 的 MCP/CLI 接入与排障 |
| [维护说明](MAINTAINING.md) | Git、测试、版本、ClawHub 发布与回滚 |

## 发布状态

- GitHub 是 CLI 和 Skill 的发行源。
- ClawHub 是 OpenClaw Skill 目录，审核完成后提供独立安装入口。
- npm 包尚未作为正式入口时，以本 README 的 GitHub 安装命令为准。
- GitHub、ClawHub、npm 三者的“已发布”状态必须分别验证。

## 开源与致谢

Trek 中国版复用并扩展开源项目
[liketrek/TREK](https://github.com/liketrek/TREK) 的旅行管理与 MCP 能力，
面向微信小程序、中国大陆服务和国内外行程场景进行了适配。

GitHub 仓库内容按 [AGPL-3.0](LICENSE) 发布。发布到 ClawHub 的 Skill 副本
遵循 ClawHub 平台规定的 MIT-0。
