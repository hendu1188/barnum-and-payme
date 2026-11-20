'use strict';
const {parse}=require('./store.cjs'),D=require('./models/drive-totals'),DC=require('./models/drive-totals-config.json'),W=require('./models/weekly-evidence'),P=require('./models/personnel-scenarios');
function contextFor(resources,slate,weather,previous,now){
 const schedule=parse(resources.games),ppa=parse(resources.ppa)||[],rawDrives=parse(resources.drives)||[],names=Object.freeze([...new Set(schedule.flatMap(g=>[g.homeTeam,g.awayTeam]))]),completed=schedule.filter(g=>g.completed&&+new Date(g.startDate)<+new Date(now)).sort((a,b)=>a.startDate.localeCompare(b.startDate)),elo={},last={},count={};
 for(const g of completed)for(const [t,e] of [[g.homeTeam,g.homePostgameElo],[g.awayTeam,g.awayPostgameElo]]){count[t]=(count[t]||0)+1;last[t]=g.startDate;if(Number.isFinite(e))elo[t]=e;}
 let drives=null;if(resources.drives){const compact=rawDrives.length&&'homeDrives'in rawDrives[0]?rawDrives:D.compact(rawDrives),asOf=new Date(Math.min(+new Date(resources.games.received_at),+new Date(resources.drives.received_at))).toISOString();drives=D.fit(D.observations(schedule,compact,asOf),DC.options);if(drives)drives.dataAsOf=asOf;}
 const seed=parse(resources['legacy-context']),reports=['SEC','B10','ACC','B12'].flatMap(c=>resources['availability-'+c]?W.compactReports(parse(resources['availability-'+c]),c):[]),usage=P.compactUsage(parse(resources.usage)||[]),news=resources.news?W.compactNews(parse(resources.news)):[],venues=parse(resources.venues)||[];
 const evidence={},ratings={};
 for(const g of slate.filter(g=>!g.completed&&+new Date(g.startDate)>+new Date(now))){const ev=g.ev,h=g.homeTeam,a=g.awayTeam,hE=g.homePregameElo??elo[h],aE=g.awayPregameElo??elo[a];if(Number.isFinite(hE)&&Number.isFinite(aE))ratings[g.id]={home:hE,away:aE,asOf:resources.games.received_at};
  const old=previous?.evidence?.[g.id]||seed?.evidenceMap?.[g.eventId],known=old?.personnel?.held?old.personnel:null;
  let availability=W.availability(ev,names,reports,usage.passers,now,[...usage.leaders,...known?.riskNames||[]]);
  // Imported evidence keeps its original publication times; it is never refreshed
  // merely because this service reopened the saved file.
  if(!reports.length&&old?.availability)availability=old.availability;
  const personnel=P.assess(ev,names,availability,{...usage,dataAsOf:resources.usage?.received_at||null},now,known),venue=venues.find(v=>v.id===g.venueId),wf=weather[g.id],wx=wf?(wf.assessment||W.weather(ev,venue,wf.forecast,wf.raw.received_at)):old?.weather||W.weather(ev,venue,null,resources.venues?.received_at||null);
  evidence[g.id]={availability,personnel,weather:{...wx,rawSourceId:wf?.raw.id||wx.rawSourceId||null,sourceForecastUrl:wf?.raw.source||wx.sourceForecastUrl||null},news:news.length?W.newsFor(ev,names,news,now):old?.news||[],newsCheckedAt:resources.news?.received_at||old?.newsCheckedAt||null};
 }
 if(!drives&&seed?.driveTotals)drives=seed.driveTotals;
 return {drives,ratings,evidence,last,count,names,ppa};
}
module.exports={contextFor};
