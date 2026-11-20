(function(root){
  'use strict';
  const VERSION='weekly-auto-v7.0';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const validPrice=n=>finite(n)&&Math.abs(n)>=100;
  const breakEven=price=>!validPrice(price)?null:price<0?-price/(-price+100):100/(price+100);
  const payout=price=>price<0?100/-price:price/100;
  const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
  function pacificDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
  function addDays(date,count){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
  function weekStart(now){const date=pacificDate(now),day=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-(day+6)%7);}
  function isFresh(timestamp,settings){const t=timestamp?+new Date(timestamp):NaN,c=+new Date(settings.capturedAt),now=+new Date(settings.now);return Number.isFinite(t)&&Number.isFinite(c)&&t<=c+60000&&t<=now+60000&&now-t<=(settings.maxQuoteAgeMinutes??60)*60000;}
  function quotesFor(event,market,allowedBooks){
    const result=[];
    for(const b of event.bookmakers||[]){
      if(allowedBooks?.length&&!allowedBooks.includes(b.key))continue;
      const m=(b.markets||[]).find(x=>x.key===({total:'totals',spread:'spreads',moneyline:'h2h'}[market]));if(!m)continue;
      for(const o of m.outcomes||[]){
        if(!validPrice(o.price)||(market!=='moneyline'&&(!finite(o.point)||(market==='total'&&o.point<0))))continue;
        const side=market==='total'?(o.name==='Over'?'over':o.name==='Under'?'under':null):o.name===event.home_team?'home':o.name===event.away_team?'away':null;
        if(side)result.push({side,line:market==='moneyline'?null:o.point,price:o.price,book:b.title||b.key,bookKey:b.key,quotedAt:m.last_update||b.last_update||null});
      }
    }return result;
  }
  function common(entry,market,settings){
    const review=entry.review||{},reasons=[],now=+new Date(settings.now),capture=+new Date(settings.capturedAt);
    const modelAsOf=market==='spread'?entry.spreadAsOf:entry.modelAsOf;
    const t=modelAsOf?+new Date(modelAsOf):NaN;
    const hasInputs=market==='moneyline'?true:(market==='spread'?entry.hasSpreadInputs:entry.hasInputs)===true;
    if(!hasInputs)reasons.push('Required model inputs are incomplete');
    if(market!=='moneyline'){
      if(!Number.isFinite(t)||!Number.isFinite(capture)||t>now||t>capture||capture>now+60000)reasons.push('Model input time is missing or inconsistent with the snapshot');
      if(Number.isFinite(t)&&now-t>7*86400000)reasons.push('Model inputs are more than seven days old');
      if(entry.gamesPlayed==null||entry.gamesPlayed<3)reasons.push('At least one team has fewer than three confirmed games');
    }
    if(entry.matchConfirmed!==true)reasons.push('Game identity, week or venue has not been confirmed');
    // No human review or supplied data is required. Only machine-observable
    // prerequisites can prevent a pick. Coverage gaps remain explicit cautions.
    return {reasons,hasInputs,modelAsOf,review};
  }
  function finalize(entry,market,settings,values){
    const base=common(entry,market,settings),reasons=[...values.reasons,...base.reasons],quote=values.quote;
    if(quote&&!quote.fresh)reasons.unshift('Quote is stale, undated or inconsistent with the snapshot');
    const cautions=[...values.cautions];
    if(market==='spread')cautions.push('Spread model has no demonstrated betting advantage');
    if(market==='moneyline')cautions.push('Market-price comparison is not an independently validated win model');
    const evidence=entry.evidence||{},wx=evidence.weather||{},availability=evidence.availability||{},now=+new Date(settings.now),kick=+new Date(entry.ev.commence_time);
    const wxFresh=wx.status==='indoor'||(wx.status==='available'&&wx.forecastFor===entry.ev.commence_time&&wx.fetchedAt&&now-+new Date(wx.fetchedAt)<=6*3600000&&+new Date(wx.fetchedAt)<=now+60000);
    const maxReportAge=kick-now<=6*3600000?6*3600000:72*3600000;
    const reportFresh=['matched','partial'].includes(availability.status)&&availability.publishedAt&&now-+new Date(availability.publishedAt)<=maxReportAge&&+new Date(availability.publishedAt)<=now+60000;
    if(!wxFresh)cautions.push('A current kickoff weather check is unavailable; weather is not assumed benign.');
    if(!reportFresh)cautions.push('A current matching official availability report is unavailable; players are not assumed healthy.');
    else if(availability.status!=='matched')cautions.push('Official availability is included, but a season-leading passer could not be resolved for both teams.');
    if(reportFresh&&availability.primaryRisk)reasons.push('Official report flags a season-leading passer as unavailable or uncertain; baseline projection is held.');
    if(!reportFresh&&availability.primaryRisk)reasons.push('Previously reported passer uncertainty needs current clearance; the baseline remains held.');
    if(evidence.personnel?.held)reasons.push(...(evidence.personnel.reasons||['Unresolved replacement-player scenario; baseline held.']));
    if(market==='total'&&wxFresh&&wx.screenTriggered)reasons.push('Wind or precipitation exceeds the conservative totals screen; the baseline total is held.');
    const lateNews=(evidence.news||[]).some(n=>n.availabilityRelated&&n.published&&(!reportFresh||+new Date(n.published)>+new Date(availability.publishedAt)));
    if(lateNews)cautions.push('Recent player-availability news is newer than the matched official report; confidence is limited.');
    const newsFresh=evidence.newsCheckedAt&&+new Date(evidence.newsCheckedAt)<=now+60000&&now-+new Date(evidence.newsCheckedAt)<=6*3600000;
    if(!newsFresh)cautions.push('A fresh team-news feed check is unavailable.');
    const coverageComplete=!!wxFresh&&reportFresh&&availability.status==='matched'&&newsFresh&&!lateNews;
    let status='WAIT';
    if(values.gap!==null&&values.gap<values.threshold)status='PASS';else if(!reasons.length)status='PAPER CANDIDATE';
    const quality=!base.hasInputs?'Incomplete':reasons.some(r=>/time|stale|old|identity/.test(r))?'Needs checking':!coverageComplete?'Partial coverage':'Available';
    const ev=entry.ev;
    const support=entry.support?.[market]||{n:0},currentBreakEven=quote?breakEven(quote.price):null;
    const supported=coverageComplete&&status==='PAPER CANDIDATE'&&support.n>=200&&support.lower>currentBreakEven&&support.roi>0;
    const confidenceReason=supported?'Current-version forward paper results support this market at the offered price, with the automated coverage checks present. This is not a calibrated individual win probability.':`Confidence is limited by ${coverageComplete?'unproven predictive performance':'incomplete or unresolved automated coverage and unproven predictive performance'}. ${support.n||0} decided forward paper picks for this market and model version.`;
    return {id:ev.id+'|'+market,gameId:ev.id,homeTeam:ev.home_team,awayTeam:ev.away_team,kickoff:ev.commence_time,market,...values,status,researchConfidence:supported?'Moderate':'Low',confidenceReason,probability:null,expectedReturn:null,breakEven:currentBreakEven,quality,reasons,cautions,review:{},modelAsOf:base.modelAsOf||null,version:VERSION,sourceMode:'automatic-api',evidence,coverage:{weather:!!wxFresh,availability:!!reportFresh,primaryPassers:reportFresh&&availability.status==='matched',news:!!newsFresh,complete:!!coverageComplete},support,appliedRules:{personnelHold:evidence.personnel?.held===true,primaryPasserHold:availability.primaryRisk===true,weatherTotalHold:market==='total'&&wxFresh&&!!wx.screenTriggered},numericAdjustments:'No injury or weather point weights have been fitted; verified risks affect eligibility and confidence instead.'};
  }
  function evaluateMoneyline(entry,settings){
    const quotes=quotesFor(entry.ev,'moneyline',settings.allowedBooks).map(q=>({...q,fresh:isFresh(q.quotedAt,settings)}));
    const pairs=[];
    for(const key of new Set(quotes.map(q=>q.bookKey))){const home=quotes.find(q=>q.bookKey===key&&q.side==='home'),away=quotes.find(q=>q.bookKey===key&&q.side==='away');if(home&&away){const h=breakEven(home.price),a=breakEven(away.price);pairs.push({bookKey:key,home:h/(h+a),fresh:home.fresh&&away.fresh});}}
    const freshPairs=pairs.filter(p=>p.fresh),referencePairs=freshPairs.length?freshPairs:pairs;
    const freshQuotes=quotes.filter(q=>q.fresh),pool=freshQuotes.length?freshQuotes:quotes;
    const choices=pool.map(q=>{const others=referencePairs.filter(p=>p.bookKey!==q.bookKey),refs=others.length?others:referencePairs;if(!refs.length)return null;const home=median(refs.map(p=>p.home)),fair=q.side==='home'?home:1-home;return {...q,benchmark:fair,referenceBooks:others.length,gap:(fair-breakEven(q.price))*100};}).filter(Boolean).sort((a,b)=>b.gap-a.gap||payout(b.price)-payout(a.price)||a.bookKey.localeCompare(b.bookKey));
    const chosen=choices[0],reasons=[];
    if(!chosen)reasons.push('No complete two-sided moneyline quote');
    if(chosen&&chosen.referenceBooks<2)reasons.push('Fewer than two other complete books support the moneyline comparison');
    return finalize(entry,'moneyline',settings,{quote:chosen||null,side:chosen?.side??null,fair:chosen?.benchmark??null,reference:chosen?breakEven(chosen.price):null,gap:chosen?.gap??null,gapUnit:'percentage points',threshold:settings.minMoneylineGapPct??2,reasons,cautions:['Moneyline benchmark removes the margin from other books; it is a market estimate, not a model win probability.','Displayed prices can move between feed updates; quotes expire under the age limit.'],marketProbability:chosen?.benchmark??null});
  }
  function evaluate(entry,market,settings){
    if(market==='moneyline')return evaluateMoneyline(entry,settings);
    const quotes=quotesFor(entry.ev,market,settings.allowedBooks).map(q=>({...q,fresh:isFresh(q.quotedAt,settings)})),fresh=quotes.filter(q=>q.fresh),referencePool=fresh.length?fresh:quotes;
    const references=referencePool.filter(q=>market==='total'?q.side==='over':q.side==='home'),fair=market==='total'?entry.modelTotal:entry.modelSpread;
    const reference=references.length?median(references.map(q=>q.line)):null,reasons=[],cautions=['Current model has no validated per-game win probabilities'];
    if(!finite(fair))reasons.push('Model estimate unavailable');
    if(reference===null)reasons.push('No complete line-and-price quote at the selected books');
    const side=!finite(fair)||reference===null?null:market==='total'?(fair>reference?'over':fair<reference?'under':null):(fair<reference?'home':fair>reference?'away':null);
    if(finite(fair)&&reference!==null&&!side)reasons.push('Model agrees with the market; no directional lean');
    const choices=quotes.filter(q=>q.side===side),freshChoices=choices.filter(q=>q.fresh),pool=freshChoices.length?freshChoices:choices;
    pool.sort((a,b)=>(side==='over'?a.line-b.line:b.line-a.line)||payout(b.price)-payout(a.price)||a.bookKey.localeCompare(b.bookKey));
    const quote=pool[0]||null;
    if(side&&!quote)reasons.push('No valid quote for the model side');
    const raw=quote&&finite(fair)?market==='total'?fair-quote.line:fair-(side==='home'?quote.line:-quote.line):null;
    const gap=raw===null?(finite(fair)&&reference===fair?0:null):market==='total'?(side==='over'?raw:-raw):(side==='home'?-raw:raw);
    if(market==='total')cautions.push('The revised totals model has not established a betting advantage over current prices.');
    if(market==='total'&&entry.totalDiagnostics&&!entry.totalDiagnostics.paceIncluded)cautions.push('Possessions and pace are not explicitly modelled.');
    if(market==='total'&&entry.totalDiagnostics?.extrapolated)cautions.push('This efficiency combination is outside the 2023 fitted range; the total is an extrapolation.');
    if(gap!==null&&gap>=10)cautions.push('Large disagreement can indicate model misspecification; it does not increase confidence.');
    if(quote&&market==='spread'&&[3,7].some(n=>Math.abs(Math.abs(quote.line)-n)<=.5))cautions.push('Price is near 3 or 7; half a point can change the decision');
    return finalize(entry,market,settings,{quote,side,fair,reference,gap,gapUnit:'points',threshold:settings.minGap??3,reasons,cautions,totalDiagnostics:market==='total'?entry.totalDiagnostics||null:null});
  }
  function build(entries,settings){
    const end=addDays(settings.startDate,7),now=+new Date(settings.now),all=[],markets=settings.markets||['spread','total','moneyline'];
    for(const entry of entries){const kickoff=+new Date(entry.ev.commence_time);if(!Number.isFinite(kickoff)||kickoff<=now)continue;const day=pacificDate(kickoff);if(day<settings.startDate||day>=end)continue;for(const market of markets)all.push(evaluate(entry,market,settings));}
    const rank={'PAPER CANDIDATE':0,WAIT:1,PASS:2};
    const compare=(a,b)=>rank[a.status]-rank[b.status]||Number(!a.quote)-Number(!b.quote)||Number(a.gap===null||a.gap<a.threshold)-Number(b.gap===null||b.gap<b.threshold)||a.reasons.length-b.reasons.length||(a.market===b.market?(b.gap??-1)-(a.gap??-1):0)||a.kickoff.localeCompare(b.kickoff)||a.id.localeCompare(b.id);
    const groups=new Map();for(const row of all){if(!groups.has(row.gameId))groups.set(row.gameId,[]);groups.get(row.gameId).push(row);}
    const games=[...groups.values()].map(rows=>{const ordered=[...rows].sort(compare);return {...ordered[0],markets:rows};}).sort(compare);
    const shortlist=games.slice(0,settings.limit??14);
    return {version:VERSION,generatedAt:new Date(settings.now).toISOString(),startDate:settings.startDate,endDateExclusive:end,capturedAt:settings.capturedAt,synthetic:!!settings.synthetic,shortlist,all,availableGames:games.length,requestedGames:settings.limit??14,counts:{candidates:all.filter(r=>r.status==='PAPER CANDIDATE').length,waiting:all.filter(r=>r.status==='WAIT').length,passed:all.filter(r=>r.status==='PASS').length}};
  }
  const api={VERSION,breakEven,validPrice,pacificDate,addDays,weekStart,quotesFor,evaluate,build};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShortlistEngine=Object.freeze(api);
})(globalThis);
