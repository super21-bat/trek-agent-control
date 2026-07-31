#!/usr/bin/env node

import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeBatchError, normalizeBatchResult } from './batch-result.mjs';

const CLI_VERSION = '0.1.3';
const DEFAULT_ENDPOINT = 'https://api.superd.fun/mcp';
const NPM_PACKAGE = '@trek-cn/cli';
const GITHUB_INSTALL_SPEC = 'https://github.com/super21-bat/trek-agent-control/archive/refs/heads/main.tar.gz';
const NPM_REGISTRY = 'https://registry.npmjs.org';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.env.TREK_CONFIG || join(homedir(), '.trek', 'config.json');
const storedConfig = readConfig();
const endpoint = (process.env.TREK_MCP_URL || storedConfig.mcpUrl || DEFAULT_ENDPOINT).replace(/\/$/, '');
const token = process.env.TREK_MCP_TOKEN || process.env.MCP_API_TOKEN || storedConfig.apiKey;
const timeoutMs = positiveInt(process.env.TREK_MCP_TIMEOUT_MS, 20_000);
const maxAttempts = positiveInt(process.env.TREK_MCP_RETRIES, 7);
const transientStatuses = new Set([429, 502, 503, 504]);

function readConfig() {
  if (!existsSync(configPath)) return {};
  try {
    chmodSync(configPath, 0o600);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new Error(`cannot read Trek config at ${configPath}: ${error?.message || error}`);
  }
}

