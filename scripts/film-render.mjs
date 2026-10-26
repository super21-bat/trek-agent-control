// Local-only renderer. No MCP token, itinerary database or network provider is
// passed to the container. Setup never downloads/installs anything implicitly.
import{readFileSync,writeFileSync,lstatSync,realpathSync,existsSync}from'node:fs';
import{isAbsolute,dirname,basename}from'node:path';
import{createHash,randomUUID}from'node:crypto';
import{spawnSync}from'node:child_process';
import{isDeepStrictEqual}from'node:util';
import{validateCreativeInput,MAX_CREATIVE_BYTES,CREATIVE_RUNTIME}from'./film-input.mjs';
import{requireFilmPlatform}from'./film-platform.mjs';
const PROFILE='270d7d0a62f62bfdf6c67308d6bb3f2fd59be6e5a746e37ed3a7ca058136b43a';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readFilmExport(file){
 if(!isAbsolute(file)||!lstatSync(file).isFile()||lstatSync(file).size>65536)throw Error('Use a private absolute export JSON file, at most 64KB');
 const value=JSON.parse(readFileSync(file,'utf8')),p=value.plan;
 if(!uuid.test(value.exportId||'')||value.executionMode!=='agent-local'||!p||p.routeKind!=='schematic'||p.dataSource!=='openstreetmap'||p.version!=='0.4.0-dev.4'||JSON.stringify(p.size)!=='[720,1280]'||!Number.isSafeInteger(p.tripId)||p.tripId<=0||!Array.isArray(p.stops)||p.stops.length<2||p.stops.length>10)throw Error('Unsupported or invalid film export');
 const keys=['version','tripId','title','dataSource','scopeDayId','size','durationSeconds','palette','attribution','routeKind','stops','segments','fingerprint'];
 if(Object.keys(p).some(k=>!keys.includes(k))||p.durationSeconds<15||p.durationSeconds>30||!Number.isFinite(p.durationSeconds))throw Error('Invalid film plan');
 const text=s=>typeof s==='string'&&s.length>0&&s.length<=100&&!/[\x00-\x1f\x7f]/.test(s);
 if(!text(p.title)||!text(p.attribution)||!Array.isArray(p.segments)||p.segments.length!==p.stops.length-1)throw Error('Invalid film labels');
 const stopKeys=['assignmentId','dayId','name','date','order','time','dayOffset','coordinates','coordinateSystem','arrivalMode'];
 const ids=new Set();
 for(const s of p.stops){
  if(Object.keys(s).some(k=>!stopKeys.includes(k))||!text(s.name)||!Number.isSafeInteger(s.assignmentId)||s.assignmentId<=0||ids.has(s.assignmentId)||s.coordinateSystem!=='WGS84'||!Array.isArray(s.coordinates)||s.coordinates.length!==2||!s.coordinates.every(Number.isFinite)||Math.abs(s.coordinates[0])>180||Math.abs(s.coordinates[1])>85||!['none','walking','taxi','driving','cycling','transit','flight'].includes(s.arrivalMode)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date))throw Error('Invalid film stop');ids.add(s.assignmentId);
 }
 const{fingerprint,...payload}=p;if(!/^[a-f0-9]{64}$/.test(fingerprint)||hash(JSON.stringify(payload))!==fingerprint)throw Error('Film fingerprint mismatch');
 return value;
}
function runtime(){
 const file=process.env.TREK_FILM_RUNTIME;if(!file||!isAbsolute(file))throw Error('local_renderer_not_configured: Agent must configure TREK_FILM_RUNTIME to a private runtime JSON; no automatic paid/cloud fallback');
 const c=JSON.parse(readFileSync(file,'utf8'));
 for(const name of ['docker','seccompPath','ffprobe','ffmpeg'])if(!isAbsolute(c[name]||'')||realpathSync(c[name])!==c[name]||!lstatSync(c[name]).isFile())throw Error('Invalid local renderer paths');
 if(!/^sha256:[a-f0-9]{64}$/.test(c.imageId||'')||hash(readFileSync(c.seccompPath))!==PROFILE)throw Error('Pinned image and audited seccomp required');
 return c;
}
function run(c,exe,args,input,max=1024*1024,timeout=15000){
 const result=spawnSync(exe,args,{input,timeout,maxBuffer:max,windowsHide:true,shell:false,env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
 // ffprobe may exit successfully after metadata, before all stdin is consumed.
 if((result.error&&!(result.error.code==='EPIPE'&&result.status===0))||result.status!==0)throw Error(`local_renderer_command_failed: ${basename(exe)} ${args[0]} (${result.error?.code||result.status}); check local runtime, no server fallback`);
 return result.stdout;
}
export function filmDoctor(options={}){
 const c=runtime();const info=JSON.parse(run(c,c.docker,['info','--format','{{json .}}']).toString());
 if(info.OSType!=='linux'||String(info.CgroupVersion)!=='2')throw Error('Linux Docker with cgroup v2 required');
 const image=JSON.parse(run(c,c.docker,['image','inspect',c.imageId]).toString())[0];
 if(image.Id!==c.imageId)throw Error('Pinned local renderer image unavailable');
 requireFilmPlatform(info,`${image.Os}/${image.Architecture}`);
 if(options.template&&image.Config?.Labels?.['fun.superd.dazi.film.creative']!==CREATIVE_RUNTIME)throw Error('local_renderer_template_unavailable: verified creative runtime required; do not use legacy output');
 run(c,c.ffprobe,['-version']);run(c,c.ffmpeg,['-version']);
 return{ok:true,executionMode:'agent-local',rendererImage:c.imageId,creativeRuntime:image.Config?.Labels?.['fun.superd.dazi.film.creative']||null,template:options.template||null,cloudFallback:false,installsPerformed:false};
}
export function localFilmArgs(name,c){return['create','--interactive','--name',name,'--init','--network','none','--read-only','--label','fun.superd.dazi.film=1','--label',`fun.superd.dazi.film.job=${name.slice(10)}`,'--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--security-opt',`seccomp=${c.seccompPath}`,'--cpus','1.5','--memory','1g','--memory-swap','1g','--pids-limit','128','--shm-size','128m','--tmpfs','/tmp:rw,nosuid,nodev,size=67108864,mode=1777','--tmpfs','/work:rw,nosuid,nodev,size=268435456,mode=1777',c.imageId]}
export function renderLocalFilm(exportFile,output,options={}){
 // Reject retries that would overwrite a completed preview or its receipt
 // before paying the cost of a new container/render.
 if(existsSync(output)||existsSync(`${output}.receipt.json`))throw Error('local_renderer_output_exists: preserve existing video and receipt; choose a new output filename');
 const value=readFilmExport(exportFile);if(!isAbsolute(output)||realpathSync(dirname(output))!==dirname(output))throw Error('Use an absolute output in an existing canonical directory');
 const data=file=>{if(!isAbsolute(file||'')||!lstatSync(file).isFile()||lstatSync(file).size>MAX_CREATIVE_BYTES)throw Error('Use a regular bounded absolute geometry JSON');return JSON.parse(readFileSync(file,'utf8'))};
 const creative=options.template?validateCreativeInput({kind:'dazi-film-creative-v1',template:options.template,plan:value.plan,basemap:data(options.map),...(options.road?{road:data(options.road)}:{}),inferredFlightLegs:options.inferredFlightLegs||[]}):null;
 filmDoctor(options);const c=runtime(),job=randomUUID(),name=`dazi-film-${job}`;let created=false,bytes;
 try{
  created=true;run(c,c.docker,localFilmArgs(name,c));
  const inspect=JSON.parse(run(c,c.docker,['inspect',name]).toString())[0],h=inspect.HostConfig;
  const seccomp=h.SecurityOpt?.some(v=>{if(v===`seccomp=${c.seccompPath}`)return true;if(!v.startsWith('seccomp='))return false;try{return isDeepStrictEqual(JSON.parse(v.slice(8)),JSON.parse(readFileSync(c.seccompPath,'utf8')))}catch{return false}});
  const tmp=(mount,size)=>{const options=String(mount).split(',');return['rw','nosuid','nodev',`size=${size}`,'mode=1777'].every(v=>options.includes(v))};
  if(h.NetworkMode!=='none'||!h.ReadonlyRootfs||h.Memory!==1073741824||h.MemorySwap!==1073741824||h.NanoCpus!==1500000000||h.PidsLimit!==128||inspect.Config.User!=='1000:1000'||h.Privileged||h.CapAdd?.length||h.Binds?.length||h.Devices?.length||h.DeviceRequests?.length||Object.keys(h.PortBindings||{}).length||!h.CapDrop?.includes('ALL')||!h.SecurityOpt?.some(v=>v==='no-new-privileges'||v==='no-new-privileges=true')||!seccomp||!h.Init||h.ShmSize!==134217728||h.IpcMode==='host'||h.PidMode==='host'||!tmp(h.Tmpfs?.['/tmp'],67108864)||!tmp(h.Tmpfs?.['/work'],268435456)||(inspect.Mounts||[]).some(m=>m.Type!=='tmpfs'))throw Error('Local sandbox limits not applied');
  bytes=run(c,c.docker,['start','--attach','--interactive',name],Buffer.from(JSON.stringify(creative||value.plan)),64*1024*1024,creative?570000:270000);
 }finally{
  if(created){
   const found=run(c,c.docker,['ps','--all','--filter',`name=^/${name}$`,'--format','{{.Names}}']).toString().trim();
   if(found){const own=JSON.parse(run(c,c.docker,['inspect',name]).toString())[0];if(found!==name||own.Image!==c.imageId||own.Config.Labels['fun.superd.dazi.film.job']!==job||own.Config.Labels['fun.superd.dazi.film']!=='1')throw Error('Unowned container; stop and inspect manually');run(c,c.docker,['rm','--force',name]);}
   if(run(c,c.docker,['ps','--all','--filter',`name=^/${name}$`,'--format','{{.Names}}']).toString().trim())throw Error('Local render cleanup incomplete');
  }
 }
 const probe=JSON.parse(run(c,c.ffprobe,['-v','error','-protocol_whitelist','pipe','-show_streams','-show_format','-of','json','-i','pipe:0'],bytes).toString());
 const streams=probe.streams||[],v=streams[0];
 const streamOK=creative?streams.length>=1&&streams.length<=2&&streams.every(s=>s.codec_type==='video'||(s.codec_type==='audio'&&s.codec_name==='aac')):streams.length===1;
 if(!streamOK||v.codec_type!=='video'||v.codec_name!=='h264'||v.width!==720||v.height!==1280||v.pix_fmt!=='yuv420p'||v.avg_frame_rate!=='24/1'||!Number.isFinite(Number(probe.format.duration))||Number(probe.format.duration)<(creative?5:15)||Number(probe.format.duration)>(creative?90.1:30.1))throw Error('Local film format verification failed');
 run(c,c.ffmpeg,['-v','error','-xerror','-protocol_whitelist','pipe','-i','pipe:0','-map','0:v:0','-map','0:a?','-f','null','-'],bytes,1024*1024,60000);
 writeFileSync(output,bytes,{flag:'wx',mode:0o600});
 const receipt={exportId:value.exportId,tripId:value.plan.tripId,fingerprint:value.plan.fingerprint,sha256:hash(bytes),bytes:bytes.length,localDecodeVerified:true,uploaded:false,...(creative?{template:creative.template,creativeRuntime:CREATIVE_RUNTIME,inputSha256:hash(JSON.stringify(creative))}:{})};
 writeFileSync(`${output}.receipt.json`,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
 return{...receipt,path:output,publishable:bytes.length<=10*1024*1024};
}
