// Compare the Docker daemon architecture, not the laptop's Node architecture:
// an Apple Silicon host may deliberately run an amd64 Colima VM.
export function requireFilmPlatform(info, platform) {
  if (info?.OSType !== 'linux' || String(info.CgroupVersion) !== '2') throw Error('Linux Docker with cgroup v2 required');
  if (!['linux/amd64', 'linux/arm64'].includes(platform)) throw Error('local_renderer_platform_unsupported: use a verified linux/amd64 or linux/arm64 runtime bundle');
  const architecture = { amd64: 'amd64', x86_64: 'amd64', arm64: 'arm64', aarch64: 'arm64' }[info.Architecture];
  if (!architecture || platform !== `linux/${architecture}`) throw Error(`local_renderer_platform_mismatch: bundle ${platform}, Docker ${architecture || 'unknown'}; obtain a matching verified runtime, do not silently enable emulation or reconfigure Docker`);
  return platform;
}
