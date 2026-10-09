import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {classify} from '../shared/classification';
import {inspectVideo,parseDuration} from '../core/runtime';
import {Catalogue} from '../core/catalogue';
test('strict 80 minute boundary, filename fallback and manual precedence',()=>{
  assert.deepEqual(classify('movie',4799.99),{kind:'episode',source:'duration'});
  assert.equal(classify('movie',4800).kind,'movie');assert.equal(classify('movie',4801).kind,'movie');
  for(const value of [null,0,-1,NaN])assert.equal(classify('movie',value).kind,'movie');
  assert.equal(classify('episode',5000).kind,'episode');assert.equal(classify('movie',60,'movie').kind,'movie');assert.equal(classify('movie',8000,'episode').kind,'episode');
  assert.equal(parseDuration('{"format":{"duration":"N/A"},"streams":[{"duration":"42.5"}]}'),42.5);
});
test('bundled FFprobe reads a real file with spaces and shell punctuation safely',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-runtime-'));try{
    const wav=Buffer.alloc(8044);wav.write('RIFF');wav.writeUInt32LE(8036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(8000,40);
    const file=path.join(folder,'movie & test ; sample.wav');await writeFile(file,wav);const result=await inspectVideo(file);assert.equal(result.error,undefined);assert.equal(result.seconds,.5);
    const missing=await inspectVideo(path.join(folder,'missing.mkv'));assert.equal(missing.seconds,null);assert.ok(missing.error);
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('classification and history survive scans and restarts; stale probes are invalidated',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-runtime-'));const file=path.join(folder,'Film.2020.mkv'),database=path.join(folder,'db.sqlite');let db=new Catalogue(database);
  try{await writeFile(file,'video');const root=db.register(folder);await db.scan(root);const original=db.snapshot().items[0];db.watched(original.id,true);let calls=0;
    await db.inspectRoot(root,()=>{},async()=>{calls++;return {seconds:4799};});assert.equal(db.snapshot().items[0].kind,'episode');assert.equal(db.snapshot().items[0].id,original.id);
    await db.inspectRoot(root,()=>{},async()=>{calls++;return {seconds:9999};});assert.equal(calls,1);
    db.setClassification(original.id,'movie');await db.scan(root);db.close();db=new Catalogue(database);let item=db.snapshot().items[0];assert.equal(item.kind,'movie');assert.equal(item.watched,true);assert.equal(item.classificationSource,'manual');
    db.setClassification(item.id,'auto');assert.equal(db.snapshot().items[0].kind,'episode');db.watched(item.id,false);assert.equal(db.pick('episode')?.id,item.id);
    await writeFile(file,'different length video');await db.scan(root);assert.equal(db.snapshot().items[0].runtimeSeconds,null);assert.equal(db.snapshot().items[0].kind,'movie');
    await db.inspectRoot(root,()=>{},async()=>({seconds:null,error:'invalid file'}));assert.equal(db.snapshot().items[0].kind,'movie');assert.equal(db.snapshot().items[0].fileDetails?.[0].error,'invalid file');
  }finally{db.close();await rm(folder,{recursive:true,force:true});}
});
test('multiple copies use the longest measured available runtime and report conflict',async()=>{
  const db=new Catalogue(':memory:');try{const root=db.register('/media');const parsed={title:'Film',year:2020,kind:'movie' as const,season:null,episode:null,episodeTitle:null,resolution:null,source:null,review:null};db.commitScan(root,[{relativePath:'Film.2020.mkv',size:1,mtime:1,parsed},{relativePath:'Film.2020.mp4',size:1,mtime:1,parsed}]);await db.inspectRoot(root,()=>{},async f=>({seconds:f.endsWith('mkv')?3000:6000}));const item=db.snapshot().items[0];assert.equal(item.kind,'movie');assert.equal(item.runtimeConflict,true);assert.equal(item.runtimeSeconds,6000);}finally{db.close();}
});
