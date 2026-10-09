import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { artworkKey,chooseAutomatic,TMDBClient } from '../core/posters';
import { parseMedia } from '../core/parser';
import { Catalogue } from '../core/catalogue';
import { DatabaseSync } from 'node:sqlite';
const candidate={id:1,title:'Us',originalTitle:'Us',year:2019,posterPath:'/poster.jpg'};
test('exact title/year, ambiguous remakes, typos and mismatched years',()=>{
  assert.equal(chooseAutomatic('Us',2019,[candidate])?.id,1);
  assert.equal(chooseAutomatic('Us',2020,[candidate]),undefined);
  assert.equal(chooseAutomatic('Bakcrooms',2026,[{...candidate,title:'Backrooms',year:2026}]),undefined);
  assert.equal(chooseAutomatic('Us',null,[candidate,{...candidate,id:2,year:1995}]),undefined);
});
test('all episodes share a TV cache key, movie and TV identities stay separate',()=>{
  const a=parseMedia(String.raw`E:\One Day\One.Day.2024.S01E01.mkv`),b=parseMedia(String.raw`E:\One Day\One.Day.2024.S01E02.mkv`);
  assert.equal(artworkKey(a),artworkKey(b));assert.notEqual(artworkKey(a),artworkKey({...a,kind:'movie'}));
});
test('search uses movie year, caches images offline and omits token on CDN request',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-posters-'));const calls:{url:string;options:any}[]=[];
  const fetcher=(async(url:any,options:any)=>{calls.push({url:String(url),options});return String(url).includes('/search/')?Response.json({total_pages:1,results:[{id:1,title:'Us',original_title:'Us',release_date:'2019-03-01',poster_path:'/poster.jpg'}]}):new Response(Buffer.from([255,216,255,217,0,0,0,0]),{headers:{'content-type':'image/jpeg'}});}) as typeof fetch;
  try{const client=new TMDBClient('secret',folder,fetcher);const art=await client.resolve('movie','Us',2019);assert.equal(art.status,'matched');assert.equal(new URL(calls[0].url).searchParams.get('primary_release_year'),'2019');assert.equal(calls[0].options.headers.Authorization,'Bearer secret');assert.equal(calls[1].options.headers.Authorization,undefined);assert.equal((await readFile(path.join(folder,art.posterFile!))).length,8);const offline=new TMDBClient('secret',folder,(async()=>{throw new Error('offline');}) as typeof fetch);assert.equal(await offline.download(candidate),art.posterFile);assert.equal(calls.length,2);}finally{await rm(folder,{recursive:true,force:true});}
});
test('TV year uses first_air_date_year and yearless fallback requires confirmation',async()=>{
  const urls:string[]=[];const client=new TMDBClient('secret','unused',(async(url:any)=>{urls.push(String(url));return Response.json({total_pages:1,results:urls.length===1?[]:[{id:1,name:'Show',first_air_date:'2020-01-01',poster_path:null}]});}) as typeof fetch);
  const art=await client.resolve('tv','Show',2024);assert.equal(new URL(urls[0]).searchParams.get('first_air_date_year'),'2024');assert.equal(new URL(urls[1]).searchParams.has('first_air_date_year'),false);assert.equal(art.status,'review');
});
test('no results, no poster and offline/auth failures are explicit',async()=>{
  const none=new TMDBClient('secret','unused',(async()=>Response.json({results:[]})) as typeof fetch);assert.equal((await none.resolve('movie','Unknown',null)).status,'not_found');
  const noPoster=new TMDBClient('secret','unused',(async()=>Response.json({results:[{id:1,title:'Us',release_date:'2019-01-01',poster_path:null}]})) as typeof fetch);const art=await noPoster.resolve('movie','Us',2019);assert.equal(art.status,'matched');assert.equal(art.posterFile,undefined);
  const offline=new TMDBClient('secret','unused',(async()=>{throw new Error('secret should never be exposed');}) as typeof fetch);await assert.rejects(offline.resolve('movie','Us',2019),/unreachable/);
  const auth=new TMDBClient('secret','unused',(async()=>new Response('',{status:401})) as typeof fetch);await assert.rejects(auth.resolve('movie','Us',2019),/rejected the token/);
});
test('v1 migration preserves watch history, artwork survives rescans and restart',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-migrate-'));const file=path.join(folder,'catalogue.sqlite');let db:Catalogue|undefined;
  try{const old=new DatabaseSync(file);old.exec('CREATE TABLE schema_version(version INTEGER NOT NULL); INSERT INTO schema_version VALUES(1)');old.close();db=new Catalogue(file);const root=db.register(folder);const parsed=parseMedia(String.raw`E:\Us.2019.mkv`);db.commitScan(root,[{relativePath:'Us.2019.mkv',size:8,mtime:1,parsed}]);const item=db.snapshot().items[0];db.watched(item.id,true);db.close();const legacy=new DatabaseSync(file);legacy.exec('DROP TABLE artwork; UPDATE schema_version SET version=1');legacy.close();db=new Catalogue(file);assert.equal(db.snapshot().items[0].watched,true);assert.equal(db.snapshot().items[0].id,item.id);db.saveArtwork(artworkKey(item),{status:'matched',selected:candidate,candidates:[candidate],checkedAt:new Date().toISOString()});db.close();db=new Catalogue(file);db.commitScan(root,[{relativePath:'Us.2019.mkv',size:8,mtime:1,parsed}]);assert.equal(db.snapshot().items[0].watched,true);assert.equal(db.snapshot().items[0].artwork?.selected?.id,1);assert.equal(db.db.prepare('SELECT version FROM schema_version').get()!.version,4);}finally{db?.close();await rm(folder,{recursive:true,force:true});}
});
test('invalid image data and unsafe paths cannot enter the cache',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-invalid-'));try{const client=new TMDBClient('secret',folder,(async()=>new Response('<html>invalid</html>',{headers:{'content-type':'image/jpeg'}})) as typeof fetch);await assert.rejects(client.download(candidate),/Invalid poster image data/);await assert.rejects(client.download({...candidate,posterPath:'/../../evil.jpg'}),/Invalid poster path/);}finally{await rm(folder,{recursive:true,force:true});}
});
