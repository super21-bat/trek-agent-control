---
name: trek-agent-control
description: 配套 Trek 微信旅行小程序的自动化 Skill，主要面向 WorkBuddy，也兼容 Codex、Claude、OpenClaw、Hermes 等 Agent。通过认证的远程 MCP 研究国内外目的地、读取或修改行程，并把日程、地点、预订、住宿、费用、清单、待办、附件和协作提案安全同步回小程序。Use when WorkBuddy or another agent needs to plan travel, inspect Trek data, synchronize structured itinerary fields, upload tickets, or run safe diagnostics with a user-provided Trek Agent Key.
---

# Trek Agent Control

Control the user's real Trek data through MCP. Treat web research and Trek synchronization as separate phases: research first, then show a concrete change preview, then write and read back.

## Product workspace

Trek 微信旅行小程序是用户查看、编辑、导航、分享和协作的行程工作区；本
Skill 是它的 Agent 自动化层。用户先在小程序创建行程和独立 Agent Key，
Agent 再研究资料并把结构化结果同步回同一行程。不要创建与小程序脱离的第二份
行程数据，也不要把聊天回答误报成已同步。

![微信扫码打开 Trek 旅行小程序](https://raw.githubusercontent.com/super21-bat/trek-agent-control/main/assets/trek-miniapp-code.png)

当前二维码为测试阶段入口，是否可直接进入以微信侧体验权限为准。

## Connect

1. Never paste the `trek_` key into files, prompts, logs, screenshots, commits, or shell history intended for sharing.
2. Prefer the agent's native Streamable HTTP MCP support. Configure:
   - URL: `https://api.superd.fun/mcp`
   - Header: `Authorization: Bearer <user-key>`
3. Use the Trek CLI to install/sync this Skill, verify the connection, and diagnose failures:

```bash
npm install -g https://github.com/super21-bat/trek-agent-control/archive/refs/heads/main.tar.gz
trek config init --api-key 'trek_...' --url 'https://api.superd.fun/mcp'
trek skill sync --global
trek doctor
```

The mini program presents this to ordinary users as two steps: copy once, then send the copied bundle to WorkBuddy. WorkBuddy should complete installation, configuration, Skill sync, and `doctor` without asking the user to run commands manually. Treat the whole bundle as a secret. If native remote MCP is unavailable or unreliable, execute all operations through `trek`; it calls the same MCP endpoint. Read [references/configuration.md](references/configuration.md) for runtime details.

## Fast paths for common user requests

Do not load the large-planning workflow for these small writes. Use the exact
recipe, then stop:

- “加到待定/候选地点”：resolve the trip with `list_trips`, then run
  `trek add-pending <trip-id> <title> [--place-id <saved-place-id>]` or call
  native MCP `add_pending_place`. If the place already exists in 收藏, pass its
  `placeId`; the server links/reuses that place instead of creating a duplicate.
  For a newly researched candidate, include a short stable `description` and a
  representative `imageUrl` when available; put the trip-specific recommendation
  in `reason`. A name plus address alone is not enough context for group voting.
  `apply_trip_change` with `action: "add_pending"` remains a compatible fallback.
  Never use `create_place` for 待选/候选/待决定.
- “设置行程封面”：run `trek set-cover <trip-id>
  <absolute-image>` or call native MCP `apply_trip_change` with `action:
  "set_cover"`. The server owns upload, binding and readback as one semantic
  operation; do not compose primitive upload/update calls when this tool exists.

For either fast path, if readback fails, report “未同步” and the exact failed
stage. Never continue into unrelated planning or claim the mini program will
eventually refresh.

## Mandatory workflow

1. Run `doctor` or native `tools/list`. Stop on authentication, network, or missing-tool failure.
2. Read existing state with `list_trips` and `get_trip_summary`. Never assume a trip ID. Use top-level `places[]` for every trip place, including unassigned places; use `packing.bags[]` for all bags, including empty bags.
3. Research current facts with primary/official sources first. Separate confirmed facts, recommendations, and unresolved items.
4. Build a dated plan and an `expectedAssignmentsByDate` checklist containing every POI/activity that must appear in the mini program. Use exact local dates and times. Do not invent reservations, confirmation numbers, phone numbers, opening hours, prices, or addresses.
5. Show the user a compact change preview before destructive, bulk, financial, membership, proposal-decision, or rescheduling writes.
6. Write in small batches. Reuse existing entities and detect duplicates by normalized name/date before creating.
7. Every planned location/activity must be a Place plus Assignment. Use `create_and_assign_place` for a new POI and `assign_place_to_day` for an existing one. Day notes are supporting prose and must never replace assignments.
8. Model accommodation separately. `create_place_accommodation`/`create_accommodation` create a lodging date range but no visible day assignment. If a hotel or check-in is in the daily plan, also assign its place to that day.
9. Populate only meaningful fields, but use the complete model when relevant: trip dates/description, days, places and coordinates, assignment start/end/duration/transport/notes, reservations, accommodations, costs, packing, todos, collaboration notes, proposals and members.
10. Read back with `get_trip_summary` plus the relevant `list_*` tool. Compare `expectedAssignmentsByDate` to actual `days[].assignments` by date and normalized place name/ID, not only counts. A planned day must not have zero assignments; explicitly document intentional rest/location-free travel days.
11. Do not report synchronization complete while any expected assignment is missing or only mentioned in a day note. Repair the gap or disclose it to the user.
12. Report what changed, what remains uncertain, and what the user must confirm.

Read [references/workflows.md](references/workflows.md) for detailed planning and synchronization recipes. Read [references/field-guide.md](references/field-guide.md) before a large or unfamiliar write.

## CLI

```bash
trek doctor
trek update --check
trek tools place
trek call list_trips '{"include_archived":false}'
trek summary 3
trek audit-plan 3 /absolute/path/expected-assignments.json
trek add-pending 3 '西湖游船' --reason '同行者表态后再排日程'
trek upload-file 3 /absolute/path/ticket.pdf --assignment 42 --description '景区电子票'
trek set-cover 3 /absolute/path/cover.jpg --description '行程封面'
trek rename-file 3 19 '金门大桥门票.pdf'
trek batch /absolute/path/actions.json
trek batch /absolute/path/actions.json --apply
trek smoke --allow-write-smoke
```

`doctor` reports local configuration, endpoint, credential presence, Skill integrity, authentication, live tool count, and trip readback. Failures include a category, hint, and next command; retain that structured output when diagnosing. `update --check` compares CLI versions; `update` upgrades the CLI and resynchronizes the Skill. `audit-plan` compares an expected JSON date-to-place mapping with live `days[].assignments` and exits non-zero on missing items. `add-pending` creates or reuses a candidate and verifies the open proposal by ID. `upload-file` reads a local attachment without printing its base64 and supports files up to 10 MB. `set-cover` uploads, binds, and verifies a visible trip cover as one command. `rename-file` changes only the display name and keeps the extension. `batch` is dry-run unless `--apply` is present. Applied actions always expose `ok`, `resourceType`, `resource`, `warnings`, and the original `result`; execution stops on the first failed action. It refuses high-risk tool names unless `--confirm-high-risk` is also present. `smoke` creates temporary data, exercises the proposal lifecycle, deletes it, and closes the MCP session.

## Safety invariants

- Treat the key as a password. Ask the user to revoke it immediately if exposed.
- Never delete or overwrite real data during diagnostics. Use the bundled temporary smoke only.
- Do not mark bookings confirmed without order evidence. Use `pending` or a todo for unresolved bookings.
- Do not create fake coordinates. Use `search_place` with `market: "china"` plus `region` in Mainland China, or `market: "global"` plus an ISO `countryCode` for overseas trips. Preserve the returned provider IDs and coordinates.
- For minors, medical needs, border crossings, flights, and tight transfers, add safety buffers and explicit adult-confirmation tasks.
- Respect 429 responses. Do not disable server limits or fire requests in parallel; the bundled client retries with bounded backoff.
- Static `trek_` keys currently grant broad user access. Create one per Agent, revoke unused keys, and prefer scoped OAuth when the target agent supports it.
- Close every MCP session, including failed runs.

## Failure handling

- `401`: key missing, revoked, malformed, or sent without `Bearer`.
- `403`: user lacks trip permission or scope; do not retry as another user.
- `404`: wrong trip/entity ID or inaccessible resource; refresh state.
- `429`: wait and retry sequentially; reduce batch size.
- `isError: true`: treat as failed even if HTTP succeeded. Preserve the error text and stop dependent writes.
- Unknown fields/tools: call `tools/list`; never guess a schema from an older document.

When native MCP and the bundled client disagree, trust a fresh `tools/list` response and production readback.
