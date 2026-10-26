import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{validateFilmSource,installFilmSource,FILM_SOURCE}from'../scripts/film-source.mjs';import{CREATIVE_RUNTIME}from'../scripts/film-input.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const sourceFiles={LICENSE:hash('AGPL source')},engineFiles={LICENSE:hash('MIT engine')};
 const integrity=JSON.stringify({revision:'65ab781832cace6e0f28d4c00452410a99f3a02c',files:engineFiles});
 const material=JSON.stringify({format:'dazi-runtime-materials-v1',engineRevision:'65ab781832cace6e0f28d4c00452410a99f3a02c',sourceFiles,engineFiles,dockerfileSha256:hash('fixed recipe'),packageLockSha256:hash('lock'),seccompSha256:'270d7d0a62f62bfdf6c67308d6bb3f2fd59be6e5a746e37ed3a7ca058136b43a'});
 // A changed profile cannot pass even with a self-consistent outer checksum.
 return{format:'dazi-film-source-v1',contract:CREATIVE_RUNTIME,platform:'linux/amd64',materialsSha256:hash(material),files:Object.fromEntries(Object.entries({LICENSE:'AGPL source','engine/LICENSE':'MIT engine',Dockerfile:'fixed recipe','package-lock.json':'lock','package.json':'{}','seccomp_profile.json':'changed','engine/.dazi-integrity.json':integrity,'runtime-materials.json':material}).map(([n,v])=>[n,Buffer.from(v).toString('base64')]))};
}
test('release identity is fixed and modified/downloaded data fails before execution',()=>{
 assert.match(FILM_SOURCE.url,/^https:\/\/github.com\/super21-bat\/trek-agent-control\/releases\/download\//);
 assert.throws(()=>validateFilmSource(Buffer.from('{}')),/integrity_mismatch/);
 assert.throws(()=>validateFilmSource(Buffer.alloc(FILM_SOURCE.maxBytes+1)),/integrity_mismatch/);
});
test('rejects traversal, invalid encoding, additional files and source/profile changes',()=>{
 for(const [mutate,pattern]of [
  [v=>{v.files['../escape']='WA=='},/Unsafe/],
  [v=>{v.files['engine/alias']='not base64!'},/bounded/],
  [v=>{v.files['unexpected.sh']='WA=='},/Unexpected/],
  [v=>{v.files.LICENSE=Buffer.from('changed').toString('base64')},/integrity mismatch/],
  [()=>{},/integrity mismatch/],
 ]){const v=fixture();mutate(v);const bytes=Buffer.from(JSON.stringify(v));assert.throws(()=>validateFilmSource(bytes,hash(bytes)),pattern)}
});
test('existing configurations are protected and preview has no dependency/install side effects',async t=>{
 const d=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'film-source-test-')));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const file=join(d,'runtime.json');fs.writeFileSync(file,'keep');
 await assert.rejects(()=>installFilmSource(file,{confirmBuild:true}),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),'keep');
 const preview=await installFilmSource(join(d,'new.json'));
 assert.equal(preview.installsPerformed,false);assert.equal(preview.credentialsRequired,false);assert.equal(preview.requiresConfirmation,'--confirm-build');assert.equal(fs.existsSync(join(d,'new.json')),false);
});
