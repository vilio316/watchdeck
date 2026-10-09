import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rename,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Catalogue } from '../core/catalogue';
test('nested scanning, deduplication, rename, missing files and persistent watch history',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'watchdeck-'));let db:Catalogue|undefined;
  try {
    const root=path.join(temp,'media');await mkdir(path.join(root,'nested'),{recursive:true});
    const first=path.join(root,'Arrival.2016.1080p.mkv');await writeFile(first,'video');await writeFile(path.join(root,'nested','Arrival.2016.720p.mp4'),'copy');await writeFile(path.join(root,'nested','notes.txt'),'ignore');
    const database=path.join(temp,'catalogue.sqlite');db=new Catalogue(database);const id=db.register(root);await db.scan(id);
    assert.equal(db.snapshot().items.length,1);assert.equal(db.snapshot().items[0].paths.length,2);
    const item=db.snapshot().items[0];db.watched(item.id,true);await db.scan(id);assert.equal(db.snapshot().items.length,1);assert.equal(db.pick('all'),null);
    await rename(first,path.join(root,'nested','Arrival.2016.2160p.mkv'));await db.scan(id);assert.equal(db.snapshot().items[0].watched,true);
    await rm(root,{recursive:true});await assert.rejects(db.scan(id));assert.equal(db.snapshot().items[0].watched,true);assert.equal(db.snapshot().items[0].available,false);
    const fileCount=db.db.prepare('SELECT COUNT(*) AS n FROM files').get()!.n;assert.equal(fileCount,3); // Failed scan did not erase records.
    db.close();db=new Catalogue(database);assert.equal(db.snapshot().items[0].watched,true);
    await mkdir(root);await db.scan(id);assert.equal(db.snapshot().items[0].available,false);db.watched(item.id,false);assert.equal(db.snapshot().items[0].watched,false);
  }finally{db?.close();await rm(temp,{recursive:true,force:true});}
});
test('TV picks use one choice per series, order episodes, exclude unresolved seasons',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'watchdeck-'));const db=new Catalogue(':memory:');
  try {await mkdir(path.join(temp,'Dororo'));for(const name of ['Show.S01E02.mkv','Show.S01E01.mkv','Other.2020.mkv'])await writeFile(path.join(temp,name),'video');await writeFile(path.join(temp,'Dororo','EP.2.720p.mp4'),'video');const id=db.register(temp);await db.scan(id);
    const first=db.pick('episode',()=>0)!;assert.equal(first.title,'Show');assert.equal(first.episode,1);db.watched(first.id,true);assert.equal(db.pick('episode',()=>0)?.episode,2);assert.equal(db.pick('all',()=>0)?.kind,'movie');assert.equal(db.pick('all',()=>.99)?.title,'Show');
  }finally{db.close();await rm(temp,{recursive:true,force:true});}
});
test('relink keeps history when the registered folder changes location',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'watchdeck-'));const db=new Catalogue(':memory:');try{const before=path.join(temp,'old');const after=path.join(temp,'new');await mkdir(before);await writeFile(path.join(before,'Us.2019.mkv'),'video');const rootId=db.register(before);await db.scan(rootId);const item=db.snapshot().items[0];db.watched(item.id,true);await rename(before,after);db.register(after,rootId);await db.scan(rootId);assert.equal(db.snapshot().items[0].watched,true);assert.equal(db.snapshot().items[0].available,true);assert.equal(db.roots().length,1);}finally{db.close();await rm(temp,{recursive:true,force:true});}
});
