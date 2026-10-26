import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{setupFilmRuntime}from'../scripts/film-setup.mjs';import{CREATIVE_RUNTIME}from'../scripts/film-input.mjs';
import{preflightFilmRuntime}from'../scripts/film-setup.mjs';
function temp(t){const d=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'dazi-runtime-test-')));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d}
test('refuses overwriting an existing config before loading any Docker image',async t=>{const d=temp(t),out=join(d,'config.json');fs.writeFileSync(out,'keep');await assert.rejects(()=>setupFilmRuntime(join(d,'missing.json'),out,true),/already exists/);assert.equal(fs.readFileSync(out,'utf8'),'keep')});
test('rejects unrecognized and traversal bundle manifests without invoking Docker',async t=>{const d=temp(t),file=join(d,'bundle.json');fs.writeFileSync(file,'{}');await assert.rejects(()=>setupFilmRuntime(file,join(d,'out.json')),/Unrecognized/);fs.writeFileSync(file,JSON.stringify({format:'dazi-film-runtime-v1',contract:CREATIVE_RUNTIME,imageId:'sha256:'+'a'.repeat(64),imageSha256:'sha256:'+'b'.repeat(64),seccompSha256:'270d7d0a62f62bfdf6c67308d6bb3f2fd59be6e5a746e37ed3a7ca058136b43a',seccomp:'../private.json',imageArchive:'image.tar'}));await assert.rejects(()=>setupFilmRuntime(file,join(d,'out.json')),/Unsafe/);assert(!fs.existsSync(join(d,'out.json')))});
function fakeHost(t,{architecture='x86_64',probeFails=false}={}){
 const dir=temp(t),trace=join(dir,'calls.jsonl'),previous=process.env.PATH;
 t.after(()=>{process.env.PATH=previous});process.env.PATH=dir;
 for(const name of ['docker','ffprobe','ffmpeg']){
  const body=`#!${process.execPath}\nconst fs=require('fs');fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify([${JSON.stringify(name)},...process.argv.slice(2)])+'\\n');`+
   (name==='docker'?`process.stdout.write(${JSON.stringify(JSON.stringify({OSType:'linux',CgroupVersion:2,Architecture:architecture}))});`:name==='ffprobe'&&probeFails?'process.exit(1);':'process.stdout.write("verified version");');
  fs.writeFileSync(join(dir,name),body,{mode:0o700});
 }
 return()=>fs.existsSync(trace)?fs.readFileSync(trace,'utf8').trim().split('\n').map(s=>JSON.parse(s)):[];
}
test('preflight rejects incompatible host before loading image or probing codecs',t=>{
 const calls=fakeHost(t,{architecture:'aarch64'});
 assert.throws(()=>preflightFilmRuntime('linux/amd64'),/platform_mismatch/);
 assert.deepEqual(calls().map(c=>c.slice(0,2)),[['docker','info']]);
});
test('preflight detects broken codec dependency before loading any image',t=>{
 const calls=fakeHost(t,{probeFails:true});
 assert.throws(()=>preflightFilmRuntime('linux/amd64'),/setup_failed: ffprobe/);
 assert.deepEqual(calls().map(c=>c.slice(0,2)),[['docker','info'],['ffprobe','-version']]);
});
test('preflight is read-only and needs no MCP credentials',t=>{
 const calls=fakeHost(t);assert.equal(preflightFilmRuntime('linux/amd64').platform,'linux/amd64');
 assert.deepEqual(calls().map(c=>c.slice(0,2)),[['docker','info'],['ffprobe','-version'],['ffmpeg','-version']]);
});
