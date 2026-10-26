import{readFileSync,writeFileSync,lstatSync,realpathSync,createReadStream,existsSync}from'node:fs';
import{dirname,join,isAbsolute,basename,delimiter}from'node:path';
import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
import{CREATIVE_RUNTIME}from'./film-input.mjs';
import{requireFilmPlatform}from'./film-platform.mjs';
const PROFILE='270d7d0a62f62bfdf6c67308d6bb3f2fd59be6e5a746e37ed3a7ca058136b43a';
function binary(name){for(const p of(process.env.PATH||'').split(delimiter)){try{const f=realpathSync(join(p,name+(process.platform==='win32'?'.exe':'')));if(lstatSync(f).isFile())return f}catch{}}throw Error(`local_renderer_dependency_missing: ${name}`)}
function run(file,args,timeout=15000){const r=spawnSync(file,args,{encoding:'utf8',shell:false,timeout,maxBuffer:1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});if(r.error||r.status!==0)throw Error(`local_renderer_setup_failed: ${basename(file)} ${args[0]}`);return r.stdout}
function file(root,name,max){if(typeof name!=='string'||basename(name)!==name)throw Error('Unsafe runtime bundle path');const f=join(root,name);if(!lstatSync(f).isFile()||lstatSync(f).size>max||realpathSync(f)!==f)throw Error('Invalid runtime bundle file');return f}
export function preflightFilmRuntime(platform){
 const docker=binary('docker'),ffprobe=binary('ffprobe'),ffmpeg=binary('ffmpeg');
 const info=JSON.parse(run(docker,['info','--format','{{json .}}']));
 requireFilmPlatform(info,platform);run(ffprobe,['-version']);run(ffmpeg,['-version']);
 return{docker,ffprobe,ffmpeg,platform};
}
export async function setupFilmRuntime(manifestPath,output,confirmLoad=false){
 if(existsSync(output))throw Error('Runtime output already exists; preserve existing configuration');
 if(!isAbsolute(manifestPath)||!lstatSync(manifestPath).isFile()||realpathSync(manifestPath)!==manifestPath||lstatSync(manifestPath).size>8192||!isAbsolute(output)||realpathSync(dirname(output))!==dirname(output))throw Error('Use canonical absolute manifest/output paths');
 const root=realpathSync(dirname(manifestPath)),m=JSON.parse(readFileSync(manifestPath,'utf8'));
 if(m.format!=='dazi-film-runtime-v1'||m.contract!==CREATIVE_RUNTIME||!/^sha256:[a-f0-9]{64}$/.test(m.imageId)||m.seccompSha256!==PROFILE||!/^sha256:[a-f0-9]{64}$/.test(m.imageSha256))throw Error('Unrecognized runtime bundle');
 const profile=file(root,m.seccomp,65536),archive=file(root,m.imageArchive,4*1024*1024*1024);
 if(createHash('sha256').update(readFileSync(profile)).digest('hex')!==PROFILE)throw Error('Runtime seccomp integrity mismatch');
 // Cheap compatibility/dependency checks precede reading a multi-GB archive or
 // loading it into Docker. They do not install or change any host dependencies.
 const {docker,ffprobe,ffmpeg}=preflightFilmRuntime(m.platform);
 const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
 if(`sha256:${hash.digest('hex')}`!==m.imageSha256)throw Error('Runtime archive integrity mismatch');
 if(confirmLoad)run(docker,['load','--input',archive],600000);
 const image=JSON.parse(run(docker,['image','inspect',m.imageId]))[0];
 if(image.Id!==m.imageId||image.Os!=='linux'||image.Config?.Labels?.['fun.superd.dazi.film.creative']!==CREATIVE_RUNTIME||`${image.Os}/${image.Architecture}`!==m.platform)throw Error('Runtime image contract mismatch');
 writeFileSync(output,JSON.stringify({docker,imageId:m.imageId,seccompPath:profile,ffprobe,ffmpeg}),{flag:'wx',mode:0o600});
 return{ok:true,path:output,imageId:m.imageId,contract:CREATIVE_RUNTIME,platform:m.platform,networkRequests:0,loadedImage:confirmLoad,otherContainersChanged:false};
}
