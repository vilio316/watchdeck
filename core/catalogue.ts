import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { discover } from './scanner';
import { artworkKey } from './posters';
import type { Artwork } from '../shared/types';
import { parseMedia } from './parser';
import { classify } from '../shared/classification';
import { inspectVideo } from './runtime';
import type { ProbeResult } from './runtime';
import type { MovieDetailsCache } from '../shared/types';
import type { Found } from './scanner';
import type { Item, ParsedMedia, Root, Snapshot } from '../shared/types';
export class Catalogue {
  readonly db:DatabaseSync;
  constructor(file:string) {
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS roots(id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'registered',last_scan TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS content(id TEXT PRIMARY KEY,parsed TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(root_id TEXT NOT NULL REFERENCES roots(id),relative_path TEXT NOT NULL,content_id TEXT NOT NULL REFERENCES content(id),size INTEGER,mtime REAL,available INTEGER NOT NULL,PRIMARY KEY(root_id,relative_path));
      CREATE TABLE IF NOT EXISTS watch_events(id TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES content(id),watched_at TEXT NOT NULL,undone INTEGER NOT NULL DEFAULT 0);`);
    const version=this.db.prepare('SELECT version FROM schema_version').get() as {version:number};
    if(![1,2,3,4].includes(version.version)) throw new Error('Unsupported catalogue version. Use a compatible app version.');
    this.db.exec('BEGIN IMMEDIATE');
    try{this.db.exec(`CREATE TABLE IF NOT EXISTS artwork(key TEXT PRIMARY KEY,metadata TEXT NOT NULL); CREATE TABLE IF NOT EXISTS content_alias(key TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES content(id)); CREATE TABLE IF NOT EXISTS file_probe(root_id TEXT NOT NULL,relative_path TEXT NOT NULL,size INTEGER,mtime REAL,seconds REAL,error TEXT,PRIMARY KEY(root_id,relative_path)); CREATE TABLE IF NOT EXISTS classification(content_id TEXT PRIMARY KEY REFERENCES content(id),override TEXT NOT NULL CHECK(override IN ('movie','episode'))); CREATE TABLE IF NOT EXISTS movie_details(id INTEGER PRIMARY KEY,metadata TEXT NOT NULL); UPDATE schema_version SET version=4; COMMIT`);}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close(){this.db.close();}
  roots():Root[]{return this.db.prepare('SELECT id,path,status,last_scan AS lastScan,error FROM roots ORDER BY path').all() as unknown as Root[];}
  root(id:string):Root {const root=this.roots().find(r=>r.id===id);if(!root)throw new Error('Unknown library folder');return root;}
  register(folder:string,relinkId?:string):string {
    folder=path.resolve(folder);
    if(relinkId){this.root(relinkId);this.db.prepare("UPDATE roots SET path=?,status='registered',error=NULL WHERE id=?").run(folder,relinkId);return relinkId;}
    const existing=this.roots().find(r=>process.platform==='win32'?r.path.toLowerCase()===folder.toLowerCase():r.path===folder);if(existing)return existing.id;
    const id=randomUUID();this.db.prepare('INSERT INTO roots(id,path) VALUES(?,?)').run(id,folder);return id;
  }
  async scan(id:string,progress:(count:number)=>void=()=>{}) {
    const root=this.root(id);
    try {const found=await discover(root.path,progress);this.commitScan(id,found);}
    catch(error){this.db.prepare("UPDATE roots SET status='error',error=? WHERE id=?").run(error instanceof Error?error.message:String(error),id);throw error;}
  }
  commitScan(id:string,found:Found[]) {
    const root=this.root(id);this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE files SET available=0 WHERE root_id=?').run(id);
      const content=this.db.prepare('INSERT INTO content(id,parsed) VALUES(?,?) ON CONFLICT(id) DO NOTHING');
      const file=this.db.prepare('INSERT INTO files(root_id,relative_path,content_id,size,mtime,available) VALUES(?,?,?,?,?,1) ON CONFLICT(root_id,relative_path) DO UPDATE SET content_id=excluded.content_id,size=excluded.size,mtime=excluded.mtime,available=1');
      const existing=this.db.prepare('SELECT c.id,c.parsed FROM files f JOIN content c ON c.id=f.content_id WHERE f.root_id=? AND f.relative_path=?');
      for(const f of found) {
        const p=f.parsed;
        const key=[p.kind,p.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''),p.year,p.season,p.episode].join('|');
        const canonical=createHash('sha256').update(key).digest('hex');
        const alias=this.db.prepare('SELECT content_id FROM content_alias WHERE key=?').get(canonical) as {content_id:string}|undefined;
        let cid=alias?.content_id??canonical;
        const prior=existing.get(id,f.relativePath) as {id:string;parsed:string}|undefined;
        if(prior){
          const before=JSON.parse(prior.parsed) as ParsedMedia;
          const legacy=parseMedia(path.join(root.path,f.relativePath),{stripPrefixes:false});
          const sameFields=['kind','year','season','episode'].every(field=>before[field as keyof ParsedMedia]===p[field as keyof ParsedMedia]);
          if(before.title===p.title&&sameFields)cid=prior.id;
          // This is a parser correction at the same file path, not a new watchable title.
          if(before.title===legacy.title&&p.title!==legacy.title&&sameFields){
            if(cid!==prior.id&&this.db.prepare('SELECT id FROM content WHERE id=?').get(cid)){
              this.db.prepare('UPDATE files SET content_id=? WHERE content_id=?').run(cid,prior.id);
              this.db.prepare('UPDATE watch_events SET content_id=? WHERE content_id=?').run(cid,prior.id);
              this.db.prepare('UPDATE content_alias SET content_id=? WHERE content_id=?').run(cid,prior.id);
              this.db.prepare('INSERT OR IGNORE INTO classification(content_id,override) SELECT ?,override FROM classification WHERE content_id=?').run(cid,prior.id);
              this.db.prepare('DELETE FROM classification WHERE content_id=?').run(prior.id);
              this.db.prepare('DELETE FROM content WHERE id=?').run(prior.id);
            }else cid=prior.id;
            this.db.prepare('INSERT INTO content_alias(key,content_id) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET content_id=excluded.content_id').run(canonical,cid);
            this.db.prepare('UPDATE content SET parsed=? WHERE id=?').run(JSON.stringify(p),cid);
            const oldArtwork=this.artwork(artworkKey(before));
            if(oldArtwork&&!this.artwork(artworkKey(p))){
              if(oldArtwork.status==='matched')this.saveArtwork(artworkKey(p),oldArtwork);
              // Negative/review results for the dirty title are intentionally not copied.
            }
          }
        }
        content.run(cid,JSON.stringify(p));file.run(id,f.relativePath,cid,f.size,f.mtime);
      }
      this.db.prepare("UPDATE roots SET status='online',last_scan=?,error=NULL WHERE id=?").run(new Date().toISOString(),id);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  snapshot():Snapshot {
    const roots=this.roots();
    const content=this.db.prepare('SELECT id,parsed FROM content').all() as unknown as {id:string;parsed:string}[];
    const files=this.db.prepare('SELECT root_id,relative_path,content_id,available,size,mtime FROM files').all() as unknown as {root_id:string;relative_path:string;content_id:string;available:number;size:number;mtime:number}[];
    const watched=this.db.prepare('SELECT content_id,MAX(watched_at) AS watched_at FROM watch_events WHERE undone=0 GROUP BY content_id').all() as unknown as {content_id:string;watched_at:string}[];
    const rootMap=new Map(roots.map(r=>[r.id,r]));const watchMap=new Map(watched.map(w=>[w.content_id,w]));
    const fileMap=new Map<string,typeof files>();for(const f of files){const list=fileMap.get(f.content_id)??[];list.push(f);fileMap.set(f.content_id,list);}
    const artRows=this.db.prepare('SELECT key,metadata FROM artwork').all() as unknown as {key:string;metadata:string}[];
    const artMap=new Map(artRows.map(r=>[r.key,JSON.parse(r.metadata) as Artwork]));
    const probes=this.db.prepare('SELECT * FROM file_probe').all() as unknown as {root_id:string;relative_path:string;size:number;mtime:number;seconds:number|null;error:string|null}[];
    const probeMap=new Map(probes.map(p=>[JSON.stringify([p.root_id,p.relative_path]),p]));
    const overrides=new Map((this.db.prepare('SELECT * FROM classification').all() as unknown as {content_id:string;override:'movie'|'episode'}[]).map(r=>[r.content_id,r.override]));
    const detailMap=new Map((this.db.prepare('SELECT * FROM movie_details').all() as unknown as {id:number;metadata:string}[]).map(r=>[r.id,JSON.parse(r.metadata) as MovieDetailsCache]));
    const items=content.map(c=>{
      const copies=fileMap.get(c.id)??[];const watch=watchMap.get(c.id);
      const parsed=JSON.parse(c.parsed) as ParsedMedia;
      const fileDetails=copies.map(f=>{const probe=probeMap.get(JSON.stringify([f.root_id,f.relative_path]));const valid=probe&&probe.size===f.size&&probe.mtime===f.mtime;return {path:path.join(rootMap.get(f.root_id)!.path,f.relative_path),seconds:valid?probe.seconds:null,error:valid?probe.error??undefined:undefined,available:f.available===1&&rootMap.get(f.root_id)?.status==='online'};});
      const durations=fileDetails.filter(f=>f.available&&f.seconds!==null).map(f=>f.seconds!);
      const known=durations.length?durations:fileDetails.filter(f=>f.seconds!==null).map(f=>f.seconds!);
      const runtimeSeconds=known.length?Math.max(...known):null;
      const manualKind=overrides.get(c.id)??null;const classification=classify(parsed.kind,runtimeSeconds,manualKind);
      const artwork=artMap.get(artworkKey({...parsed,kind:classification.kind}));
      return {...parsed,kind:classification.kind,parsedKind:parsed.kind,manualKind,classificationSource:classification.source,runtimeSeconds,runtimeConflict:known.some(s=>s<4800)&&known.some(s=>s>=4800),fileDetails,review:classification.kind==='movie'?null:parsed.review,artwork,movieDetails:classification.kind==='movie'&&artwork?.selected?detailMap.get(artwork.selected.id):undefined,id:c.id,watched:!!watch,watchedAt:watch?.watched_at??null,available:copies.some(f=>f.available===1&&rootMap.get(f.root_id)?.status==='online'),paths:fileDetails.map(f=>f.path)};
    });
    return {roots,items:items.sort((a,b)=>a.title.localeCompare(b.title)||(a.season??0)-(b.season??0)||(a.episode??0)-(b.episode??0))};
  }
  artwork(key:string):Artwork|undefined{const row=this.db.prepare('SELECT metadata FROM artwork WHERE key=?').get(key) as {metadata:string}|undefined;return row?JSON.parse(row.metadata):undefined;}
  saveArtwork(key:string,value:Artwork){this.db.prepare('INSERT INTO artwork(key,metadata) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET metadata=excluded.metadata').run(key,JSON.stringify(value));}
  setClassification(id:string,value:'auto'|'movie'|'episode'){
    if(!this.db.prepare('SELECT id FROM content WHERE id=?').get(id))throw new Error('Unknown title');
    if(value==='auto')this.db.prepare('DELETE FROM classification WHERE content_id=?').run(id);
    else if(['movie','episode'].includes(value))this.db.prepare('INSERT INTO classification(content_id,override) VALUES(?,?) ON CONFLICT(content_id) DO UPDATE SET override=excluded.override').run(id,value);
    else throw new Error('Invalid classification');
  }
  details(id:number):MovieDetailsCache|undefined{const row=this.db.prepare('SELECT metadata FROM movie_details WHERE id=?').get(id) as {metadata:string}|undefined;return row?JSON.parse(row.metadata):undefined;}
  saveDetails(id:number,value:MovieDetailsCache){this.db.prepare('INSERT INTO movie_details(id,metadata) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata').run(id,JSON.stringify(value));}
  async inspectRoot(id:string,progress:(message:string)=>void=()=>{},probe:(file:string)=>Promise<ProbeResult>=inspectVideo){
    const root=this.root(id);if(root.status!=='online')return;
    const files=this.db.prepare('SELECT * FROM files WHERE root_id=? AND available=1').all(id) as unknown as {relative_path:string;size:number;mtime:number}[];let count=0;
    for(const file of files){const prior=this.db.prepare('SELECT * FROM file_probe WHERE root_id=? AND relative_path=?').get(id,file.relative_path) as {size:number;mtime:number;seconds:number|null}|undefined;
      if(prior?.seconds&&prior.size===file.size&&prior.mtime===file.mtime)continue;
      progress(`Reading runtimes ${++count}/${files.length} · ${file.relative_path}`);
      let result:ProbeResult;try{result=await probe(path.join(root.path,file.relative_path));}catch{result={seconds:null,error:'Duration inspection failed. Reinstall FFprobe or rescan.'};}
      this.db.prepare('INSERT INTO file_probe(root_id,relative_path,size,mtime,seconds,error) VALUES(?,?,?,?,?,?) ON CONFLICT(root_id,relative_path) DO UPDATE SET size=excluded.size,mtime=excluded.mtime,seconds=excluded.seconds,error=excluded.error').run(id,file.relative_path,file.size,file.mtime,result.seconds,result.error??null);
    }
  }
  watched(id:string,value:boolean){
    if(!this.db.prepare('SELECT id FROM content WHERE id=?').get(id))throw new Error('Unknown title');
    if(value){if(!this.snapshot().items.find(i=>i.id===id)?.watched)this.db.prepare('INSERT INTO watch_events(id,content_id,watched_at) VALUES(?,?,?)').run(randomUUID(),id,new Date().toISOString());}
    else this.db.prepare('UPDATE watch_events SET undone=1 WHERE content_id=? AND undone=0').run(id);
  }
  pick(kind:'all'|'movie'|'episode',random:()=>number=Math.random):Item|null {
    const items=this.snapshot().items.filter(i=>i.available&&!i.watched&&!i.review&&(kind==='all'||i.kind===kind));
    const choices:Item[]=[];const series=new Map<string,Item>();
    for(const i of items){if(i.kind==='movie')choices.push(i);else if(i.season===null||i.episode===null){choices.push(i);}else{const k=`${i.title.toLowerCase()}|${i.year??''}`;const prior=series.get(k);if(!prior||(i.season??0)<(prior.season??0)||i.season===prior.season&&(i.episode??0)<(prior.episode??0))series.set(k,i);}}
    choices.push(...series.values());return choices.length?choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]:null;
  }
  playablePath(id:string):string {
    const f=this.db.prepare("SELECT r.path,f.relative_path FROM files f JOIN roots r ON r.id=f.root_id WHERE f.content_id=? AND f.available=1 AND r.status='online' LIMIT 1").get(id) as {path:string;relative_path:string}|undefined;
    if(!f)throw new Error('No available copy. Reconnect the drive and rescan.');
    const full=path.resolve(f.path,f.relative_path);const relative=path.relative(f.path,full);
    if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('Invalid media path');return full;
  }
}
