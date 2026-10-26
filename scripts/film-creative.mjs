import { readFilmExport } from './film-render.mjs';

export const CREATIVE_BRIEF_VERSION='2026-10-22.1';
export const MAP_SKILL_REVISION='65ab781832cace6e0f28d4c00452410a99f3a02c';
const templates=[
  {id:'globe',name:'环球出发',direction:'地球俯冲、多城连续地图、计划航线与核验道路跟车'},
  {id:'city',name:'城市漫游',direction:'连续街道地图、核验道路跟车或步行，不强加地球开场'},
  {id:'journal',name:'旅行手账',direction:'按行程归属日期分章，日期印记与地图路线；当前不支持照片混剪'},
];
export function filmTemplate(id){const t=templates.find(t=>t.id===id);if(!t)throw Error('invalid_arguments: unknown film template; use globe, city or journal');return t;}
export function creativeCapabilities(){return{
  ok:true,executionMode:'agent-local',briefVersion:CREATIVE_BRIEF_VERSION,
  templates:templates.map(t=>({...t,status:'runtime-check-required',renderAvailable:null})),
  publishedCreativeRuntime:false,legacyRendererSupportsTemplates:false,
  sourceInstallation:{command:'trek film install-runtime --output /absolute/runtime.json',confirmation:'--confirm-build',platform:'linux/amd64',buildUsesNetwork:true,binaryImagePublished:false},
  referenceSkill:{url:'https://github.com/SpaceZephyr/map-motion',revision:MAP_SKILL_REVISION},
  installsPerformed:false,networkRequests:0,requiresMcpKey:false,
};}
export function buildCreativeBrief(file,templateId){
  const template=filmTemplate(templateId),value=readFilmExport(file),plan=value.plan;
  return{
    version:CREATIVE_BRIEF_VERSION,template,executionMode:'agent-local',
    source:{exportId:value.exportId,tripId:plan.tripId,fingerprint:plan.fingerprint},
    selection:value.selectionAudit||{scope:'unknown',fullTripAnalysisRequired:true},
    title:plan.title,routeKind:'planned-not-travelled',coordinateSystem:'WGS84',dataSource:'openstreetmap',
    stops:plan.stops.map(s=>({assignmentId:s.assignmentId,dayId:s.dayId,name:s.name,date:s.date,time:s.time,dayOffset:s.dayOffset,coordinates:s.coordinates,arrivalMode:s.arrivalMode})),
    sourceAttribution:plan.attribution,
    authoring:{skill:'map-motion',revision:MAP_SKILL_REVISION,readReference:'references/map-motion-creation.md',
      roadGeometryRequired:true,perAdjacentAssignmentGeometry:true,completeCoverageRequired:true,doNotTreatLegacyLinesAsRoads:true,continuousMap:true,uniformTypography:true,
      photos:'not-supported-by-current-runtime',privateAddressesExcluded:true},
    delivery:{localPreviewFirst:true,uploadRequiresSeparateConfirmation:true,renderReceiptRequired:true,
      creativePublishAvailable:'requires-verified-runtime-receipt',doNotUseLegacyRendererForThisBrief:true},
  };
}