function writeConfig(value) {
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writeFileSync(configPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value || '', 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePayload(text) {
  if (!text.trim()) return null;
  const lines = text.split('\n').filter((line) => line.startsWith('data:'));
  const value = lines.length ? lines.at(-1).slice(5).trim() : text.trim();
  return JSON.parse(value);
}

function parseJsonArg(value) {
  if (!value) return {};
  if (value.startsWith('@')) return JSON.parse(requireFile(value.slice(1)));
  return JSON.parse(value);
}

function requireFile(path) {
  return globalThis.__readFile(path);
}

function requireBinaryFile(path) {
  return globalThis.__readBinaryFile(path);
}

async function installNodeHelpers() {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  globalThis.__readFile = (path) => readFileSync(path, 'utf8');
  globalThis.__readBinaryFile = (filePath) => readFileSync(filePath);
  globalThis.__basename = (filePath) => path.basename(filePath);
  globalThis.__extname = (filePath) => path.extname(filePath).toLowerCase();
}

class TrekMcpClient {
  constructor() {
    this.sessionId = '';
    this.requestId = 0;
  }

  async request(method, params = {}, notification = false) {
    const body = { jsonrpc: '2.0', method, params };
    if (!notification) body.id = ++this.requestId;
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!this.sessionId) this.sessionId = response.headers.get('mcp-session-id') || '';
        const text = await response.text();
        if (transientStatuses.has(response.status) && attempt < maxAttempts - 1) {
          const retryAfter = Number.parseFloat(response.headers.get('retry-after') || '');
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(15_000, 700 * (2 ** attempt)) + Math.floor(Math.random() * 250);
          process.stderr.write(`[trek-mcp] ${method} HTTP ${response.status}; retry in ${delay}ms\n`);
          await sleep(delay);
          continue;
        }
        if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${text.slice(0, 400)}`);
        if (notification || !text.trim()) return null;
        const payload = parsePayload(text);
        if (payload?.error) throw new Error(`${method}: ${JSON.stringify(payload.error)}`);
        return payload?.result;
      } catch (error) {
        lastError = error;
        const retryable = error?.name === 'TimeoutError' || error?.name === 'TypeError';
        if (!retryable || attempt === maxAttempts - 1) throw error;
        const delay = Math.min(10_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250);
        process.stderr.write(`[trek-mcp] ${method} network failure; retry in ${delay}ms\n`);
        await sleep(delay);
      }
    }
    throw lastError || new Error(`${method}: retry budget exhausted`);
  }

  async initialize(clientName = 'trek-agent-control') {
    const initialized = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName, version: '1.0.0' },
    });
    await this.request('notifications/initialized', {}, true);
    return initialized;
  }

  async callTool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    if (result?.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
    const texts = (result?.content || []).filter((item) => item.type === 'text').map((item) => item.text);
    for (const text of texts.reverse()) {
      try { return JSON.parse(text); } catch {}
    }
    throw new Error(`${name}: no JSON payload`);
  }

  async close() {
    if (!this.sessionId) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'DELETE',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { Authorization: `Bearer ${token}`, 'mcp-session-id': this.sessionId },
        });
        if (!transientStatuses.has(response.status) || attempt === 2) break;
      } catch {
        if (attempt === 2) break;
      }
      await sleep(400 * (2 ** attempt));
    }
    this.sessionId = '';
  }
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function redact(value) {
  if (!value) return null;
  return 'configured';
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version || CLI_VERSION;
  } catch {
    return CLI_VERSION;
  }
}

function configCommand(args) {
  const [action = 'get'] = args;
  if (action === 'get') {
    return print({
      ok: true,
      configPath,
      endpoint,
      apiKey: redact(token),
      source: process.env.TREK_MCP_TOKEN || process.env.MCP_API_TOKEN ? 'environment' : storedConfig.apiKey ? 'config' : 'missing',
    });
  }
  if (action !== 'init') throw new Error(`unknown config command: ${action}`);
  const apiKey = optionValue(args, '--api-key') || process.env.TREK_MCP_TOKEN || process.env.MCP_API_TOKEN;
  const mcpUrl = optionValue(args, '--url') || storedConfig.mcpUrl || DEFAULT_ENDPOINT;
  if (!apiKey?.startsWith('trek_')) throw new Error('config init requires a valid trek_ key through --api-key or TREK_MCP_TOKEN');
  let parsed;
  try {
    parsed = new URL(mcpUrl);
  } catch {
    throw new Error('config init requires a valid absolute --url');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('config URL must use HTTPS except for localhost diagnostics');
  }
  writeConfig({ mcpUrl: parsed.toString().replace(/\/$/, ''), apiKey });
  return print({ ok: true, configPath, endpoint: parsed.toString().replace(/\/$/, ''), apiKey: redact(apiKey), permissions: '0600' });
}

function validateSkillPackage() {
  const skillFile = join(packageRoot, 'SKILL.md');
  const failures = [];
  if (!existsSync(skillFile)) failures.push('SKILL.md is missing');
  const text = existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : '';
  if (!/^---\n[\s\S]*?\n---\n/.test(text)) failures.push('SKILL.md frontmatter is invalid');
  if (!/^name:\s*trek-agent-control\s*$/m.test(text)) failures.push('SKILL.md name must be trek-agent-control');
  for (const match of text.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    const target = resolve(packageRoot, match[1].split('#')[0]);
    if (!existsSync(target)) failures.push(`broken SKILL.md link: ${match[1]}`);
  }
  return { ok: failures.length === 0, skillFile, failures };
}

function isTrekSkill(path) {
  try {
    return /^name:\s*trek-agent-control\s*$/m.test(readFileSync(join(path, 'SKILL.md'), 'utf8'));
  } catch {
    return false;
  }
}

function syncHermesSkill() {
  const hermesRoot = join(homedir(), '.hermes');
  if (!existsSync(hermesRoot)) {
    return { detected: false, installed: false, reason: 'Hermes home not found' };
  }

  const skillsRoot = join(hermesRoot, 'skills');
  const target = join(skillsRoot, 'trek-agent-control');
  mkdirSync(skillsRoot, { recursive: true, mode: 0o700 });

  let targetExists = false;
  try {
    lstatSync(target);
    targetExists = true;
  } catch {}
  if (targetExists && !isTrekSkill(target)) {
    throw new Error(`refusing to replace non-Trek Hermes Skill at ${target}`);
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const temporary = `${target}.tmp-${suffix}`;
  const backup = `${target}.bak-${suffix}`;
  try {
    mkdirSync(temporary, { recursive: false, mode: 0o700 });
    for (const entry of ['SKILL.md', 'references', 'assets']) {
      const source = join(packageRoot, entry);
      if (existsSync(source)) cpSync(source, join(temporary, entry), { recursive: true, dereference: true });
    }
    if (!isTrekSkill(temporary)) throw new Error('copied Hermes Skill failed integrity validation');
    if (targetExists) renameSync(target, backup);
    try {
      renameSync(temporary, target);
    } catch (error) {
      if (targetExists && existsSync(backup)) renameSync(backup, target);
      throw error;
    }
    if (targetExists) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }

  const resolvedSkillFile = realpathSync(join(target, 'SKILL.md'));
  const trustedRoot = `${realpathSync(skillsRoot)}${process.platform === 'win32' ? '\\' : '/'}`;
  if (!resolvedSkillFile.startsWith(trustedRoot)) {
    throw new Error(`Hermes Skill resolved outside its trusted directory: ${resolvedSkillFile}`);
  }
  return {
    detected: true,
    installed: true,
    type: 'copy',
    path: target,
    trustedPathVerified: true,
    restartRequired: true,
  };
}

function skillCommand(args) {
  const [action = 'show'] = args;
  const report = validateSkillPackage();
  if (action === 'show') return print({ ok: true, name: 'trek-agent-control', version: packageVersion(), packageRoot, skillFile: report.skillFile });
  if (action === 'check') {
    print(report);
    if (!report.ok) process.exitCode = 2;
    return;
  }
  if (action !== 'sync') throw new Error(`unknown skill command: ${action}`);
  if (!report.ok) throw new Error(`skill package validation failed: ${report.failures.join('; ')}`);
  const globalInstall = args.includes('--global');
  const commandArgs = ['-y', 'skills', 'add', packageRoot, ...(globalInstall ? ['-g'] : []), '-y'];
  const result = spawnSync('npx', commandArgs, { stdio: 'inherit' });
  if (result.error) throw new Error(`cannot start npx: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`skill sync failed with exit code ${result.status}`);
  const hermes = globalInstall ? syncHermesSkill() : { detected: false, installed: false, reason: 'global sync not requested' };
  return print({
    ok: true,
    installed: true,
    global: globalInstall,
    source: packageRoot,
    hermes,
    nextSteps: hermes.installed ? ['Restart the Hermes gateway or start a new Hermes session.', 'Run trek doctor.'] : ['Run trek doctor.'],
  });
}

function updateCommand(args) {
  const current = packageVersion();
  const lookup = spawnSync('npm', ['view', NPM_PACKAGE, 'version', `--registry=${NPM_REGISTRY}`], { encoding: 'utf8' });
  if (lookup.error) throw new Error(`cannot start npm: ${lookup.error.message}`);
  if (lookup.status !== 0 && args.includes('--check')) {
    return print({
      ok: true,
      current,
      latest: null,
      source: 'github',
      updateAvailable: null,
      message: `The npm package is not published yet. Reinstall from ${GITHUB_INSTALL_SPEC} to refresh.`,
    });
  }
  if (lookup.status !== 0) return installUpdate(current, GITHUB_INSTALL_SPEC, 'github');
  const latest = lookup.stdout.trim();
  if (args.includes('--check')) return print({ ok: true, current, latest, updateAvailable: current !== latest });
  if (current === latest) return print({ ok: true, current, latest, updated: false, message: 'Trek CLI is already up to date.' });
  return installUpdate(current, `${NPM_PACKAGE}@latest`, 'npm', latest);
}

function installUpdate(current, installSpec, source, latest = null) {
  const installed = spawnSync('npm', ['install', '-g', installSpec], { stdio: 'inherit' });
  if (installed.error) throw new Error(`cannot start npm install: ${installed.error.message}`);
  if (installed.status !== 0) throw new Error(`CLI update failed with exit code ${installed.status}`);
  const synced = spawnSync('trek', ['skill', 'sync', '--global'], { stdio: 'inherit' });
  if (synced.error) throw new Error(`CLI updated, but Skill sync could not start: ${synced.error.message}`);
  if (synced.status !== 0) throw new Error(`CLI updated, but Skill sync failed with exit code ${synced.status}`);
  return print({ ok: true, previous: current, current: latest, source, updated: true, skillSynced: true, nextCommand: 'trek doctor' });
}

function localDoctorChecks() {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'node', ok: nodeMajor >= 18, value: process.version, fix: nodeMajor >= 18 ? null : 'Install Node.js 18 or newer.' });
  checks.push({ name: 'endpoint', ok: /^https:\/\//.test(endpoint) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(endpoint), value: endpoint, fix: 'Run trek config init with a valid HTTPS MCP URL.' });
  checks.push({ name: 'api-key', ok: Boolean(token?.startsWith('trek_')), value: redact(token), fix: 'Create a key in the Trek mini program, then run trek config init --api-key <key>.' });
  if (existsSync(configPath)) {
    const mode = statSync(configPath).mode & 0o777;
    checks.push({ name: 'config-permissions', ok: process.platform === 'win32' || mode === 0o600, value: process.platform === 'win32' ? 'managed-by-windows' : mode.toString(8), fix: `Run chmod 600 ${configPath}.` });
  } else {
    checks.push({ name: 'config-file', ok: Boolean(process.env.TREK_MCP_TOKEN || process.env.MCP_API_TOKEN), value: configPath, fix: 'Run trek config init.' });
  }
  const skill = validateSkillPackage();
  checks.push({ name: 'skill-package', ok: skill.ok, value: skill.skillFile, fix: skill.ok ? null : 'Reinstall the CLI package, then run trek skill check.' });
  return checks;
}

function diagnostic(error) {
  const message = String(error?.message || error);
  if (/401|trek_ key|TOKEN is required/i.test(message)) {
    return { category: 'authentication', hint: 'The key is missing, malformed, expired, or revoked. Create a new Agent Key and run trek config init again.', nextCommand: 'trek config get' };
  }
  if (/403/i.test(message)) return { category: 'permission', hint: 'The connected user lacks access to this trip or tool.', nextCommand: 'trek call list_trips "{}"' };
  if (/429/i.test(message)) return { category: 'rate_limit', hint: 'Wait before retrying and keep writes sequential.', nextCommand: 'trek doctor' };
  if (/fetch|network|ECONN|ENOTFOUND|timeout|timed out/i.test(message)) {
    return { category: 'network', hint: 'Check DNS, HTTPS access, proxy settings, and the configured MCP URL.', nextCommand: 'trek config get' };
  }
  if (/unknown\/unavailable tool|missing .*tools/i.test(message)) {
    return { category: 'capability', hint: 'The server and Skill may be on different versions. Refresh the Skill and inspect live tools.', nextCommand: 'trek skill sync --global && trek tools' };
  }
  if (/config|apiKey|JSON/i.test(message)) return { category: 'configuration', hint: 'Check the local config and initialize it again.', nextCommand: 'trek config get' };
  return { category: 'unknown', hint: 'Run trek doctor and keep the structured error output for support.', nextCommand: 'trek doctor' };
}

function normalizePlanName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function help() {
  process.stdout.write(`Trek CLI ${packageVersion()}\n\n` +
    `Configuration: trek config init --api-key <trek_key> [--url <mcp-url>]\n` +
    `Environment override: TREK_MCP_TOKEN, TREK_MCP_URL, TREK_CONFIG\n\n` +
    `Commands:\n` +
    `  config init --api-key <trek_key> [--url <mcp-url>]\n` +
    `  config get\n` +
    `  skill show | check | sync [--global]\n` +
    `  update [--check]\n` +
    `  doctor\n` +
    `  tools [filter]\n` +
    `  call <tool-name> '<json>' | @/absolute/args.json\n` +
    `  summary <trip-id>\n` +
    `  audit-plan <trip-id> <expected-assignments.json>\n` +
    `  upload-file <trip-id> <absolute-file> [--assignment <id>] [--reservation <id>] [--place <id>] [--description <text>]\n` +
    `  rename-file <trip-id> <file-id> <display-filename>\n` +
    `  batch <actions.json> [--apply] [--confirm-high-risk]\n` +
    `  smoke --allow-write-smoke\n`);
}

const highRisk = /(^|_)(delete|remove|decide|schedule|settle|restore|rotate)(_|$)/i;
const attachmentMimeTypes = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.heic', 'image/heic'],
  ['.pdf', 'application/pdf'], ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.txt', 'text/plain'], ['.csv', 'text/csv'],
  ['.pkpass', 'application/vnd.apple.pkpass'], ['.pkpasses', 'application/vnd.apple.pkpasses'],
]);

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveId(value, label) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

