import test from 'node:test';
import assert from 'node:assert/strict';
import { requireFilmPlatform } from '../scripts/film-platform.mjs';
test('uses Docker architecture aliases, not the host Node architecture', () => {
  for (const [Architecture, platform] of [['x86_64','linux/amd64'], ['amd64','linux/amd64'], ['aarch64','linux/arm64'], ['arm64','linux/arm64']]) {
    assert.equal(requireFilmPlatform({ OSType:'linux', CgroupVersion:'2', Architecture }, platform), platform);
  }
});
test('rejects mismatch, unknown architecture, unsupported bundles and unsafe Docker', () => {
  const info = { OSType:'linux', CgroupVersion:2, Architecture:'aarch64' };
  assert.throws(() => requireFilmPlatform(info, 'linux/amd64'), /platform_mismatch/);
  assert.throws(() => requireFilmPlatform({...info, Architecture:'mystery'}, 'linux/arm64'), /platform_mismatch/);
  assert.throws(() => requireFilmPlatform(info, 'darwin/arm64'), /platform_unsupported/);
  assert.throws(() => requireFilmPlatform(info, undefined), /platform_unsupported/);
  assert.throws(() => requireFilmPlatform({...info, CgroupVersion:1}, 'linux/arm64'), /cgroup v2/);
  assert.throws(() => requireFilmPlatform({...info, OSType:'windows'}, 'linux/arm64'), /Linux Docker/);
});
