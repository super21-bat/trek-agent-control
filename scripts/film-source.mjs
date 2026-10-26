// Source-only installation. The release digest is part of the CLI, never taken
// from itinerary text, a model-generated URL or a neighboring manifest.
import fs from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { preflightFilmRuntime } from './film-setup.mjs';
import { CREATIVE_RUNTIME } from './film-input.mjs';

export const FILM_SOURCE = Object.freeze({
  url:'https://github.com/super21-bat/trek-agent-control/releases/download/film-runtime-2026-10-21.3-source.1/runtime-source.json',
  sha256:'85ee8643991a4da14d5050086950546d06da801faac94517baebd8830871064c',
  platform:'linux/amd64', maxBytes:12*1024*1024,
});
const PROFILE='270d7d0a62f62bfdf6c67308d6bb3f2fd59be6e5a746e37ed3a7ca058136b43a';
const VERIFIED_LOCAL_BASE='sha256:212009d5dda5883984e5cbac143f7b96a916f042831c9fffc05efc8b7a9e277a';
const hash=b=>createHash('sha256').update(b).digest('hex');
const safe=n=>typeof n==='string'&&!n.includes('\\')&&!n.includes(':')&&!n.split('/').some(p=>!p||p==='.'||p==='..');

export function validateFilmSource(bytes, expectedDigest=FILM_SOURCE.sha256) {
  if(bytes.length>FILM_SOURCE.maxBytes||hash(bytes)!==expectedDigest)throw Error('local_renderer_source_integrity_mismatch');
  const v=JSON.parse(bytes);
  if(v.format!=='dazi-film-source-v1'||v.contract!==CREATIVE_RUNTIME||v.platform!==FILM_SOURCE.platform||!v.files||Array.isArray(v.files)||Object.keys(v.files).length>64)throw Error('Invalid film source contract');
  const files=new Map();let total=0;
  for(const [name,encoded]of Object.entries(v.files)){
    if(!safe(name)||typeof encoded!=='string')throw Error('Unsafe film source path');
    const data=Buffer.from(encoded,'base64');total+=data.length;
    if(data.toString('base64')!==encoded||data.length>4*1024*1024||total>9*1024*1024)throw Error('Invalid bounded film source data');
    files.set(name,data);
  }
  const raw=files.get('runtime-materials.json');
  if(!raw||hash(raw)!==v.materialsSha256)throw Error('Film materials integrity mismatch');
  const m=JSON.parse(raw);
  if(m.format!=='dazi-runtime-materials-v1'||m.engineRevision!=='65ab781832cace6e0f28d4c00452410a99f3a02c'||!m.sourceFiles||!m.engineFiles)throw Error('Invalid source materials');
  const checks={...m.sourceFiles,...Object.fromEntries(Object.entries(m.engineFiles).map(([n,h])=>['engine/'+n,h])),Dockerfile:m.dockerfileSha256,'package-lock.json':m.packageLockSha256,'seccomp_profile.json':m.seccompSha256};
  const expected=[...Object.keys(checks),'package.json','engine/.dazi-integrity.json','runtime-materials.json'];
  if(files.size!==expected.length||expected.some(n=>!safe(n)||!files.has(n)))throw Error('Unexpected or missing source files');
  for(const [name,digest]of Object.entries(checks))if(!/^[a-f0-9]{64}$/.test(digest)||hash(files.get(name))!==digest)throw Error('Source file integrity mismatch');
  if(m.seccompSha256!==PROFILE)throw Error('Unrecognized source seccomp profile');
  const integrity=JSON.parse(files.get('engine/.dazi-integrity.json'));
  if(integrity.revision!==m.engineRevision||JSON.stringify(integrity.files)!==JSON.stringify(m.engineFiles))throw Error('Engine integrity manifest mismatch');
  return{files,materialsSha256:v.materialsSha256};
}
async function getSource(sourceFile){
  if(sourceFile){
    if(!isAbsolute(sourceFile)||fs.realpathSync(sourceFile)!==sourceFile||!fs.lstatSync(sourceFile).isFile()||fs.statSync(sourceFile).size>FILM_SOURCE.maxBytes)throw Error('Use a canonical bounded source file');
    return fs.readFileSync(sourceFile);
  }
  const res=await fetch(FILM_SOURCE.url,{signal:AbortSignal.timeout(120000)});
  if(!res.ok||!res.body)throw Error('local_renderer_source_download_failed: fixed release is unavailable; no alternate URL used');
  const chunks=[];let size=0;
  for await(const chunk of res.body){size+=chunk.length;if(size>FILM_SOURCE.maxBytes)throw Error('Film source download exceeds limit');chunks.push(chunk)}
  return Buffer.concat(chunks);
}
function command(exe,args,options={}){
  const r=spawnSync(exe,args,{encoding:'utf8',shell:false,timeout:15000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'},...options});
  if(r.error||r.status!==0)throw Error(`local_renderer_source_command_failed: ${args[0]}`);
  return r.stdout;
}
export async function installFilmSource(output,{confirmBuild=false,sourceFile}={}){
  if(!isAbsolute(output)||fs.realpathSync(dirname(output))!==dirname(output))throw Error('Use a canonical absolute output in an existing private directory');
  if(fs.existsSync(output))throw Error('Runtime output already exists; preserve existing configuration');
  if(!confirmBuild)return{ok:true,requiresConfirmation:'--confirm-build',source:FILM_SOURCE,requires:['local Linux amd64 Docker/cgroup v2','ffmpeg','ffprobe'],buildUsesNetwork:true,credentialsRequired:false,installsPerformed:false};
  const tools=preflightFilmRuntime(FILM_SOURCE.platform);
  const endpoint=command(tools.docker,['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim();
  if(!/^(unix|npipe):\/\//.test(endpoint))throw Error('local_renderer_remote_docker_rejected: use a local Docker daemon');
  const source=validateFilmSource(await getSource(sourceFile));
  const work=fs.mkdtempSync(join(dirname(output),'.dazi-film-source-'));fs.chmodSync(work,0o700);
  const stage=value=>fs.writeFileSync(join(work,'install-state.json'),JSON.stringify({stage:value}),{mode:0o600});
  try{
    // These are public source materials. 0644 inside a private 0700 workspace
    // also keeps COPY'd package manifests/notices readable by the image user.
    for(const [name,bytes]of source.files){const target=join(work,name);fs.mkdirSync(dirname(target),{recursive:true,mode:0o755});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o644})}
    stage('building');
    const args=['build','--platform',FILM_SOURCE.platform,'--iidfile',join(work,'image.id')];
    // This cached archive-normalized base was compared with the fixed official
    // registry config/rootfs. Never accept an arbitrary user-supplied base image.
    try{const base=JSON.parse(command(tools.docker,['image','inspect',VERIFIED_LOCAL_BASE]))[0];if(base.Id===VERIFIED_LOCAL_BASE&&base.Architecture==='amd64'&&base.Os==='linux')args.push('--build-arg',`BASE_IMAGE=${VERIFIED_LOCAL_BASE}`)}catch{}
    args.push(work);
    const log=fs.openSync(join(work,'build.log'),'wx',0o600);
    try{command(tools.docker,args,{timeout:1200000,stdio:['ignore',log,log]})}finally{fs.closeSync(log)}
    const imageId=fs.readFileSync(join(work,'image.id'),'utf8').trim();
    if(!/^sha256:[a-f0-9]{64}$/.test(imageId))throw Error('Invalid built image identity');
    const image=JSON.parse(command(tools.docker,['image','inspect',imageId]))[0];
    if(image.Id!==imageId||image.Os!=='linux'||image.Architecture!=='amd64'||image.Config?.Labels?.['fun.superd.dazi.film.creative']!==CREATIVE_RUNTIME)throw Error('Built image contract mismatch');
    const inside=command(tools.docker,['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--pids-limit','32','--entrypoint','node',imageId,'-e',"process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync('/app/runtime-materials.json')).digest('hex'))"]).trim();
    if(inside!==source.materialsSha256)throw Error('Built image source mismatch');
    stage('verified');
    fs.writeFileSync(output,JSON.stringify({docker:tools.docker,ffprobe:tools.ffprobe,ffmpeg:tools.ffmpeg,imageId,seccompPath:join(work,'seccomp_profile.json')}),{flag:'wx',mode:0o600});
    return{ok:true,path:output,imageId,contract:CREATIVE_RUNTIME,platform:FILM_SOURCE.platform,sourceSha256:FILM_SOURCE.sha256,sourceWorkspace:work,sourceDownloaded:!sourceFile,cloudFallback:false,otherContainersChanged:false};
  }catch(e){stage('failed');throw Error(`${e.message}; private build evidence: ${work}; existing configuration preserved`)}
}
