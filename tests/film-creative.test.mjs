import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { creativeCapabilities,buildCreativeBrief } from '../scripts/film-creative.mjs';
function fixture(){
  const p={version:'0.4.0-dev.4',tripId:1,title:'公开地点合成示例',dataSource:'openstreetmap',scopeDayId:null,size:[720,1280],durationSeconds:15,palette:{background:'#F2F3F0',text:'#0C0D0C',line:'#DFE1DD',accent:'#DFFF16'},attribution:'© OpenStreetMap contributors',routeKind:'schematic',stops:[1,2].map((id,i)=>({assignmentId:id,dayId:1,name:`公开地标${id}`,date:'2026-12-31',order:i,time:i?'01:00':'23:00',dayOffset:i,coordinates:[100+i,13+i],coordinateSystem:'WGS84',arrivalMode:'transit'})),segments:[{from:1,to:2,mode:'transit',geometry:'line',label:'地点连线示意'}]};
  return{exportId:'00000000-0000-4000-8000-000000000001',executionMode:'agent-local',plan:{...p,fingerprint:createHash('sha256').update(JSON.stringify(p)).digest('hex')}};
}
function isolated(fn){const dir=mkdtempSync(join(tmpdir(),'dazi-creative-'));try{const file=join(dir,'export.json');writeFileSync(file,JSON.stringify(fixture()),{mode:0o600});fn(dir,file)}finally{rmSync(dir,{recursive:true,force:true})}}
const cli=resolve('scripts/trek-mcp.mjs');
function run(dir,args){return spawnSync(process.execPath,[cli,'film',...args],{encoding:'utf8',env:{...process.env,TREK_CONFIG:join(dir,'absent.json'),TREK_MCP_TOKEN:'',MCP_API_TOKEN:'',TREK_FILM_RUNTIME:'',TREK_MCP_URL:'http://127.0.0.1:1'}})}
test('capabilities separate briefs from rendering and never imply installed support',()=>{
  const c=creativeCapabilities();assert.equal(c.templates.length,3);assert(c.templates.every(t=>t.renderAvailable===null));assert.equal(c.networkRequests,0);assert.equal(c.requiresMcpKey,false);
  assert.equal(c.sourceInstallation.buildUsesNetwork,true);assert.equal(c.sourceInstallation.binaryImagePublished,false);assert.equal(c.sourceInstallation.confirmation,'--confirm-build');
});
test('brief preserves midnight attribution and forbids legacy lines as roads',()=>isolated((dir,file)=>{
  const briefs=['globe','city','journal'].map(t=>buildCreativeBrief(file,t));
  assert.equal(new Set(briefs.map(b=>b.template.direction)).size,3);
  for(const b of briefs){assert.equal(b.stops[1].date,'2026-12-31');assert.equal(b.stops[1].dayOffset,1);assert(b.authoring.doNotTreatLegacyLinesAsRoads);assert(b.delivery.localPreviewFirst);assert.equal(b.delivery.creativePublishAvailable,'requires-verified-runtime-receipt');assert(!('segments' in b));}
}));
test('fresh user without MCP or Docker gets a brief, not an auth or installation request',()=>isolated((dir,file)=>{
  const cap=run(dir,['capabilities']);assert.equal(cap.status,0,cap.stderr);
  const brief=run(dir,['brief',file,'--template','city']);assert.equal(brief.status,0,brief.stderr);assert.equal(JSON.parse(brief.stdout).template.id,'city');
  const check=run(dir,['doctor','--template','city']);assert.equal(check.status,1);const result=JSON.parse(check.stderr);assert.equal(result.error.category,'local_renderer');assert.doesNotMatch(check.stderr,/Create a new Agent Key|401/);
}));
test('unknown template, modified export and ambiguous arguments fail closed',()=>isolated((dir,file)=>{
  assert.equal(run(dir,['brief',file,'--template','other']).status,1);
  assert.equal(run(dir,['doctor','--template','city','ignored']).status,1);
  const p=fixture();p.plan.stops[0].notes='private';writeFileSync(file,JSON.stringify(p));assert.throws(()=>buildCreativeBrief(file,'globe'));
}));
