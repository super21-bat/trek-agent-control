import test from'node:test';import assert from'node:assert/strict';import{auditFilmSelection,inferFilmRoadProfile}from'../scripts/film-selection.mjs';
test('distinguishes highlights, omitted dates and full coverage without names or notes',()=>{
 const days=[{date:'2026-01-01',assignments:[{id:1,notes:'private'},{id:2}]},{date:'2026-01-02',assignments:[{id:3}]}];
 const a=auditFilmSelection(days,[1,2]);assert.equal(a.scope,'highlights');assert.equal(a.totalAssignments,3);assert.deepEqual(a.unrepresentedDates,['2026-01-02']);assert.deepEqual(a.omittedAssignmentIds,[3]);assert(!JSON.stringify(a).includes('private'));
 assert.equal(auditFilmSelection(days,[1,2,3]).scope,'full');assert.throws(()=>auditFilmSelection(days,[1,4]));
});
test('never truncates large selections to the first ten',()=>{
 const days=[{date:'2026-01-01',assignments:Array.from({length:14},(_,i)=>({id:i+1}))}];const a=auditFilmSelection(days,days[0].assignments.map(a=>a.id));assert.equal(a.selectedAssignments,14);assert(a.requiresChapterSplit);assert.equal(a.omittedAssignmentIds.length,0);
});
test('infers legacy defaults only and never overwrites explicit walking/transit',()=>{
 assert.equal(inferFilmRoadProfile({mode:'walking',source:'legacy',distanceMetres:9000}).profile,'car');
 assert.equal(inferFilmRoadProfile({mode:'walking',source:'manual',distanceMetres:9000,title:'自驾'}).profile,'foot');
 assert.equal(inferFilmRoadProfile({mode:'walking',source:'legacy',distanceMetres:500}).profile,'foot');
 assert.equal(inferFilmRoadProfile({mode:'transit',source:'manual',distanceMetres:9000}),null);
});
