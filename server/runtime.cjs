'use strict';
const path=require('node:path'),crypto=require('node:crypto');
function dataPaths(root,env=process.env){const dataDir=path.resolve(env.PARLAY_DATA_DIR||path.join(root,'data'));return {dataDir,database:path.join(dataDir,'parlay.sqlite'),credentials:path.join(dataDir,'credentials.json'),backups:path.join(dataDir,'backups')};}
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){return 'scrypt$'+salt+'$'+crypto.scryptSync(password,salt,32).toString('hex');}
function equal(a,b){const x=crypto.createHash('sha256').update(String(a)).digest(),y=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(x,y);}
function accessSettings(env=process.env){const hosted=env.PARLAY_DEPLOYMENT==='hosted';let origin=env.APP_ORIGIN||env.RENDER_EXTERNAL_URL||'';if(!origin&&env.RENDER_EXTERNAL_HOSTNAME)origin='https://'+env.RENDER_EXTERNAL_HOSTNAME;let url=null;if(origin){url=new URL(origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('APP_ORIGIN must be an HTTPS origin only');origin=url.origin;}
 let ownerHash=env.PARLAY_PASSWORD_HASH||'';if(!ownerHash&&env.PARLAY_PASSWORD){if(env.PARLAY_PASSWORD.length<20)throw Error('Hosted owner password must have at least 20 characters');ownerHash=passwordHash(env.PARLAY_PASSWORD);}if(ownerHash&&!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(ownerHash))throw Error('Invalid owner password hash format');
 if(hosted&&(!url||url.protocol!=='https:'||!ownerHash))throw Error('Hosted mode requires an HTTPS APP_ORIGIN and a strong owner password');const writer=env.PARLAY_RESEARCH_TOKEN||'';if(writer&&writer.length<32)throw Error('Research writer token must have at least 32 characters');
 return {hosted,origin,host:url?.host||null,username:env.PARLAY_USERNAME||'owner',ownerHash,writer,bind:hosted?'0.0.0.0':'127.0.0.1'};
}
class Access{
 constructor(settings){this.settings=settings;this.failures=new Map();this.cache=new Map();this.reads=new Map();}
 check(req,res){const s=this.settings,host=req.headers.host||'',hostName=host.split(':')[0],url=new URL(req.url,s.origin||'http://'+host),reply=(status,message,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify({error:message}));return null;};
  if(url.pathname==='/healthz'&&['GET','HEAD'].includes(req.method))return {url,role:'health',origin:s.origin||'http://'+host};
  if(s.hosted?host!==s.host:!['127.0.0.1','localhost'].includes(hostName))return reply(403,'Unexpected host');
  if(s.hosted&&(req.headers['x-forwarded-proto']||'').split(',')[0].trim()!=='https'){res.writeHead(308,{Location:s.origin+url.pathname+url.search});res.end();return null;}
  let role='owner';if(s.hosted||s.ownerHash){const authorization=req.headers.authorization||'',ip=req.socket.remoteAddress||'local',now=Date.now(),failure=this.failures.get(ip);if(failure&&failure.until>now&&failure.count>=5)return reply(429,'Too many sign-in attempts. Try again later.',{'Retry-After':'900'});
   const bearer=authorization.startsWith('Bearer ')?authorization.slice(7):null;if(bearer&&s.writer&&equal(bearer,s.writer)){const allowed=['/api/research/context','/api/research/dossiers','/api/research/jobs','/api/research/reviews','/api/research/publish'];if(!allowed.includes(url.pathname))return reply(403,'Research token cannot access this operation');role='research';}
   else{let valid=false;if(authorization.startsWith('Basic ')&&authorization.length<=2048){const cacheKey=crypto.createHash('sha256').update(authorization).digest('hex'),hit=this.cache.get(cacheKey);if(hit&&hit>now)valid=true;else{const pair=Buffer.from(authorization.slice(6),'base64').toString('utf8'),at=pair.indexOf(':'),user=pair.slice(0,at),password=pair.slice(at+1);if(at>0&&s.ownerHash&&password.length<=1024){const [,salt,expected]=s.ownerHash.split('$');valid=equal(user,s.username)&&equal(crypto.scryptSync(password,salt,32).toString('hex'),expected);}if(valid){if(this.cache.size>=200)this.cache.clear();this.cache.set(cacheKey,now+60000);}}}
    if(!valid){if(authorization){const f=failure&&failure.until>now?failure:{count:0,until:now+15*60000};f.count++;this.failures.set(ip,f);if(this.failures.size>1000)this.failures.delete(this.failures.keys().next().value);}return reply(401,'Owner sign-in required',{'WWW-Authenticate':'Basic realm="Parlay All Day", charset="UTF-8"'});}this.failures.delete(ip);}
  }
  if(!['GET','HEAD'].includes(req.method)){const expected=s.origin||'http://'+host;if(req.headers['x-parlay-request']!=='1'||(req.headers.origin&&req.headers.origin!==expected))return reply(403,'Same-origin application request required');}
  if(s.hosted){const key=req.socket.remoteAddress||'local',now=Date.now(),r=this.reads.get(key);if(r&&r.until>now){if(++r.count>180)return reply(429,'Request limit reached',{'Retry-After':'60'});}else this.reads.set(key,{until:now+60000,count:1});if(this.reads.size>1000)this.reads.delete(this.reads.keys().next().value);}
  return {url,role,origin:s.origin||'http://'+host};
 }
}
module.exports={dataPaths,passwordHash,equal,accessSettings,Access};
