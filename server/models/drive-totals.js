(function(root){
 'use strict';
 const VERSION='drive-totals-v1',finite=n=>typeof n==='number'&&Number.isFinite(n);
 function compact(drives){
  const games=new Map(),ids=new Set();
  for(const d of drives||[]){
   if(!d||typeof d.id!=='string'||ids.has(d.id))continue;ids.add(d.id);
   if(!Number.isInteger(d.gameId)||!Number.isInteger(d.startPeriod)||d.startPeriod<1||d.startPeriod>4||!Number.isInteger(d.endPeriod)||d.endPeriod<d.startPeriod||d.endPeriod>4||!finite(d.plays)||d.plays<1||typeof d.isHomeOffense!=='boolean'||!d.offense||!d.defense)continue;
   const seconds=finite(d.elapsed?.minutes)&&finite(d.elapsed?.seconds)?d.elapsed.minutes*60+d.elapsed.seconds:null;
   const shortClockKill=['END OF HALF','END OF GAME'].includes(d.driveResult)&&d.plays<=2&&seconds!==null&&seconds<=45&&d.endOffenseScore===d.startOffenseScore&&d.endDefenseScore===d.startDefenseScore;
   if(shortClockKill)continue;
   if(!games.has(d.gameId))games.set(d.gameId,{gameId:d.gameId,home:d.isHomeOffense?d.offense:d.defense,away:d.isHomeOffense?d.defense:d.offense,homeDrives:0,awayDrives:0,periodMask:0,valid:true});
   const g=games.get(d.gameId);if((d.isHomeOffense?d.offense:d.defense)!==g.home||(d.isHomeOffense?d.defense:d.offense)!==g.away){g.valid=false;continue;}
   g[d.isHomeOffense?'homeDrives':'awayDrives']++;
   for(let p=d.startPeriod;p<=d.endPeriod;p++)g.periodMask|=1<<(p-1);
  }
  return [...games.values()].filter(g=>g.valid&&g.periodMask===15&&g.homeDrives>=4&&g.awayDrives>=4&&g.homeDrives<=25&&g.awayDrives<=25).map(({valid,periodMask,...g})=>g);
 }
 function observations(games,driveGames,asOf){
  const date=new Date(asOf).toISOString().slice(0,10),map=new Map((driveGames||[]).map(g=>[g.gameId,g])),out=[];
  for(const g of games||[]){
   if(!g.completed||g.homeClassification!=='fbs'||g.awayClassification!=='fbs'||!g.startDate||g.startDate.slice(0,10)>=date||!finite(g.homePoints)||!finite(g.awayPoints))continue;
   if(!Array.isArray(g.homeLineScores)||!Array.isArray(g.awayLineScores)||g.homeLineScores.length<4||g.awayLineScores.length<4||!g.homeLineScores.slice(0,4).every(finite)||!g.awayLineScores.slice(0,4).every(finite))continue;
   const d=map.get(g.id);if(!d||d.home!==g.homeTeam||d.away!==g.awayTeam)continue;
   const hp=g.homeLineScores.slice(0,4).reduce((a,b)=>a+b,0),ap=g.awayLineScores.slice(0,4).reduce((a,b)=>a+b,0);
   if(hp>g.homePoints||ap>g.awayPoints||hp<0||ap<0)continue;
   if((g.homeLineScores.length===4&&hp!==g.homePoints)||(g.awayLineScores.length===4&&ap!==g.awayPoints))continue;
   out.push({gameId:g.id,date:g.startDate.slice(0,10),home:g.homeTeam,away:g.awayTeam,hp,ap,hn:d.homeDrives,an:d.awayDrives,extra:g.homePoints+g.awayPoints-hp-ap});
  }
  return out;
 }
 function fit(observations,options={}){
  const priorDrives=options.priorDrives??50,priorGames=options.priorGames??4;
  if(observations.length<20)return null;
  const names=[...new Set(observations.flatMap(g=>[g.home,g.away]))],index=new Map(names.map((n,i)=>[n,i]));
  const leagueRate=observations.reduce((s,g)=>s+g.hp+g.ap,0)/observations.reduce((s,g)=>s+g.hn+g.an,0),leaguePace=observations.reduce((s,g)=>s+(g.hn+g.an)/2,0)/observations.length;
  const rows=observations.map(g=>({...g,h:index.get(g.home),a:index.get(g.away)})),stats=names.map(()=>({off:0,def:0,pace:0,n:0,drives:0,against:0}));
  for(const g of rows){stats[g.h].n++;stats[g.a].n++;stats[g.h].drives+=g.hn;stats[g.h].against+=g.an;stats[g.a].drives+=g.an;stats[g.a].against+=g.hn;}
  for(let iteration=0;iteration<40;iteration++){
   const off=names.map(()=>0),def=names.map(()=>0),pace=names.map(()=>0);
   for(const g of rows){off[g.h]+=g.hp-g.hn*(leagueRate+stats[g.a].def);off[g.a]+=g.ap-g.an*(leagueRate+stats[g.h].def);}
   for(let i=0;i<names.length;i++)stats[i].off=off[i]/(stats[i].drives+priorDrives);
   for(const g of rows){def[g.h]+=g.ap-g.an*(leagueRate+stats[g.a].off);def[g.a]+=g.hp-g.hn*(leagueRate+stats[g.h].off);const p=(g.hn+g.an)/2;pace[g.h]+=p-leaguePace-stats[g.a].pace;pace[g.a]+=p-leaguePace-stats[g.h].pace;}
   // Jacobi damping stabilizes the symmetric pace equations; not a betting weight.
   for(let i=0;i<names.length;i++){stats[i].def=def[i]/(stats[i].against+priorDrives);stats[i].pace=.5*stats[i].pace+.5*pace[i]/(stats[i].n+priorGames);}
  }
  return {version:VERSION,leagueRate,leaguePace,expectedOvertime:observations.reduce((s,g)=>s+g.extra,0)/observations.length,games:observations.length,priorDrives,priorGames,teams:Object.fromEntries(names.map((name,i)=>[name,stats[i]]))};
 }
 function project(home,away,context,calibration={intercept:0,slope:1}){
  if(!context||context.version!==VERSION||!home||!away||home===away)return null;
  const h=context.teams?.[home],a=context.teams?.[away];if(!h||!a||h.n<3||a.n<3)return null;
  const possessions=context.leaguePace+h.pace+a.pace,homeRate=context.leagueRate+h.off+a.def,awayRate=context.leagueRate+a.off+h.def;
  if(![possessions,homeRate,awayRate,context.expectedOvertime,calibration.intercept,calibration.slope].every(finite)||possessions<4||possessions>25||homeRate<=0||awayRate<=0)return null;
  const rawTotal=possessions*(homeRate+awayRate)+context.expectedOvertime,modelTotal=calibration.intercept+calibration.slope*rawTotal;
  if(!finite(modelTotal)||modelTotal<=0)return null;
  return {modelTotal,diagnostics:{modelId:VERSION,possessions,homePointsPerDrive:homeRate,awayPointsPerDrive:awayRate,expectedOvertime:context.expectedOvertime,rawTotal,calibrationIntercept:calibration.intercept,calibrationSlope:calibration.slope,homeGames:h.n,awayGames:a.n,leagueGames:context.games,paceIncluded:true,opponentAdjusted:true,marketUsedAsInput:false,pointsIncludeNonOffensive:true,dataAsOf:context.dataAsOf||null}};
 }
 function cleanContext(c){
  if(!c||c.version!==VERSION||![c.leagueRate,c.leaguePace,c.expectedOvertime,c.games,c.priorDrives,c.priorGames].every(finite)||c.games<20||c.leagueRate<=0||c.leaguePace<4||c.priorDrives<=0||c.priorGames<=0||!c.teams||typeof c.teams!=='object'||!c.dataAsOf||!Number.isFinite(+new Date(c.dataAsOf)))return null;
  const teams=Object.create(null);for(const [name,s] of Object.entries(c.teams).slice(0,400)){if(['__proto__','constructor','prototype'].includes(name)||/[<>\x00-\x1f]/.test(name)||![s.off,s.def,s.pace,s.n,s.drives,s.against].every(finite))continue;teams[name]={off:s.off,def:s.def,pace:s.pace,n:s.n,drives:s.drives,against:s.against};}
  return {version:VERSION,leagueRate:c.leagueRate,leaguePace:c.leaguePace,expectedOvertime:c.expectedOvertime,games:c.games,priorDrives:c.priorDrives,priorGames:c.priorGames,teams,dataAsOf:new Date(c.dataAsOf).toISOString()};
 }
 const api={VERSION,compact,observations,fit,project,cleanContext};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DriveTotals=Object.freeze(api);
})(globalThis);
