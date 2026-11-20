'use strict';
// This module does not call a predictor or trust a predictor's recommended status.
const E=require('./models/shortlist-engine-v2'),{fresh}=require('./pricing.cjs');
function audit(row,game,{now,sources,registry,snapshotId,maxAge=60}){
 const checks=[],check=(name,ok,blocking=true,detail='')=>checks.push({name,passed:!!ok,blocking,detail}),q=row.quote,f=row.selection?.forecast;
 check('Canonical teams and confirmed schedule match',game.mappingConfirmed&&game.homeId!==game.awayId);
 check('Upcoming, active game with confirmed kickoff',+new Date(game.startDate)>+new Date(now)&&!game.startTimeTBD&&!game.completed&&!/cancel|postpon/i.test(game.status||''));
 check('Neutral/home venue resolved',typeof game.neutralSite==='boolean');
 check('Observed quote is current',q&&fresh(q,now,maxAge));
 check('Provider quote predates its receipt',q&&sources.some(s=>s.resource==='odds'&&+new Date(q.quotedAt)<=+new Date(s.received_at)+60000));
 check('Quote belongs to this game, book, side and market',q&&E.quotesFor(game.ev,row.market).some(o=>o.bookKey===q.bookKey&&o.side===q.side&&o.line===q.line&&o.price===q.price));
 const rawMarket=game.ev.bookmakers.find(b=>b.key===q?.bookKey)?.markets.find(m=>m.key===({spread:'spreads',total:'totals',moneyline:'h2h'}[row.market]));
 check('Supported two-way full-game settlement',rawMarket?.outcomes.length===2&&new Set(E.quotesFor(game.ev,row.market).filter(o=>o.bookKey===q?.bookKey).map(o=>o.side)).size===2&&(row.market==='moneyline'||Number.isInteger(q?.line*2)));
 if(q&&row.market!=='moneyline')check('Paired line orientation is consistent',E.quotesFor(game.ev,row.market).some(o=>o.bookKey===q.bookKey&&o.side!==q.side&&(row.market==='total'?o.line===q.line:o.line===-q.line)));
 check('Source observations precede this prediction',sources.every(s=>+new Date(s.received_at)<=+new Date(now)+60000));
 check('Probability and settlement partition',f&&[f.winProbability,f.lossProbability,f.pushProbability].every(p=>Number.isFinite(p)&&p>=0&&p<=1)&&Math.abs(f.winProbability+f.lossProbability+f.pushProbability-1)<1e-8);
 check('Artifact and training cutoff match the registry',f&&registry[f.version]?.artifact===f.modelArtifactHash&&+new Date(registry[f.version].trainedThrough)<+new Date(game.startDate));
 check('No unresolved personnel scenario',!row.appliedRules.personnelHold&&!row.appliedRules.primaryPasserHold);
 check('No adverse totals weather screen',!row.appliedRules.weatherTotalHold);
 check('Current weather and official personnel coverage',row.coverage.complete,false,'Incomplete coverage cannot produce a promoted paper recommendation.');
 check('Probability uncertainty supported',row.selection?.uncertaintyAvailable,false);
 check('Conservative return clears the provisional 3% threshold',row.selection?.lowerReturn>=.03,false,'The threshold is a screening rule, not evidence of profitability.');
 check('Model has demonstrated a profitable advantage',registry[f?.version]?.qualified===true,false,'Current versions are research only.');
 if(row.market==='total')check('Totals replacement passed its release checks',f?.recommendationEligible===true);
 const failed=checks.filter(c=>!c.passed&&c.blocking),warnings=checks.filter(c=>!c.passed&&!c.blocking),negative=row.selection&&row.selection.expectedReturn<=0;
 const status=failed.length?'BLOCKED':negative?'PASS':warnings.some(c=>/coverage|uncertainty|3%/.test(c.name))?'WATCH':'RESEARCH';
 return {version:'independent-audit-v1',snapshotId,at:now,status,checks,failed:failed.map(c=>c.name),warnings:warnings.map(c=>c.name),publishable:status==='RESEARCH',execution:'No wagers executed'};
}
function rankTier(status){return {RESEARCH:1,WATCH:2,PASS:3,BLOCKED:4}[status]??4;}
module.exports={audit,rankTier};
