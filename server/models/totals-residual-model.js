(function(root){
 'use strict';
 const VERSION='totals-residual-v2',finite=Number.isFinite,sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
 const defaults=()=>typeof TotalsRepairConfig!=='undefined'?TotalsRepairConfig:require('./totals-repair-config.json');
 function features(rawTotal,marketTotal){return [rawTotal,marketTotal].every(finite)&&rawTotal>0&&marketTotal>0?[1,(rawTotal-marketTotal)/10,(marketTotal-55)/10]:null;}
 function project(rawTotal,marketTotal,c=defaults()){
  const f=features(rawTotal,marketTotal);if(!f||!c.coefficients?.every(finite)||c.coefficients.length!==3)return null;
  const point=marketTotal+f.reduce((s,v,i)=>s+v*c.coefficients[i],0);
  return finite(point)&&point>0&&point<200?{modelTotal:point,version:VERSION,marketInformed:true,rawTotal,marketTotal}:null;
 }
 function probabilities(mean,line,c=defaults()){
  if(![mean,line,c.bandwidth].every(finite)||mean<=0||line<=0||c.bandwidth<=0||!Array.isArray(c.residuals)||c.residuals.length<30||!c.residuals.every(finite))return null;
  const F=t=>c.residuals.reduce((s,e)=>s+sigmoid((t-mean-e)/c.bandwidth),0)/c.residuals.length,lo=F(-.5),hi=F(250.5),norm=hi-lo;
  if(norm<=0)return null;
  const cdf=t=>Math.max(0,Math.min(1,(F(Math.floor(t)+.5)-lo)/norm));
  const win=1-cdf(line),push=Number.isInteger(line)?Math.max(0,cdf(line)-cdf(line-1)):0,loss=Math.max(0,1-win-push),decided=1-push,p=win/decided;
  const bin=c.calibration?.bins?.find(b=>p>=b.from&&(p<b.to||b.to===1&&p<=1)),available=!!(bin&&bin.n>=30&&bin.weeks>=4);
  return {probability:p,positiveSide:'over',winProbability:win,lossProbability:loss,pushProbability:push,probabilityLowerBound:available?Math.max(0,p+bin.errorLower):0,probabilityUpperBound:available?Math.min(1,p+bin.errorUpper):1,pushLowerBound:0,pushUpperBound:Number.isInteger(line)?1:0,conditionalOnNoPush:true,qualified:false,recommendationEligible:c.release?.eligible===true,status:'comparison-only',version:VERSION,modelArtifactHash:c.artifactHash||null,inputs:{modelTotal:mean,totalLine:line},uncertainty:{available,effectiveN:c.residuals.length,calibrationN:bin?.n||0,method:'Prior-season rolling forecast residuals and development calibration groups; no validated individual coverage. Integer-line push uncertainty is unsupported and conservatively spans zero to one.'},diagnostic:c.diagnostics||null};
 }
 const api={VERSION,features,project,probabilities};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TotalsResidualModel=Object.freeze(api);
})(globalThis);
