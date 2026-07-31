import assert from 'node:assert/strict';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
  assert.equal(result.stdout.trim(), '0.1.3');
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
  assert.equal(JSON.parse(shown.stdout).apiKey, 'configured');
  assert.doesNotMatch(shown.stdout, /trek_test_1234567890/);
  assert.doesNotMatch(shown.stdout, /123456|7890|trek_tes/);
});

test('installs a real Hermes Skill copy inside the trusted directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'trek-home-'));
  const bin = join(home, 'bin');
  const hermesSkills = join(home, '.hermes', 'skills');
  const target = join(hermesSkills, 'trek-agent-control');
  mkdirSync(bin, { recursive: true });
  mkdirSync(hermesSkills, { recursive: true });
  const fakeNpx = join(bin, 'npx');
  writeFileSync(fakeNpx, '#!/bin/sh\nexit 0\n');
  chmodSync(fakeNpx, 0o755);
  symlinkSync(resolve('.'), target, 'dir');

  const synced = run(['skill', 'sync', '--global'], {
    HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
    TREK_CONFIG: join(home, '.trek', 'config.json'),
  });
  assert.equal(synced.status, 0, synced.stderr);
  const report = JSON.parse(synced.stdout);
  assert.equal(report.hermes.type, 'copy');
  assert.equal(report.hermes.trustedPathVerified, true);
  assert.equal(lstatSync(target).isSymbolicLink(), false);
  assert.ok(realpathSync(join(target, 'SKILL.md')).startsWith(`${realpathSync(hermesSkills)}/`));
  assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), readFileSync(resolve('SKILL.md'), 'utf8'));
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
