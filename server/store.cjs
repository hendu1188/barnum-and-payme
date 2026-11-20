'use strict';
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const parse=r=>{if(!r)return null;const value=r.data??r.body??r.value;return JSON.parse(typeof value==='string'&&value.startsWith('gzip:')?require('node:zlib').gunzipSync(Buffer.from(value.slice(5),'base64')).toString('utf8'):value);};
class Store{
 constructor(filename){if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});this.db=new DatabaseSync(filename);this.db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));for(const table of ['raw_fetches','odds','snapshots','predictions','decisions','audits','settlements','feature_snapshots','simulations','ai_opinions','ai_settlements','usage_notes','research_reviews'])for(const action of ['UPDATE','DELETE'])this.db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable history'); END;`);}
 get(sql,...args){return this.db.prepare(sql).get(...args);}
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 setting(key,fallback){return parse(this.get('SELECT value FROM settings WHERE key=?',key))??fallback;}
 set(key,value){this.run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
 raw(resource,provider,body,at,ttl=0,{source='',imported=false,requestedAt=at}={}){const serialized=JSON.stringify(body),bodyHash=hash(serialized),id=hash([resource,at,bodyHash]),stored=Buffer.byteLength(serialized)>65536?'gzip:'+require('node:zlib').gzipSync(serialized).toString('base64'):serialized;this.run('INSERT OR IGNORE INTO raw_fetches VALUES(?,?,?,?,?,?,?,?,?,?)',id,resource,provider,requestedAt,at,new Date(+new Date(at)+ttl).toISOString(),source,bodyHash,stored,Number(imported));return this.get('SELECT * FROM raw_fetches WHERE id=?',id);}
 latest(resource){return this.get('SELECT * FROM raw_fetches WHERE resource=? ORDER BY received_at DESC,rowid DESC LIMIT 1',resource);}
 snapshot(data,rawIds,at,imported=false){const id=hash([data,rawIds,at]);this.run('INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?,?)',id,at,JSON.stringify(rawIds),JSON.stringify(data),Number(imported));return id;}
 close(){this.db.close();}
}
module.exports={Store,hash,parse};
