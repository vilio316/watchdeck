import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Catalogue } from '../core/catalogue';
import { parseMedia } from '../core/parser';
import { artworkKey } from '../core/posters';
const file=String.raw`E:\@CC_Links.The.Terminator.1984.720p.UHD.BluRay.x264.Pahe.mkv`;
const relative='@CC_Links.The.Terminator.1984.720p.UHD.BluRay.x264.Pahe.mkv';
test('correcting an already indexed prefix preserves history across rescans and new copies',()=>{
  const db=new Catalogue(':memory:');try{
    const root=db.register('E:\\');const legacy=parseMedia(file,{stripPrefixes:false});
    db.commitScan(root,[{relativePath:relative,size:1,mtime:1,parsed:legacy}]);const old=db.snapshot().items[0];db.watched(old.id,true);
    db.saveArtwork(artworkKey(legacy),{status:'not_found',candidates:[],checkedAt:'now'});
    const corrected=parseMedia(file);const files=[{relativePath:relative,size:1,mtime:1,parsed:corrected}];
    db.commitScan(root,files);assert.equal(db.snapshot().items[0].id,old.id);assert.equal(db.snapshot().items[0].title,'The Terminator');assert.equal(db.snapshot().items[0].watched,true);assert.equal(db.snapshot().items[0].artwork,undefined);
    db.commitScan(root,files);assert.equal(db.snapshot().items.length,1);assert.equal(db.snapshot().items[0].watched,true);
    db.commitScan(root,[...files,{relativePath:'The.Terminator.1984.1080p.mkv',size:1,mtime:1,parsed:corrected}]);assert.equal(db.snapshot().items.length,1);assert.equal(db.snapshot().items[0].paths.length,2);assert.equal(db.snapshot().items[0].watched,true);
  }finally{db.close();}
});
test('prefix correction merges an existing clean copy without losing either watch history',()=>{
  const db=new Catalogue(':memory:');try{
    const root=db.register('E:\\');const legacy=parseMedia(file,{stripPrefixes:false}),corrected=parseMedia(file);
    const legacyFile={relativePath:relative,size:1,mtime:1,parsed:legacy};const clean={relativePath:'The.Terminator.1984.1080p.mkv',size:1,mtime:1,parsed:corrected};
    db.commitScan(root,[legacyFile,clean]);for(const i of db.snapshot().items)db.watched(i.id,true);
    db.commitScan(root,[{...legacyFile,parsed:corrected},clean]);assert.equal(db.snapshot().items.length,1);assert.equal(db.snapshot().items[0].watched,true);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM watch_events WHERE undone=0').get()!.n,2);
  }finally{db.close();}
});
