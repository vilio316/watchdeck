import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {Snapshot} from '../shared/types';
test('real catalogue worker scans runtimes, preserves manual choices and history on restart',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-worker-'));let worker:Worker|undefined;let next=0;
 try{const media=path.join(folder,'media');await mkdir(media);const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(16036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);await writeFile(path.join(media,'Short.2020.mkv'),wav);
 const start=()=>new Worker(path.join(__dirname,'../electron/worker.js'),{workerData:{database:path.join(folder,'db.sqlite'),posters:path.join(folder,'posters'),token:''}});
 const call=(command:string,...args:any[])=>new Promise<any>((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>done(new Error('Worker timeout')),10000);function done(error?:Error,result?:any){clearTimeout(timer);worker!.off('message',listener);worker!.off('error',failed);error?reject(error):resolve(result);}const failed=(e:Error)=>done(e);const listener=(m:any)=>{if(m.id===id)done(m.error?new Error(m.error):undefined,m.result);};worker!.on('message',listener);worker!.once('error',failed);worker!.postMessage({id,command,args});});
 worker=start();const root=await call('register',media);await call('scan',root);let snapshot:Snapshot=await call('snapshot');const item=snapshot.items[0];assert.equal(item.kind,'episode');assert.equal(item.runtimeSeconds,1);
 await call('watched',item.id,true);await call('classify',item.id,'movie');assert.equal(await call('movie-details',item.id),undefined);await worker.terminate();worker=start();snapshot=await call('snapshot');assert.equal(snapshot.items[0].kind,'movie');assert.equal(snapshot.items[0].watched,true);assert.equal(snapshot.items[0].id,item.id);await call('inspect-runtimes');await call('classify',item.id,'auto');assert.equal((await call('snapshot')).items[0].kind,'episode');
 }finally{await worker?.terminate();await rm(folder,{recursive:true,force:true});}
});
