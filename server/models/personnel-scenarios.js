(function(root){
 'use strict';const W=typeof WeeklyEvidence!=='undefined'?WeeklyEvidence:require('./weekly-evidence');
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function compactUsage(rows){
  const passing=(rows||[]).filter(r=>!r.category||String(r.category).toLowerCase()==='passing'),passers=W.primaryPassers(passing),groups=new Map();
  for(const r of rows||[]){const category=String(r.category||'').toLowerCase(),stat=String(r.statType||'').toUpperCase(),role=category==='rushing'&&['CAR','ATT'].includes(stat)?'rushing leader':category==='receiving'&&stat==='REC'?'receiving leader':null,value=Number(String(r.stat??'').replace(/,/g,''));if(!role||!Number.isFinite(value)||value<0||!r.team||!r.player)continue;
   const key=r.team+'|'+role;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({team:r.team,name:r.player,role,usage:value});
  }
  const leaders=[...groups.values()].map(a=>{a.sort((x,y)=>y.usage-x.usage);const total=a.reduce((s,x)=>s+x.usage,0);return {...a[0],share:total?a[0].usage/total:0};});
  return {passers,leaders};
 }
 function assess(event,names,reports,usage,now,previous=null){
  const pair=[W.canonical(event.home_team,names),W.canonical(event.away_team,names)],teamLeaders=[...(usage?.leaders||[]),...(previous?.riskNames||[])].filter((p,i,a)=>pair.includes(W.canonical(p.team,names))&&a.findIndex(x=>normalize(x.team+'|'+x.name)===normalize(p.team+'|'+p.name))===i);
  const matched=reports.status==='matched'||reports.status==='partial',checked=[];
  for(const p of teamLeaders){const team=(reports.teams||[]).find(t=>W.canonical(t.team,names)===W.canonical(p.team,names)),entry=team?.trackedPlayers?.find(x=>normalize(x.name)===normalize(p.name))||team?.unavailable?.find(x=>normalize(x.name)===normalize(p.name));checked.push({...p,status:entry?.status||'Not resolved',risk:!!entry&&/out|doubtful|questionable|game.time|not.available/i.test(entry.status)});}
  const reasons=[];if(reports.primaryRisk)reasons.push('Baseline and replacement-quarterback scenarios differ, but no validated player adjustment is available.');
  for(const p of checked.filter(p=>p.risk))reasons.push(p.team+' '+p.role+' '+p.name+' is '+p.status+'; replacement-production effect is not fitted.');
  const riskNames=[...checked.filter(p=>p.risk),...(reports.teams||[]).filter(t=>t.primaryRisk).map(t=>({team:t.team,name:t.primaryPasser,role:'quarterback proxy',status:t.primaryStatus}))];
  if(previous?.held){const cleared=reports.status==='matched'&&(previous.riskNames||[]).length>0&&previous.riskNames.every(p=>{const t=(reports.teams||[]).find(t=>W.canonical(t.team,names)===W.canonical(p.team,names));const status=normalize(t?.primaryPasser)===normalize(p.name)?t.primaryStatus:checked.find(x=>normalize(x.name)===normalize(p.name))?.status;return /^(Available|Probable)$/i.test(status||'');});if(!cleared){reasons.push('A previously flagged personnel risk has not been explicitly cleared by a current report.');riskNames.push(...(previous.riskNames||[]));}}
  return {status:reasons.length?'unresolved replacement scenario':matched?'baseline with availability checks':'availability unresolved',held:reasons.length>0,checkedAt:new Date(now).toISOString(),usageAsOf:usage?.dataAsOf||null,reportPublishedAt:reports.publishedAt||null,leaders:checked,riskNames,reasons,numericAdjustment:null,method:'Season usage leaders are proxies, not confirmed starters. No invented point deduction or replacement performance.'};
 }
 const api={compactUsage,assess};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PersonnelScenarios=Object.freeze(api);
})(globalThis);
