import {createHash} from 'node:crypto';
export const CREATIVE_RUNTIME='2026-10-21.3';
export const MAX_CREATIVE_BYTES=8*1024*1024;
const coordinate=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
export function filmDistance(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b[1]-a[1]),dlng=rad(b[0]-a[0]);return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlng/2)**2)))}
export function normalizeFilmRoads(value,plan){
 if(!value)return [];
 const adjacent=plan.stops.slice(1).map((to,i)=>({from:plan.stops[i],to}));
 const multi=value.version==='dazi-roads-v1';
 if(multi&&(!Array.isArray(value.legs)||value.legs.length>9))throw Error('Invalid route bundle');
 const seen=new Set();
 return (multi?value.legs:[value]).map(r=>{
  if(multi&&(!Number.isSafeInteger(r.fromAssignmentId)||r.fromAssignmentId<=0||!Number.isSafeInteger(r.toAssignmentId)||r.toAssignmentId<=0))throw Error('Invalid route assignment IDs');
  if(!['car','foot','bike'].includes(r.profile)||r.geometry?.type!=='LineString'||!Array.isArray(r.geometry.coordinates)||r.geometry.coordinates.length<3||r.geometry.coordinates.length>20000||!r.geometry.coordinates.every(coordinate))throw Error('Invalid independent road');
  const pair=adjacent.find(({from,to})=>multi?from.assignmentId===r.fromAssignmentId&&to.assignmentId===r.toAssignmentId:filmDistance(from.coordinates,r.geometry.coordinates[0])<=500&&filmDistance(to.coordinates,r.geometry.coordinates.at(-1))<=500);
  if(!pair||filmDistance(pair.from.coordinates,r.geometry.coordinates[0])>500||filmDistance(pair.to.coordinates,r.geometry.coordinates.at(-1))>500)throw Error('Route endpoints do not match adjacent assignments');
  const key=`${pair.from.assignmentId}:${pair.to.assignmentId}`;if(seen.has(key))throw Error('Duplicate route leg');seen.add(key);
  if(r.modeSource!==undefined&&!['inferred','itinerary'].includes(r.modeSource))throw Error('Invalid route mode source');
  return{fromAssignmentId:pair.from.assignmentId,toAssignmentId:pair.to.assignmentId,profile:r.profile,...(r.modeSource?{modeSource:r.modeSource}:{}),geometry:{type:'LineString',coordinates:r.geometry.coordinates}};
 });
}
export function validateCreativeInput(value){
 if(value?.kind!=='dazi-film-creative-v1'||!['globe','city','journal'].includes(value.template)||Object.keys(value).some(k=>!['kind','template','plan','basemap','road','inferredFlightLegs'].includes(k)))throw Error('Invalid creative input');
 const p=value.plan;
 if(!p||p.version!=='0.4.0-dev.4'||p.dataSource!=='openstreetmap'||!Array.isArray(p.stops)||p.stops.length<2||p.stops.length>10||p.stops.some(s=>!coordinate(s.coordinates)))throw Error('Invalid creative plan');
 const planKeys=['version','tripId','title','dataSource','scopeDayId','size','durationSeconds','palette','attribution','routeKind','stops','segments','fingerprint'];
 const stopKeys=['assignmentId','dayId','name','date','order','time','dayOffset','coordinates','coordinateSystem','arrivalMode'];
 if(Object.keys(p).some(k=>!planKeys.includes(k))||p.stops.some(s=>Object.keys(s).some(k=>!stopKeys.includes(k))))throw Error('Private or executable plan fields are forbidden');
 const{fingerprint,...body}=p;if(createHash('sha256').update(JSON.stringify(body)).digest('hex')!==fingerprint)throw Error('Creative fingerprint mismatch');
 const map=value.basemap;
 if(map?.source!=='openstreetmap'||!Array.isArray(map.features)||!map.features.length||map.features.length>12000)throw Error('Invalid independent basemap');
 let vertices=0;
 const features=map.features.map(f=>{
  if(!['road','major','water','park','coast'].includes(f.kind)||!Array.isArray(f.points)||f.points.length<2||!f.points.every(coordinate))throw Error('Invalid map geometry');vertices+=f.points.length;
  return{kind:f.kind,points:f.points};
 });
 if(vertices>300000||!features.some(f=>f.kind==='road'||f.kind==='major'))throw Error('Incomplete or oversized basemap');
 const legs=value.inferredFlightLegs||[];
 if(!Array.isArray(legs)||legs.length>9||new Set(legs).size!==legs.length||legs.some(i=>!Number.isInteger(i)||i<1||i>=p.stops.length))throw Error('Invalid inferred flight legs');
 let road;
 if(value.road){const legs=normalizeFilmRoads(value.road,p);road=value.road.version==='dazi-roads-v1'?{version:'dazi-roads-v1',legs}:legs[0];}
 if(value.template==='city'&&(!road||(road.version==='dazi-roads-v1'&&!road.legs.length)))throw Error('City template requires independent road geometry');
 const result={kind:'dazi-film-creative-v1',template:value.template,plan:p,basemap:{source:'openstreetmap',features},...(road?{road}:{}),inferredFlightLegs:legs};
 if(Buffer.byteLength(JSON.stringify(result))>MAX_CREATIVE_BYTES)throw Error('Creative input exceeds 8MB');
 return result;
}
