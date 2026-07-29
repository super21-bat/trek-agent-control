# Runtime configuration

## Native Streamable HTTP MCP

Use the runtime's secret manager for `TREK_MCP_TOKEN`. The common configuration shape is:

```json
{
  "mcpServers": {
    "trek": {
      "type": "streamable-http",
      "url": "https://api.superd.fun/mcp",
      "headers": {
        "Authorization": "Bearer ${TREK_MCP_TOKEN}"
      }
    }
  }
}
```

Runtimes may spell the type `http`, `streamable_http`, or `streamable-http`. Do not copy the key into a shared JSON file if that runtime cannot expand environment variables.

## Universal shell fallback

Requirements: Node.js 18 or newer and outbound HTTPS.

```bash
npm install -g github:super21-bat/trek-agent-control
trek config init --api-key 'trek_...' --url 'https://api.superd.fun/mcp'
trek skill sync --global
trek doctor
```

The mini program provides the endpoint, commands, and one-time key in one copied Agent access bundle. Do not split or repost that bundle. `trek config init` stores the key in `~/.trek/config.json` with mode `0600` on POSIX systems.

The public bootstrap source is `https://github.com/super21-bat/trek-agent-control`.
After `@trek-cn/cli` is published to npm, the shorter
`npm install -g @trek-cn/cli@latest` command may replace the GitHub install.

Optional environment overrides:

- `TREK_CONFIG`: custom config path.
- `TREK_MCP_TOKEN`: override the stored key.
- `TREK_MCP_URL`: defaults to `https://api.superd.fun/mcp`.
- `TREK_MCP_TIMEOUT_MS`: per-request timeout, default `20000`.
- `TREK_MCP_RETRIES`: retry count for 429/502/503/504 and network errors, default `7`.

## WorkBuddy, OpenClaw and Hermes

1. Install the CLI and run `trek skill sync --global`.
2. Run `trek config init` with the user's one-time key.
3. Add the native MCP block when supported.
4. Otherwise allow the agent to execute `trek ...`.
5. Run `doctor`; require `ok: true`, a protocol version, a positive tool count, and successful `list_trips` before giving write access.

Do not assume a runtime-specific Skill path: `trek skill sync` delegates placement to the installed Skills runner. The CLI fallback is the compatibility baseline.

## Diagnostics

Run `trek doctor` first. Its failure category determines the next check:

- `configuration`: inspect `trek config get`, then re-run `config init`.
- `network`: verify HTTPS/DNS/proxy access to the endpoint.
- `authentication`: create a fresh Agent Key, initialize it, and revoke the old key.
- `permission`: refresh `list_trips`; do not retry against another user's trip.
- `rate_limit`: wait and retry sequentially.
- `capability`: run `trek skill sync --global`, then inspect `trek tools`.

## Key rotation

Create one key per external agent so access can be revoked independently. After rotating:

1. Replace the secret in that runtime only.
2. Run `doctor` with the new key.
3. Revoke the old key in the mini program.
4. Confirm the old key returns 401.
