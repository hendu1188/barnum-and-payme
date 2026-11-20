'use strict';
const fs=require('node:fs'),path=require('node:path'),{config}=require('./collector.cjs');
function bootstrap(store,root,{env=process.env,dataDir=require('./runtime.cjs').dataPaths(root,env).dataDir,importLegacy=true}={}){
 const seed=path.join(root,'seed','saved-data.json');if(importLegacy&&!store.latest('games')&&fs.existsSync(seed)){const data=JSON.parse(fs.readFileSync(seed,'utf8'));store.transaction(()=>{for(const row of data.resources)store.raw(row.resource,row.provider,row.body,row.at,0,{source:row.source||'Imported retained research data; original timestamp preserved',imported:true});});}
 const file=path.join(dataDir,'credentials.json');if(importLegacy&&!fs.existsSync(file)){let found={};try{const source=JSON.parse(fs.readFileSync(path.join(root,'seed','connections-source.json'),'utf8')),html=fs.readFileSync(source.originalFile,'utf8');for(const [key,name] of [['odds','ODDS'],['cfbd','CFBD']])found[key]=html.match(new RegExp('const DEFAULT_'+name+'_KEY\\s*=\\s*[\'\"]([^\'\"]+)[\'\"]'))?.[1]||'';}catch{}if(found.odds||found.cfbd){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(found),{mode:0o600});}}
 const existing=store.setting('config',null);store.set('config',{...config(store),...(existing===null?{enabled:env.PARLAY_COLLECTION_ENABLED==='true'}:{})});
}
module.exports={bootstrap};