async function main() {
  await installNodeHelpers();
  const [command = 'help', ...args] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') return help();
  if (command === '--version' || command === '-v' || command === 'version') return process.stdout.write(`${packageVersion()}\n`);
  if (command === 'config') return configCommand(args);
  if (command === 'skill') return skillCommand(args);
  if (command === 'update') return updateCommand(args);
  const checks = localDoctorChecks();
  const localFailure = checks.find((check) => !check.ok);
  if (!token && command !== 'doctor') throw new Error('TREK_MCP_TOKEN is required; run trek config init or provide it through an environment variable');
  if (command === 'doctor' && localFailure) {
    print({ ok: false, stage: 'local', checks, ...diagnostic(new Error(localFailure.fix)) });
    process.exitCode = 2;
    return;
  }

  const client = new TrekMcpClient();
  let temporaryTripId = null;
  try {
    const initialized = await client.initialize();
    const listed = await client.request('tools/list');
    const tools = listed?.tools || [];
    const names = new Set(tools.map((tool) => tool.name));

    if (command === 'doctor') {
      const trips = await client.callTool('list_trips', { include_archived: false });
      return print({
        ok: true,
        stage: 'complete',
        authentication: 'verified-live',
        readback: 'list_trips',
        checks,
        endpoint,
        protocolVersion: initialized?.protocolVersion,
        toolCount: tools.length,
        tripCount: trips.trips?.length ?? 0,
      });
    }
    if (command === 'tools') {
      const filter = (args[0] || '').toLowerCase();
      return print(tools.filter((tool) => !filter || tool.name.toLowerCase().includes(filter)));
    }
    if (command === 'call') {
      const [name, jsonArg] = args;
      if (!name) throw new Error('call requires a tool name');
      if (!names.has(name)) throw new Error(`unknown/unavailable tool: ${name}`);
      return print(await client.callTool(name, parseJsonArg(jsonArg)));
    }
    if (command === 'summary') {
      const tripId = Number(args[0]);
      if (!Number.isInteger(tripId) || tripId < 1) throw new Error('summary requires a positive trip ID');
      return print(await client.callTool('get_trip_summary', { tripId }));
    }
    if (command === 'audit-plan') {
      const tripId = positiveId(args[0], 'trip-id');
      const expectedPath = args[1];
      if (!expectedPath) throw new Error('audit-plan requires an expected assignments JSON file');
      const expected = JSON.parse(requireFile(expectedPath));
      if (!expected || Array.isArray(expected) || typeof expected !== 'object') {
        throw new Error('expected assignments must be an object mapping YYYY-MM-DD dates to arrays of place/activity names');
      }
      for (const [date, namesForDate] of Object.entries(expected)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(namesForDate) || namesForDate.some((name) => typeof name !== 'string' || !name.trim())) {
          throw new Error(`invalid expected assignments entry for ${date}`);
        }
      }
      const summary = await client.callTool('get_trip_summary', { tripId });
      const days = Array.isArray(summary.days) ? summary.days : [];
      const results = Object.entries(expected).map(([date, expectedNames]) => {
        const day = days.find((item) => String(item.date || item.day_date || item.isoDate || '') === date);
        const actualNames = (day?.assignments || []).map((assignment) =>
          String(assignment.place?.name || assignment.place_name || assignment.name || ''),
        ).filter(Boolean);
        const actualNormalized = new Map(actualNames.map((name) => [normalizePlanName(name), name]));
        const expectedNormalized = new Map(expectedNames.map((name) => [normalizePlanName(name), name]));
        const missing = [...expectedNormalized].filter(([key]) => !actualNormalized.has(key)).map(([, name]) => name);
        const unexpected = [...actualNormalized].filter(([key]) => !expectedNormalized.has(key)).map(([, name]) => name);
        return { date, dayId: day?.id ?? null, expected: expectedNames, actual: actualNames, missing, unexpected, ok: !!day && missing.length === 0 && unexpected.length === 0 };
      });
      const ok = results.every((item) => item.ok);
      print({ ok, tripId, checkedDates: results.length, results });
      if (!ok) process.exitCode = 2;
      return;
    }
    if (command === 'upload-file') {
      if (!names.has('upload_trip_file')) throw new Error('upload_trip_file is unavailable on this server');
      const tripId = positiveId(args[0], 'trip-id');
      const filePath = args[1];
      if (!filePath || filePath.startsWith('--')) throw new Error('upload-file requires an absolute local file path');
      const bytes = requireBinaryFile(filePath);
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('MCP attachments must be between 1 byte and 10 MB');
      const extension = globalThis.__extname(filePath);
      const mimeType = attachmentMimeTypes.get(extension);
      if (!mimeType) throw new Error(`unsupported attachment extension: ${extension || '(none)'}`);
      return print(await client.callTool('upload_trip_file', {
        tripId,
        filename: globalThis.__basename(filePath),
        mime_type: mimeType,
        content_base64: bytes.toString('base64'),
        description: optionValue(args, '--description'),
        assignment_id: positiveId(optionValue(args, '--assignment'), 'assignment'),
        reservation_id: positiveId(optionValue(args, '--reservation'), 'reservation'),
        place_id: positiveId(optionValue(args, '--place'), 'place'),
      }));
    }
    if (command === 'rename-file') {
      if (!names.has('rename_trip_file')) throw new Error('rename_trip_file is unavailable on this server');
      const tripId = positiveId(args[0], 'trip-id');
      const fileId = positiveId(args[1], 'file-id');
      const filename = args[2];
      if (!filename) throw new Error('rename-file requires a display filename with the original extension');
      return print(await client.callTool('rename_trip_file', { tripId, fileId, filename }));
    }
    if (command === 'batch') {
      const file = args.find((arg) => !arg.startsWith('--'));
      if (!file) throw new Error('batch requires an actions JSON file');
      const actions = JSON.parse(requireFile(file));
      if (!Array.isArray(actions)) throw new Error('batch file must contain a JSON array');
      for (const [index, action] of actions.entries()) {
        if (!action || typeof action.tool !== 'string' || typeof action.arguments !== 'object') throw new Error(`invalid action at index ${index}`);
        if (!names.has(action.tool)) throw new Error(`unknown/unavailable tool at index ${index}: ${action.tool}`);
      }
      if (!args.includes('--apply')) return print({ ok: true, dryRun: true, count: actions.length, actions });
      const risky = actions.filter((action) => highRisk.test(action.tool)).map((action) => action.tool);
      if (risky.length && !args.includes('--confirm-high-risk')) throw new Error(`high-risk tools require --confirm-high-risk: ${[...new Set(risky)].join(', ')}`);
      const results = [];
      for (const [index, action] of actions.entries()) {
        try {
          const value = await client.callTool(action.tool, action.arguments);
          results.push({ index, label: action.label || null, tool: action.tool, ...normalizeBatchResult(value) });
        } catch (error) {
          results.push({ index, label: action.label || null, tool: action.tool, ...normalizeBatchError(error) });
          break;
        }
      }
      const failureCount = results.filter((result) => !result.ok).length;
      print({
        ok: failureCount === 0 && results.length === actions.length,
        dryRun: false,
        requestedCount: actions.length,
        count: results.length,
        failureCount,
        stoppedEarly: results.length < actions.length,
        results,
      });
      if (failureCount || results.length < actions.length) process.exitCode = 2;
      return;
    }
    if (command === 'smoke') {
      if (!args.includes('--allow-write-smoke')) throw new Error('smoke creates temporary data; pass --allow-write-smoke');
      const required = ['create_trip', 'get_trip_summary', 'create_trip_proposal', 'react_trip_proposal', 'decide_trip_proposal', 'schedule_trip_proposal', 'list_trip_proposals', 'delete_trip'];
      const missing = required.filter((name) => !names.has(name));
      if (missing.length) throw new Error(`missing smoke tools: ${missing.join(', ')}`);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const created = await client.callTool('create_trip', {
        title: `Trek agent package smoke ${stamp}`,
        description: 'Temporary automated verification trip; deleted by the same run.',
        start_date: '2027-12-30', end_date: '2027-12-30', currency: 'CNY',
      });
      temporaryTripId = created.trip.id;
      const summary = await client.callTool('get_trip_summary', { tripId: temporaryTripId });
      const dayId = summary.days?.[0]?.id;
      if (!dayId) throw new Error('smoke trip has no generated day');
      const proposal = await client.callTool('create_trip_proposal', {
        tripId: temporaryTripId, title: '临时冒烟地点', placeName: '临时冒烟地点',
        placeAddress: '测试完成自动删除', latitude: 22.5431, longitude: 114.0579,
        reason: '验证候选地点闭环',
      });
      const proposalId = proposal.proposal.id;
      await client.callTool('react_trip_proposal', { tripId: temporaryTripId, proposalId, reaction: 'want' });
      await client.callTool('decide_trip_proposal', { tripId: temporaryTripId, proposalId, decision: 'accepted' });
      await client.callTool('schedule_trip_proposal', { tripId: temporaryTripId, proposalId, dayId });
      const proposals = await client.callTool('list_trip_proposals', { tripId: temporaryTripId });
      const final = proposals.proposals?.find((item) => item.id === proposalId);
      if (final?.status !== 'scheduled') throw new Error(`proposal ended in unexpected status: ${final?.status}`);
      await client.callTool('delete_trip', { tripId: temporaryTripId });
      temporaryTripId = null;
      return print({ ok: true, protocolVersion: initialized?.protocolVersion, toolCount: tools.length, lifecycle: 'create -> react -> accept -> schedule -> delete', cleanup: 'complete' });
    }
    throw new Error(`unknown command: ${command}`);
  } finally {
    if (temporaryTripId) {
      try { await client.callTool('delete_trip', { tripId: temporaryTripId }); } catch {}
    }
    await client.close();
  }
}

main().catch((error) => {
  const detail = diagnostic(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: { message: error?.message || String(error), ...detail } }, null, 2)}\n`);
  process.exitCode = 1;
});
