(function(root){
 'use strict';
 const num=n=>typeof n==='number'&&Number.isFinite(n);
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\bst\b/g,'state').replace(/\s+/g,' ').trim();
 const canonicalMemo=new WeakMap();
 function canonical(value,names){if(!Object.isFrozen(names))return canonicalCompute(value,names);let memo=canonicalMemo.get(names);if(!memo){memo=new Map();canonicalMemo.set(names,memo);}if(!memo.has(value))memo.set(value,canonicalCompute(value,names));return memo.get(value);}
 function canonicalCompute(value,names){const n=norm(value),aliases={'southern california':'usc','ole miss':'mississippi','miami fl':'miami','connecticut':'uconn'};const target=aliases[n]||n;const exact=names.filter(t=>norm(t)===target||aliases[norm(t)]===target);if(exact.length===1)return exact[0];const prefixes=names.filter(t=>n.startsWith(norm(t)+' ')).sort((a,b)=>b.length-a.length);return prefixes[0]||null;}
 function zoned(date,time,zone){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}/.test(time||''))return null;
  const tz={CT:'America/Chicago',ET:'America/New_York',MT:'America/Denver',PT:'America/Los_Angeles'}[zone];if(!tz)return null;
  const [y,m,d]=date.split('-').map(Number),[h,mi,sec=0]=time.split(':').map(Number),desired=Date.UTC(y,m-1,d,h,mi,sec);let value=desired;
  for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,+p.value]));const actual=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);value+=desired-actual;}
  return new Date(value).toISOString();
 }
 function compactReports(data,conference){return Object.entries(data||{}).filter(([,r])=>Array.isArray(r?.games)).map(([id,r])=>({id,conference,type:r.ReportType||'',publishedAt:zoned(r.publishDate,r.postedTime,r.conferenceTimeZone),kickoff:zoned(r.footer?.date,r.footer?.time,r.conferenceTimeZone),gameDate:r.footer?.date||null,teams:r.games.map(t=>({name:t.teamName||t.teamDisplayName||'',players:(t.rows||[]).map(p=>({name:String(p.name||'').slice(0,160),status:String(p.status||'').slice(0,60)}))})),source:`https://app.hdintelligence.com/?source=${conference}&sport=Football&conf=${conference}&type=report`}));}
 function primaryPassers(data){const teams=new Map();for(const r of data||[]){if(!/^(ATT|attempts|passingAttempts)$/i.test(r.statType||''))continue;const attempts=Number(String(r.stat??'').replace(/,/g,''));if(!Number.isFinite(attempts)||attempts<=0||!r.team||!r.player)continue;const current=teams.get(r.team);if(!current||attempts>current.attempts)teams.set(r.team,{team:r.team,name:r.player,attempts});}return [...teams.values()];}
 function availability(event,names,reports,passers,now,leaders=[]){
  const h=canonical(event.home_team,names),a=canonical(event.away_team,names),kick=+new Date(event.commence_time),time=+new Date(now),maxAge=kick-time<=6*3600000?6*3600000:72*3600000;
  const matching=reports.filter(r=>r.teams.length===2&&r.teams.some(t=>canonical(t.name,names)===h)&&r.teams.some(t=>canonical(t.name,names)===a)&&r.kickoff&&Math.abs(+new Date(r.kickoff)-kick)<=6*3600000&&r.publishedAt&&+new Date(r.publishedAt)<=time+60000).sort((x,y)=>+new Date(y.publishedAt)-+new Date(x.publishedAt));
  const report=matching[0];if(!report)return {status:'unavailable',teams:[],message:'No matching current official conference availability report.'};
  if(time-+new Date(report.publishedAt)>maxAge)return {status:'stale',publishedAt:report.publishedAt,source:report.source,teams:[],message:'Official availability report is too old for this kickoff window.'};
  const teams=report.teams.map(t=>{
   const team=canonical(t.name,names),passer=passers.find(p=>canonical(p.team,names)===team);
   const rows=t.players.map(p=>{const match=p.name.match(/^([A-Z/]+)\s+#?\d*\s*(.*)$/);return {name:match?match[2]:p.name,position:match?match[1]:'',status:p.status};});
   const primary=passer?rows.find(p=>norm(p.name)===norm(passer.name)&&p.position==='QB'):null;
   const unavailable=rows.filter(p=>!/^(Available|Exempt)$/i.test(p.status));
   const trackedPlayers=leaders.filter(p=>canonical(p.team,names)===team).map(p=>({name:p.name,role:p.role,status:rows.find(r=>norm(r.name)===norm(p.name))?.status||null}));
   return {team:team||t.name,primaryPasser:passer?.name||null,passingAttempts:passer?.attempts??null,primaryStatus:primary?.status||null,primaryRisk:!!primary&&/out|doubtful|questionable|game.time|not.available/i.test(primary.status),trackedPlayers,unavailable:unavailable.slice(0,30),listedPlayers:rows.length};
  });
  const primaryKnown=teams.every(t=>t.primaryPasser&&/^(Available|Probable|Questionable|Doubtful|Out|Out - \(1st Half\)|Game Time Decision)$/i.test(t.primaryStatus||''));
  return {status:primaryKnown?'matched':'partial',publishedAt:report.publishedAt,source:report.source,reportType:report.type,teams,primaryRisk:teams.some(t=>t.primaryRisk),message:primaryKnown?'Official report matched to both teams; season-leading passers identified.':'Official report matched; at least one season-leading passer could not be identified in it.'};
 }
 function compactNews(data){return (data?.articles||[]).slice(0,60).map(a=>({id:String(a.id||''),headline:String(a.headline||'').slice(0,260),published:a.published||null,url:a.links?.web?.href||null,teams:(a.categories||[]).filter(c=>c.type==='team').map(c=>c.team?.displayName||c.description||'').filter(Boolean)}));}
 function newsFor(event,names,news,now){const pair=[canonical(event.home_team,names),canonical(event.away_team,names)];return news.filter(n=>n.published&&+new Date(n.published)<=+new Date(now)+60000&&+new Date(now)-+new Date(n.published)<=72*3600000&&n.teams.some(t=>pair.includes(canonical(t,names)))).slice(0,5).map(n=>({...n,availabilityRelated:/quarterback|injur|ruled out|suspend|concussion|availability|starter/i.test(n.headline)}));}
 function weather(event,venue,forecast,fetchedAt){
  const source='https://open-meteo.com/en/docs';
  if(!venue)return {status:'unavailable',message:'Stadium coordinates could not be confirmed.',source};
  if(venue.dome===true)return {status:'indoor',venue:venue.name,source:'https://api.collegefootballdata.com/api/venues',fetchedAt,message:'Venue is listed as covered; outdoor weather is excluded. Roof operation is not independently verified.'};
  const kick=+new Date(event.commence_time)/1000,h=forecast?.hourly;
  if(!h?.time?.length)return {status:'unavailable',venue:venue.name,message:'Kickoff forecast is unavailable.',source};
  const indices=h.time.map((t,i)=>({t,i})).filter(x=>x.t>=Math.floor(kick/3600)*3600&&x.t<kick+3*3600).map(x=>x.i);
  if(indices.length<3)return {status:'unavailable',venue:venue.name,message:'Forecast does not cover the kickoff and game window.',source};
  const units=forecast.hourly_units||{};
  if(!/mph|mp\/h/.test(units.wind_speed_10m||'')||!/[F℉]/.test(units.temperature_2m||'')||!/^inch/.test(units.precipitation||''))return {status:'unavailable',message:'Forecast units were not verified.',source};
  const values=key=>indices.map(i=>h[key]?.[i]);if(!['temperature_2m','wind_speed_10m','wind_gusts_10m','precipitation'].every(k=>values(k).every(num)))return {status:'unavailable',message:'Forecast has missing hourly values.',source};
  const windMph=Math.max(...values('wind_speed_10m')),gustMph=Math.max(...values('wind_gusts_10m')),precipIn=values('precipitation').reduce((s,x)=>s+x,0),tempF=values('temperature_2m')[0];
  return {status:'available',venue:venue.name,tempF,windMph,gustMph,precipIn,forecastFor:event.commence_time,fetchedAt,source,screenTriggered:windMph>=20||gustMph>=30||precipIn>=.3,message:'Kickoff-window forecast; wind/precipitation screen is a conservative selection rule, not a fitted points adjustment.'};
 }
 function grade(record,games,canonicalize,now){
  if(record.result||!record.quote||+new Date(record.loggedAt)>=+new Date(record.kickoff)||+new Date(record.kickoff)>+new Date(now))return record;
  const home=canonicalize(record.homeTeam),away=canonicalize(record.awayTeam);if(!home||!away)return record;
  const matches=games.filter(g=>g.completed&&num(g.homePoints)&&num(g.awayPoints)&&((g.homeTeam===home&&g.awayTeam===away)||(g.homeTeam===away&&g.awayTeam===home))&&Math.abs(+new Date(g.startDate)-+new Date(record.kickoff))<=6*3600000);
  if(matches.length!==1)return record;
  const g=matches[0],flipped=g.homeTeam!==home,margin=(flipped?-1:1)*(g.homePoints-g.awayPoints),total=g.homePoints+g.awayPoints;
  let value;if(record.market==='total')value=record.side==='over'?total-record.quote.line:record.quote.line-total;else if(record.market==='spread')value=(record.side==='home'?margin:-margin)+record.quote.line;else value=record.side==='home'?margin:-margin;
  const result=value===0?'push':value>0?'win':'loss',profit=result==='push'?0:result==='loss'?-1:record.quote.price<0?100/-record.quote.price:record.quote.price/100;
  return {...record,result,profit,gradedAt:new Date(now).toISOString(),actualHomePoints:flipped?g.awayPoints:g.homePoints,actualAwayPoints:flipped?g.homePoints:g.awayPoints};
 }
 function support(records,version,market){
  const rows=records.filter(r=>r.version===version&&r.market===market&&r.result&&!r.synthetic),decided=rows.filter(r=>r.result!=='push'),wins=decided.filter(r=>r.result==='win').length,n=decided.length;
  if(!n)return {n:0,wins:0,pushes:rows.length,roi:null,hitRate:null,lower:null,upper:null};
  const p=wins/n,z=1.96,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return {n,wins,pushes:rows.length-n,roi:rows.reduce((s,r)=>s+r.profit,0)/rows.length,hitRate:p,lower:Math.max(0,c-h),upper:Math.min(1,c+h)};
 }
 function cleanEvidence(value){
  const e=value&&typeof value==='object'?value:{},w=e.weather||{},a=e.availability||{};
  const text=(v,max=500)=>typeof v==='string'?v.slice(0,max):null;
  const iso=v=>typeof v==='string'&&Number.isFinite(+new Date(v))?new Date(v).toISOString():null;
  const url=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}};
  const teams=Array.isArray(a.teams)?a.teams.slice(0,2):[];
  const cleanLeader=p=>({team:text(p.team,160),name:text(p.name,160),role:text(p.role,80),usage:num(p.usage)?p.usage:null,share:num(p.share)?p.share:null,status:text(p.status,80),risk:p.risk===true});
  const p=e.personnel||{};
  return {personnel:{status:text(p.status,100),held:p.held===true,checkedAt:iso(p.checkedAt),usageAsOf:iso(p.usageAsOf),reportPublishedAt:iso(p.reportPublishedAt),leaders:Array.isArray(p.leaders)?p.leaders.slice(0,8).map(cleanLeader):[],riskNames:Array.isArray(p.riskNames)?p.riskNames.slice(0,10).map(cleanLeader):[],reasons:Array.isArray(p.reasons)?p.reasons.slice(0,10).map(r=>text(r,500)):[],numericAdjustment:null},weather:{status:['available','indoor','unavailable','stale'].includes(w.status)?w.status:'unavailable',venue:text(w.venue,160),tempF:num(w.tempF)?w.tempF:null,windMph:num(w.windMph)?w.windMph:null,gustMph:num(w.gustMph)?w.gustMph:null,precipIn:num(w.precipIn)?w.precipIn:null,forecastFor:iso(w.forecastFor),fetchedAt:iso(w.fetchedAt),source:url(w.source),screenTriggered:w.screenTriggered===true,message:text(w.message)},availability:{status:['matched','partial','unavailable','stale'].includes(a.status)?a.status:'unavailable',publishedAt:iso(a.publishedAt),source:url(a.source),reportType:text(a.reportType,60),primaryRisk:a.primaryRisk===true,message:text(a.message),teams:teams.map(t=>({team:text(t.team,160),primaryPasser:text(t.primaryPasser,160),passingAttempts:num(t.passingAttempts)?t.passingAttempts:null,primaryStatus:text(t.primaryStatus,60),primaryRisk:t.primaryRisk===true,trackedPlayers:Array.isArray(t.trackedPlayers)?t.trackedPlayers.slice(0,12).map(p=>({name:text(p.name,160),role:text(p.role,80),status:text(p.status,80)})):[],listedPlayers:num(t.listedPlayers)?t.listedPlayers:null,unavailable:Array.isArray(t.unavailable)?t.unavailable.slice(0,30).map(p=>({name:text(p.name,160),position:text(p.position,20),status:text(p.status,60)})):[]}))},news:Array.isArray(e.news)?e.news.slice(0,5).map(n=>({id:text(n.id,100),headline:text(n.headline,260),published:iso(n.published),url:url(n.url),availabilityRelated:n.availabilityRelated===true})):[],newsCheckedAt:iso(e.newsCheckedAt)};
 }
 const api={canonical,zoned,compactReports,primaryPassers,availability,compactNews,newsFor,weather,grade,support,cleanEvidence};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WeeklyEvidence=Object.freeze(api);
})(globalThis);
