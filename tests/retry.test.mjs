import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

for (const failure of ['gateway', 'disconnect', 'timeout', 'rate-limit']) {
  test(`tool call handles ${failure} without ambiguous replay`, async () => {
    let calls = 0;
    const directory = mkdtempSync(join(tmpdir(), 'trek-retry-'));
    const server = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const reply = result => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
      };
      if (body.method === 'tools/call') {
        calls++;
        if (calls === 1) {
          if (failure === 'disconnect') return req.socket.destroy();
          if (failure === 'timeout') return;
          res.statusCode = failure === 'gateway' ? 504 : 429;
          res.setHeader('retry-after', '0.001');
          return res.end('temporary failure');
        }
        return reply({ content: [{ type: 'text', text: '{"ok":true}' }] });
      }
      if (body.method === 'tools/list') return reply({ tools: [{ name: 'create_trip' }] });
      if (body.method === 'notifications/initialized') { res.statusCode = 202; return res.end(); }
      reply({ protocolVersion: '2024-11-05' });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const child = spawn(process.execPath, [resolve('scripts/trek-mcp.mjs'), 'call', 'create_trip', '{}'], {
        env: { ...process.env, TREK_CONFIG: join(directory, 'config.json'), TREK_MCP_TOKEN: 'test-only',
          TREK_MCP_URL: `http://127.0.0.1:${server.address().port}/mcp`, TREK_MCP_RETRIES: '2', TREK_MCP_TIMEOUT_MS: '200' },
      });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.stdout.resume();
      const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
      assert.equal(calls, failure === 'rate-limit' ? 2 : 1);
      assert.equal(code, failure === 'rate-limit' ? 0 : 1, stderr);
      if (failure !== 'rate-limit') assert.match(stderr, /outcome unknown.*Read back.*not replayed/);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
