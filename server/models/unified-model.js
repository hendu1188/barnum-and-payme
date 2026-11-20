(function(root){
 'use strict';
 const VERSION='unified-score-v1',finite=x=>typeof x==='number'&&Number.isFinite(x);
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
 const defaults=()=>typeof UnifiedModelConfig!=='undefined'?UnifiedModelConfig:require('./unified-model-config.json');
 function features(x){
  if(!x||![x.driveMargin,x.homeElo,x.awayElo,x.homeRest,x.awayRest].every(finite)||typeof x.neutral!=='boolean')return null;
  return [x.driveMargin/14,(x.homeElo-x.awayElo)/400,x.neutral?0:1,(clamp(x.homeRest,0,21)-clamp(x.awayRest,0,21))/7];
 }
 function project(x,c=defaults()){
  const f=features(x);if(!f||!finite(x.modelTotal))return null;
  if(!finite(x.marketHomeSpread)||!finite(x.marketTotal)||x.marketTotal<=0)return null;
  const independentMargin=f.reduce((s,v,i)=>s+v*c.marginCoefficients[i],0),margin=-x.marketHomeSpread+c.marketWeights.margin*(independentMargin+x.marketHomeSpread),total=x.marketTotal+c.marketWeights.total*(x.modelTotal-x.marketTotal);
  if(!finite(margin)||total<=0||Math.abs(margin)>total)return null;
  return {modelMargin:margin,modelSpread:-margin,modelTotal:total,independentMargin,independentTotal:x.modelTotal,marketInformed:true,homeScore:(total+margin)/2,awayScore:(total-margin)/2,inputs:{...x},version:VERSION};
 }
 function wilson(p,n){if(!finite(p)||!finite(n)||n<=0)return {lower:0,upper:1};const z=1.96,d=1+z*z/n,m=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return {lower:clamp(m-h),upper:clamp(m+h)};}
 function transform(p,t){if(p<=0)return 0;if(p>=1)return 1;return sigmoid((t?.intercept||0)+(t?.slope??1)*Math.log(p/(1-p)));}
 function distribution(kind,mean,c=defaults()){
  if(!finite(mean))return null;const bandwidth=c.bandwidths[kind],ref=c.reference;if(!finite(bandwidth)||bandwidth<=0||!Array.isArray(ref))return null;
  let sum=0,sumSquare=0;const atoms=[];
  for(const r of ref){
   if(kind==='margin'){
    const a=Math.exp(-.5*((r.modelMargin-mean)/bandwidth)**2),b=Math.exp(-.5*((-r.modelMargin-mean)/bandwidth)**2),w=a+b;
    atoms.push([r.actualMargin,a],[-r.actualMargin,b]);sum+=w;sumSquare+=w*w;
   }else{const w=Math.exp(-.5*((r.modelTotal-mean)/bandwidth)**2);atoms.push([r.actualTotal,w]);sum+=w;sumSquare+=w*w;}
  }
  if(sum<=1e-10||sumSquare<=0)return null;
  const effectiveN=sum*sum/sumSquare,scale=c.tailScales[kind];
  if(c.family==='discrete-logistic-keynumbers'){
   const s=c.scales[kind]+(kind==='margin'?c.favoriteScaleSlope*Math.abs(mean):0),center=mean+(c.offsets?.[kind]||0),outcomes=[];let total=0;
   const F=x=>sigmoid((x-center)/s);
   for(let k=kind==='margin'?-150:0;k<=(kind==='margin'?150:200);k++){
    if(kind==='margin'&&k===0)continue;
    const p=(F(k+.5)-F(k-.5))*(kind==='margin'?(c.keyWeights?.[Math.abs(k)]||1):1);outcomes.push([k,p]);total+=p;
   }
   if(total<=0)return null;
   return {effectiveN,cdf:t=>clamp(outcomes.reduce((s,[k,p])=>s+(k<=t?p:0),0)/total)};
  }
  function prior(t){
   const k=Math.floor(t),F=n=>sigmoid((n+.5-mean)/scale);
   if(kind==='margin'){const zero=F(0)-F(-1);return k<0?F(k)/(1-zero):(F(k)-zero)/(1-zero);}
   if(k<0)return 0;const belowZero=F(-1);return (F(k)-belowZero)/(1-belowZero);
  }
  // One smooth pseudo-observation prevents impossible 0%/100% tail forecasts.
  function cdf(t){const mass=atoms.reduce((s,[outcome,w])=>s+(outcome<=t?w:0),0);return clamp(transform((mass+prior(t))/(sum+1),c.transforms?.[kind]));}
  return {cdf,effectiveN};
 }
 function probabilities(market,x,c=defaults(),withUncertainty=true){
  const kind=market==='total'?'total':'margin',mean=kind==='total'?x.modelTotal:x.modelMargin;
  const threshold=market==='moneyline'?0:market==='spread'?-x.marketHomeSpread:x.totalLine;
  if(!['spread','total','moneyline'].includes(market)||!finite(mean)||!finite(threshold))return null;
  const d=distribution(kind,mean,c);if(!d)return null;
  const win=1-d.cdf(threshold),push=market!=='moneyline'&&Number.isInteger(threshold)?Math.max(0,d.cdf(threshold)-d.cdf(threshold-1)):0,loss=clamp(1-win-push),decided=1-push;
  if(decided<=1e-9)return null;const probability=win/decided;
  let lower=0,upper=1,available=false,calibrationN=0,method='Insufficient independent calibration support';
  if(withUncertainty){
   const bins=c.calibration?.[market]?.bins||[],bin=bins.find(b=>probability>=b.from&&(probability<b.to||b.to===1&&probability<=1));
   if(bin&&bin.n>=20&&bin.weeks>=3&&d.effectiveN>=20){
    const local=wilson(probability,d.effectiveN*decided);
    lower=clamp(Math.min(local.lower,probability+bin.errorLower));upper=clamp(Math.max(local.upper,probability+bin.errorUpper));available=true;calibrationN=bin.n;
    method='Envelope of local effective-sample Wilson bounds and held-period calibration-group errors, widened by week-block resampling; descriptive research bounds, not validated individual coverage';
   }
  }
  const pushBounds=push>0?wilson(push,d.effectiveN):{lower:0,upper:0};
  return {probability,positiveSide:market==='total'?'over':'home',winProbability:win,lossProbability:loss,pushProbability:push,probabilityLowerBound:lower,probabilityUpperBound:upper,pushLowerBound:pushBounds.lower,pushUpperBound:pushBounds.upper,conditionalOnNoPush:true,qualified:false,status:'experimental',version:VERSION,modelArtifactHash:c.artifactHash||null,inputs:{...x},uncertainty:{available,effectiveN:d.effectiveN,calibrationN,method},diagnostic:c.diagnostic?.[market]||null};
 }
 function priceValue(forecast,side,price){
  if(!forecast||!finite(price)||Math.abs(price)<100)return null;const positive=side===forecast.positiveSide,p=positive?forecast.probability:1-forecast.probability,push=forecast.pushProbability,payout=price<0?100/-price:price/100;
  const win=positive?forecast.winProbability:forecast.lossProbability,loss=positive?forecast.lossProbability:forecast.winProbability,lower=positive?forecast.probabilityLowerBound:1-forecast.probabilityUpperBound,upper=positive?forecast.probabilityUpperBound:1-forecast.probabilityLowerBound;
  const conditionalLower=lower*payout-(1-lower),pushExtreme=conditionalLower>=0?forecast.pushUpperBound:forecast.pushLowerBound;
  return {probability:p,winProbability:win,lossProbability:loss,pushProbability:push,expectedReturn:win*payout-loss,lowerReturn:(1-pushExtreme)*conditionalLower,probabilityLowerBound:lower,probabilityUpperBound:upper,breakEven:1/(1+payout),uncertaintyAvailable:forecast.uncertainty?.available===true};
 }
 const api={VERSION,features,project,distribution,probabilities,priceValue,wilson};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.UnifiedModel=Object.freeze(api);
})(globalThis);
