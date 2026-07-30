import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = resolve('scripts/trek-mcp.mjs');

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: { ...process.env, TREK_MCP_TOKEN: '', MCP_API_TOKEN: '', ...env },
  });
}

test('prints the packaged version without credentials', () => {
  const result = run(['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '0.1.2');
});

test('initializes and redacts a local config', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trek-cli-'));
  const config = join(directory, 'config.json');
  const env = { TREK_CONFIG: config };
  const initialized = run(['config', 'init', '--api-key', 'trek_test_1234567890', '--url', 'https://example.com/mcp'], env);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).permissions, '0600');
  assert.equal(statSync(config).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(config, 'utf8')).apiKey, 'trek_test_1234567890');

  const shown = run(['config', 'get'], env);
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).apiKey, 'trek_tes...7890');
  assert.doesNotMatch(shown.stdout, /trek_test_1234567890/);
});

test('validates the bundled Skill and diagnoses a missing key', () => {
  const config = join(mkdtempSync(join(tmpdir(), 'trek-cli-')), 'config.json');
  const checked = run(['skill', 'check'], { TREK_CONFIG: config });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).ok, true);

  const doctor = run(['doctor'], { TREK_CONFIG: config });
  assert.equal(doctor.status, 2);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.category, 'configuration');
  assert.ok(report.checks.some((check) => check.name === 'api-key' && !check.ok));
});
