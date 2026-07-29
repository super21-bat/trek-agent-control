# Trek Agent Control

让 Codex、Claude、OpenClaw、Hermes、WorkBuddy 等 Agent 通过认证的远程
MCP 安全读取、规划并同步 Trek 微信小程序中的真实行程。

[![Verify and publish](https://github.com/super21-bat/trek-agent-control/actions/workflows/release.yml/badge.svg)](https://github.com/super21-bat/trek-agent-control/actions/workflows/release.yml)

## 能做什么

- 读取、新建和更新国内或海外行程。
- 管理逐日日程、地点、交通方式、时间和当次安排。
- 管理酒店、机票、门票等预订及确认号。
- 上传并关联二维码、图片和 PDF。
- 管理费用、清单、待办、成员和协作提案。
- 写入后自动回读，检查计划是否真正显示在小程序中。
- 通过 `doctor` 诊断配置、网络、鉴权、工具发现和读取能力。

## 适合哪些 Agent

- 原生支持 Streamable HTTP MCP 的 Agent：直接配置 MCP URL 和 Bearer Key。
- 支持终端但不支持远程 MCP 的 Agent：安装零依赖 Node.js CLI。
- OpenClaw：可从 ClawHub 安装 Skill，再使用独立 Trek Agent Key。

每个 Agent 应使用独立、可撤销的 Key。仓库中不包含任何用户 Key、行程数据、
小程序源码或服务端凭据。

## 快速开始

要求 Node.js 18 或更高版本。

```bash
npm install -g github:super21-bat/trek-agent-control
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

## 核心原则

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

## 许可证

GitHub 仓库内容按 [AGPL-3.0](LICENSE) 发布。发布到 ClawHub 的 Skill 副本
遵循 ClawHub 平台规定的 MIT-0。
