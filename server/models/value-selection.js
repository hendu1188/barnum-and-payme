(function(root){
 'use strict';
 const VERSION='value-selection-v5',U=typeof UnifiedModel!=='undefined'?UnifiedModel:require('./unified-model');
 const valid=n=>typeof n==='number'&&Number.isFinite(n);
 const payout=price=>price<0?100/-price:price/100;
 function value(p,price){return p*payout(price)-(1-p);}
 function assess(quote,forecast,now,maxAge=60){
  if(!forecast||![forecast.probability,forecast.winProbability,forecast.lossProbability,forecast.pushProbability].every(valid)||[forecast.probability,forecast.winProbability,forecast.lossProbability,forecast.pushProbability].some(p=>p<0||p>1)||Math.abs(forecast.winProbability+forecast.lossProbability+forecast.pushProbability-1)>1e-6||!valid(quote.price)||Math.abs(quote.price)<100)return null;
  const t=+new Date(quote.quotedAt);if(!Number.isFinite(t)||t>+new Date(now)+60000||+new Date(now)-t>maxAge*60000)return null;
  const v=U.priceValue(forecast,quote.side,quote.price);if(!v||![v.expectedReturn,v.lowerReturn,v.probabilityLowerBound,v.probabilityUpperBound].every(valid))return null;
  return {...v,qualified:forecast.qualified===true&&v.uncertaintyAvailable,forecast};
 }
 function compare(a,b){return a.tier-b.tier||(b.selection?.lowerReturn??-Infinity)-(a.selection?.lowerReturn??-Infinity)||(b.selection?.expectedReturn??-Infinity)-(a.selection?.expectedReturn??-Infinity)||a.kickoff.localeCompare(b.kickoff)||a.id.localeCompare(b.id);}
 function rank(report,choicesFor,settings){
  for(const row of report.all){
   row.legacyAssessment={status:row.status,side:row.side,quote:row.quote,gap:row.gap};
   const options=choicesFor(row).map(({quote,forecast,benchmark})=>({quote,selection:assess(quote,forecast,settings.now,settings.maxQuoteAgeMinutes),benchmark})).filter(x=>x.selection).sort((a,b)=>b.selection.lowerReturn-a.selection.lowerReturn||b.selection.expectedReturn-a.selection.expectedReturn||a.quote.bookKey.localeCompare(b.quote.bookKey));
   const chosen=options[0];row.selectionVersion=VERSION;row.version=VERSION;row.researchConfidence='Low';row.probability=null;row.expectedReturn=null;
   // Direction and book are selected by value. A legacy point-gap cutoff is no longer a gate.
   row.reasons=row.reasons.filter(r=>!/^Model agrees with the market|^Fewer than two other complete books|^No complete two-sided moneyline quote|^No valid quote for the model side/.test(r));
   if(chosen){row.side=chosen.quote.side;row.quote={...chosen.quote,fresh:true};row.selection=chosen.selection;row.marketBenchmark=chosen.benchmark;row.breakEven=1/(1+payout(row.quote.price));
    if(row.market==='spread')row.gap=row.side==='home'?row.quote.line-row.fair:-row.quote.line+row.fair;
    if(row.market==='total')row.gap=row.side==='over'?row.fair-row.quote.line:row.quote.line-row.fair;
   }else{row.selection=null;row.marketBenchmark=null;row.quote=null;row.side=null;row.quality='Incomplete';row.reasons.push('A complete shared matchup forecast and fresh quote are required.');}
   if(chosen&&!row.selection.uncertaintyAvailable)row.reasons.push('Insufficient local sample or calibration-group support for probability uncertainty.');
   const audit=settings.validationAudit,seasons=audit?.seasons?Object.keys(audit.seasons).sort():[],latest=seasons.length?audit.seasons[seasons[seasons.length-1]]?.markets?.[row.market]:null;
   const adverse=!!(chosen&&audit?.parameterArtifact===chosen.selection.forecast.modelArtifactHash&&latest?.decided>=200&&latest.pairedBrierDifferenceBand?.[0]>0);
   const totalsModelHold=row.market==='total'&&chosen?.selection.forecast.recommendationEligible!==true;
   row.appliedRules={...row.appliedRules,diagnosticHold:false,diagnosticAdverse:adverse,totalsModelHold};
   if(totalsModelHold)row.reasons.push('Totals are comparison-only: the replacement probability model has not passed its release checks. No totals play.');
   const held=row.reasons.length>0||!row.selection;
   const approved=!held&&row.coverage.complete&&row.selection.qualified&&row.selection.lowerReturn>0;
   row.tier=approved?0:!held&&row.selection.lowerReturn>0?1:!held&&row.selection.expectedReturn>0?2:held?4:3;
   row.status=approved?'PAPER CANDIDATE':held?'WAIT':row.selection.expectedReturn<=0?'PASS':'RESEARCH';
   row.selectionReason=totalsModelHold?'Comparison only: totals probabilities failed the release checks; no model or automated AI totals play.':approved?'Validated probability bounds support positive return at this price.':held?'Closer look: the forecast, uncertainty support or a required game check is missing or held.':row.selection.expectedReturn<=0?'The experimental estimate does not offer positive return at the current price.':row.selection.lowerReturn>0?'Research candidate: estimated return stays positive after the calibration-error and sample-support adjustment.':'Tentative research: the conservative return is not positive after accounting for testing uncertainty.';
   if(row.market==='moneyline')row.cautions=['Moneyline and spread probabilities come from the same market-informed margin distribution. Historical moneyline price advantage is unproven.','Displayed prices can change; the original quoted price is required to assess return.'];
   if(adverse)row.cautions=[...row.cautions,'This probability model performed worse than its benchmark in the latest retrospective audit. The blanket market block was removed by user request; this remains experimental research.'];
   row.confidenceReason='The uncertainty adjustment comes from local effective sample size, market-specific calibration errors and week-block resampling. These are descriptive research bounds, not validated individual-game confidence coverage.';
   if(approved){row.probability=row.selection.probability;row.expectedReturn=row.selection.expectedReturn;row.researchConfidence='Supported';}
  }
  const groups=new Map();for(const r of report.all){if(!groups.has(r.gameId))groups.set(r.gameId,[]);groups.get(r.gameId).push(r);}
  const games=[...groups.values()].map(rows=>({...rows.slice().sort(compare)[0],markets:rows})).sort(compare);
  report.shortlist=games.slice(0,settings.limit??14);report.version=VERSION;report.selectionMethod='Unconditional price-adjusted return including pushes, ranked conservatively using calibration-group errors and local sample support. No probability model is qualified.';
  report.counts={candidates:report.all.filter(r=>r.status==='PAPER CANDIDATE').length,research:report.all.filter(r=>r.status==='RESEARCH').length,waiting:report.all.filter(r=>r.status==='WAIT').length,passed:report.all.filter(r=>r.status==='PASS').length};return report;
 }
 function calibration(records,market){
  const rs=records.filter(r=>r.sourceMode==='probability-validation'&&r.market===market&&['win','loss'].includes(r.result)&&valid(r.forecastProbability));
  const bins=Array.from({length:10},(_,i)=>{const a=rs.filter(r=>r.forecastProbability>=i/10&&(i===9?r.forecastProbability<=1:r.forecastProbability<(i+1)/10));return {from:i/10,to:(i+1)/10,n:a.length,predicted:a.length?a.reduce((s,r)=>s+r.forecastProbability,0)/a.length:null,observed:a.length?a.filter(r=>r.result==='win').length/a.length:null};});
  const paired=rs.filter(r=>valid(r.marketBenchmark));const brier=(a,key)=>a.length?a.reduce((s,r)=>s+(r[key]-(r.result==='win'?1:0))**2,0)/a.length:null;
  const settled=records.filter(r=>r.sourceMode==='probability-validation'&&r.market===market&&['win','loss','push'].includes(r.result)&&valid(r.forecastPushProbability)&&valid(r.forecastProbability));
  const predictedPushRate=settled.length?settled.reduce((s,r)=>s+r.forecastPushProbability,0)/settled.length:null,observedPushRate=settled.length?settled.filter(r=>r.result==='push').length/settled.length:null;
  return {n:rs.length,pending:records.filter(r=>r.sourceMode==='probability-validation'&&r.market===market&&!r.result).length,pushes:records.filter(r=>r.sourceMode==='probability-validation'&&r.market===market&&r.result==='push').length,brier:brier(rs,'forecastProbability'),pairedN:paired.length,pairedModelBrier:brier(paired,'forecastProbability'),marketBrier:brier(paired,'marketBenchmark'),pushForecastN:settled.length,predictedPushRate,observedPushRate,bins};
 }
 const api={VERSION,assess,rank,calibration};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ValueSelection=Object.freeze(api);
})(globalThis);
