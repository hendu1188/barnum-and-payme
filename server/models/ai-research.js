(function(root){
 'use strict';
 const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
 function validate(feed,now=Date.now()){
  if(!feed||feed.schema!=='ncaa-ai-research/v1'||!Array.isArray(feed.records)||feed.records.length>60)throw Error('Invalid AI research feed');
  const generated=+new Date(feed.generatedAt);if(!Number.isFinite(generated)||generated>+new Date(now)+60000)throw Error('Invalid AI research timestamp');
  const records=feed.records.map(r=>{
   if(!['spread','total','moneyline'].includes(r.market)||!['home','away','over','under'].includes(r.side))throw Error('Invalid AI research market or side');
   if((r.market==='total')!==['over','under'].includes(r.side))throw Error('AI side and market disagree');
   if(typeof r.gameId!=='string'||!/^[a-zA-Z0-9:_-]+$/.test(r.gameId))throw Error('Invalid game ID');
   if(!Number.isFinite(r.price)||Math.abs(r.price)<100||(r.market!=='moneyline'&&!Number.isFinite(r.line)))throw Error('AI research needs an exact quoted line and price');
   const observed=+new Date(r.observedAt),expires=+new Date(r.validUntil),kick=+new Date(r.kickoff);if(!Number.isFinite(observed)||!Number.isFinite(expires)||!Number.isFinite(kick)||observed>generated+60000||expires<=observed||expires>kick||expires-generated>48*3600000)throw Error('Invalid AI quote or expiry timestamp');
   const sources=(Array.isArray(r.sources)?r.sources:[]).slice(0,6).map(s=>{const u=new URL(s.url);if(u.protocol!=='https:')throw Error('AI source must be HTTPS');return {url:u.href,title:text(s.title,180),publishedAt:s.publishedAt||null,checkedAt:s.checkedAt||feed.generatedAt};});if(!sources.length)throw Error('AI research requires cited sources');
   return {gameId:r.gameId,homeTeam:text(r.homeTeam,160),awayTeam:text(r.awayTeam,160),kickoff:new Date(kick).toISOString(),market:r.market,side:r.side,line:r.market==='moneyline'?null:r.line,price:r.price,book:text(r.book,100),observedAt:new Date(observed).toISOString(),validUntil:new Date(expires).toISOString(),thesis:text(r.thesis,1500),counterargument:text(r.counterargument,1000),sources,judgmentConfidence:['low','medium','high'].includes(r.judgmentConfidence)?r.judgmentConfidence:'low',probabilityValidated:false};
  });return {schema:feed.schema,generatedAt:new Date(generated).toISOString(),promptVersion:text(feed.promptVersion,80)||'ai-research-v1',modelLabel:text(feed.modelLabel,100)||'Scheduled AI research',records};
 }
 function assess(feed,event,market,quotes,now=Date.now()){
  if(!feed)return {status:'NOT PUBLISHED',message:'No weekly AI opinion has been published yet.'};
  const records=feed.records.filter(r=>r.gameId===event.id&&r.market===market&&r.homeTeam===event.home_team&&r.awayTeam===event.away_team&&Math.abs(+new Date(r.kickoff)-+new Date(event.commence_time))<=6*3600000).sort((a,b)=>+new Date(b.observedAt)-+new Date(a.observedAt));
  const record=records[0];if(!record)return {status:'NO OPINION',message:'The current AI report has no play in this market.'};
  if(+new Date(now)>+new Date(record.validUntil)||+new Date(now)>=+new Date(record.kickoff))return {status:'EXPIRED',record,message:'The AI opinion has expired and is not used.'};
  const eligible=quotes.filter(q=>q.side===record.side&&q.quotedAt&&+new Date(q.quotedAt)<=+new Date(now)+60000&&+new Date(now)-+new Date(q.quotedAt)<=3600000&&(market==='moneyline'||(record.side==='over'?q.line<=record.line:q.line>=record.line)));
  // Compare payout rather than signed American prices around the -100/+100 boundary.
  const payout=p=>p<0?100/-p:p/100;
  const priced=eligible.filter(q=>payout(q.price)>=payout(record.price));
  if(!priced.length)return {status:'PRICE MOVED',record,message:'The recorded line and price or a better combination is no longer available.'};
  priced.sort((a,b)=>payout(b.price)-payout(a.price));return {status:'AI PAPER PICK',record,quote:priced[0],message:'Independent AI judgment, not a calibrated probability or established advantage.'};
 }
 const api={validate,assess};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AIResearch=Object.freeze(api);
})(globalThis);
