import test from 'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{validateCreativeInput}from'../scripts/film-input.mjs';
function input(){const p={version:'0.4.0-dev.4',dataSource:'openstreetmap',stops:[{coordinates:[100,13]},{coordinates:[100.01,13.01]}]};const plan={...p,fingerprint:createHash('sha256').update(JSON.stringify(p)).digest('hex')};return{kind:'dazi-film-creative-v1',template:'city',plan,basemap:{source:'openstreetmap',features:[{kind:'road',points:[[100,13],[100.01,13.01]],url:'not forwarded'}]},road:{profile:'car',geometry:{type:'LineString',coordinates:[[100,13],[100.005,13.006],[100.01,13.01]]},secret:'not forwarded'}}}
test('pure-data contract strips payloads not needed by renderer',()=>{const v=validateCreativeInput(input());assert(!('url'in v.basemap.features[0]));assert(!('secret'in v.road));assert.equal(v.template,'city')});
test('rejects unknown top-level code, private plan fields and changed fingerprint',()=>{
 const a=input();a.script='code';assert.throws(()=>validateCreativeInput(a));
 const b=input();b.plan.stops[0].notes='private';assert.throws(()=>validateCreativeInput(b));
 const c=input();c.plan.stops[0].coordinates[0]=110;assert.throws(()=>validateCreativeInput(c),/fingerprint/);
});
test('rejects wrong sources, excessive geometry, invalid inference and missing roads',()=>{
 const a=input();a.basemap.source='google';assert.throws(()=>validateCreativeInput(a));
 const b=input();b.basemap.features=Array(12001).fill(b.basemap.features[0]);assert.throws(()=>validateCreativeInput(b));
 const c=input();c.inferredFlightLegs=[1,1];assert.throws(()=>validateCreativeInput(c));
 const d=input();delete d.road;assert.throws(()=>validateCreativeInput(d));
});
