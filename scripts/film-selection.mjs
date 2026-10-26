// Full-trip inventory first; an exported highlight is never a full-trip claim.
// Safe audit contains IDs/counts/dates only, not private notes or addresses.
export function auditFilmSelection(days,selectedIds){
 if(!Array.isArray(days)||!Array.isArray(selectedIds)||selectedIds.length<2||new Set(selectedIds).size!==selectedIds.length)throw Error('Invalid film selection');
 const all=days.flatMap(d=>(d.assignments||[]).map(a=>({id:a.id,date:d.date}))),known=new Set(all.map(a=>a.id)),selected=new Set(selectedIds);
 if(selectedIds.some(id=>!known.has(id)))throw Error('Selection outside full itinerary');
 const byDay=days.filter(d=>d.assignments?.length).map(d=>({date:d.date,total:d.assignments.length,selected:d.assignments.filter(a=>selected.has(a.id)).length}));
 return{totalAssignments:all.length,selectedAssignments:selected.size,omittedAssignmentIds:all.filter(a=>!selected.has(a.id)).map(a=>a.id),scope:selected.size===all.length?'full':'highlights',days:byDay,unrepresentedDates:byDay.filter(d=>!d.selected).map(d=>d.date),requiresChapterSplit:selected.size>10,chapterLimit:10,silentTruncation:false};
}
export function inferFilmRoadProfile({mode,source,distanceMetres,title=''}){
 if(!Number.isFinite(distanceMetres)||distanceMetres<0)throw Error('Invalid segment distance');
 if(mode==='flight'||mode==='transit'||(source==='manual'&&mode==='none'))return null;
 if(source==='legacy'&&(mode==='walking'||mode==='none'))return{profile:/自驾/.test(title)||distanceMetres>3000?'car':'foot',modeSource:'inferred',reason:/自驾/.test(title)?'行程主题为自驾，历史默认到达方式不视为人工指定':'根据公共精选站点间距离推断；不代表实际轨迹'};
 return{profile:mode==='walking'?'foot':mode==='cycling'?'bike':'car',modeSource:'itinerary'};
}
