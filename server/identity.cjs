'use strict';
const W=require('./models/weekly-evidence'),E=require('./models/shortlist-engine-v2'),{parse,hash}=require('./store.cjs');
const norm=W.norm||((s)=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''));
function normalize(store,resources,now){
 const games=parse(resources.games)||[],teams=parse(resources.teams)||[],events=parse(resources.odds)||[],aliases=new Map(),names=new Map();
 function team(id,name,conference){id=id!=null?'cfbd:'+id:'name:'+hash(name).slice(0,20);store.run('INSERT INTO teams VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,conference=excluded.conference,updated_at=excluded.updated_at',id,name,conference||null,now);names.set(name,id);return id;}
 function alias(name,id){const k=norm(name);if(!k)return;if(!aliases.has(k))aliases.set(k,new Set());aliases.get(k).add(id);store.run('INSERT OR IGNORE INTO aliases VALUES(?,?)',k,id);}
 for(const t of teams){if(!t.school)continue;const id=team(t.id,t.school,t.conference);for(const n of [t.school,t.mascot?`${t.school} ${t.mascot}`:null,t.abbreviation,...t.alternateNames||[]])if(n)alias(n,id);}
 const normalized=games.filter(g=>g.homeClassification==='fbs'||g.awayClassification==='fbs').filter(g=>g.id!=null&&g.homeTeam&&g.awayTeam&&Number.isFinite(+new Date(g.startDate))).map(g=>{const h=team(g.homeId,g.homeTeam,g.homeConference),a=team(g.awayId,g.awayTeam,g.awayConference);alias(g.homeTeam,h);alias(g.awayTeam,a);return {...g,id:'cfbd-'+g.id,providerId:String(g.id),homeId:h,awayId:a};});
 // Official names and unique aliases first; bounded longest-school matching is
 // accepted only when it identifies one team. Ambiguity always quarantines odds.
 function resolve(name){const exact=aliases.get(norm(name));if(exact?.size===1)return [...exact][0];if(exact?.size>1)return null;const canonical=W.canonical(name,[...names.keys()]);if(!canonical)return null;const candidates=[...names].filter(([n])=>norm(name).startsWith(norm(n)+' '));if(candidates.length&&candidates.filter(([n])=>n.length===canonical.length).length!==1)return null;return names.get(canonical)||null;}
 for(const g of normalized)store.run('INSERT INTO games VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET home_id=excluded.home_id,away_id=excluded.away_id,conference=excluded.conference,kickoff=excluded.kickoff,completed=excluded.completed,status=excluded.status,raw_id=excluded.raw_id,data=excluded.data',g.id,g.providerId,g.homeId,g.awayId,g.startDate,g.season||new Date(g.startDate).getUTCFullYear(),g.homeConference||g.awayConference||null,Number(g.completed),g.completed?'final':g.startTimeTBD?'time-tbd':g.status||'scheduled',resources.games.id,JSON.stringify(g));
 const joined=new Map(),quarantined=[],ambiguousGames=new Set();
 for(const ev of events){const h=resolve(ev.home_team),a=resolve(ev.away_team),matches=normalized.filter(g=>g.homeId===h&&g.awayId===a&&Math.abs(+new Date(g.startDate)-+new Date(ev.commence_time))<=2*3600000);
  if(!h||!a||h===a||matches.length!==1){quarantined.push(ev.id);store.run('INSERT OR IGNORE INTO quarantined_events VALUES(?,?,?,?)',hash([ev.id,resources.odds.id]),resources.odds.received_at,'Ambiguous or unmatched teams/orientation/kickoff',JSON.stringify(ev));continue;}
  const g=matches[0];if(joined.has(g.id)||ambiguousGames.has(g.id)){joined.delete(g.id);ambiguousGames.add(g.id);quarantined.push(ev.id);continue;}
  joined.set(g.id,ev);store.run('INSERT INTO event_links VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET game_id=excluded.game_id,observed_at=excluded.observed_at',ev.id,g.id,now);
  for(const market of ['spread','total','moneyline'])for(const q of E.quotesFor(ev,market)){const id=hash([resources.odds.id,g.id,market,q.bookKey,q.side,q.line,q.price,q.quotedAt]);store.run('INSERT OR IGNORE INTO odds VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,resources.odds.id,g.id,q.bookKey,q.book,market,q.side,q.line,q.price,q.quotedAt,resources.odds.received_at,Number(resources.odds.imported));}
 }
 const slate=normalized.map(g=>{const ev=joined.get(g.id);return {...g,eventId:ev?.id||null,ev:{id:g.id,home_team:ev?.home_team||g.homeTeam,away_team:ev?.away_team||g.awayTeam,commence_time:g.startDate,bookmakers:ev?.bookmakers||[]},mappingConfirmed:!!ev};});
 return {slate,quarantined};
}
module.exports={normalize,norm};
