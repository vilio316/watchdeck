import { app,BrowserWindow,dialog,ipcMain,shell,safeStorage,protocol,net,nativeTheme } from 'electron';
import path from 'node:path';
import { access,readFile,writeFile,rename,rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Item,Snapshot } from '../shared/types';
import { readAppearance,writeAppearance } from '../core/preferences';
import { appearancePalette } from '../shared/appearance';
import { Worker } from 'node:worker_threads';
let quitting=false;let window:BrowserWindow;let worker:Worker;let nextId=0;let failure:Error|null=null;
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
protocol.registerSchemesAsPrivileged([{scheme:'watchdeck-poster',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const posterURL=(item:Item):Item=>({...item,posterUrl:item.artwork?.posterFile?`watchdeck-poster://cache/${item.artwork.posterFile}`:undefined});
function call(command:string,...args:unknown[]):Promise<any>{
  if(failure)return Promise.reject(failure);
  return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({id,command,args});});
}
function stringId(value:unknown):string{if(typeof value!=='string'||!value||value.length>128)throw new Error('Invalid record ID');return value;}
const single=app.requestSingleInstanceLock();if(!single)app.quit();
else {
app.on('second-instance',()=>{window?.show();window?.focus();});
app.whenReady().then(async()=>{
  const appearanceFile=path.join(app.getPath('userData'),'appearance.json');
  let appearance=await readAppearance(appearanceFile);
  let preferenceWrites=Promise.resolve();
  const tokenFile=path.join(app.getPath('userData'),'tmdb-token.enc');
  const posters=path.join(app.getPath('userData'),'posters');
  let token='';
  try{token=safeStorage.decryptString(await readFile(tokenFile));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')console.warn('Stored TMDB token could not be read. Re-enter it in Poster settings.');}
  protocol.handle('watchdeck-poster',async request=>{const url=new URL(request.url);const file=url.pathname.slice(1);if(url.hostname!=='cache'||!/^\w{64}\.(jpg|png)$/.test(file))return new Response('Invalid poster',{status:400});try{await access(path.join(posters,file));return net.fetch(pathToFileURL(path.join(posters,file)).href);}catch{return new Response('Poster not cached',{status:404});}});
  worker=new Worker(path.join(__dirname,'worker.js'),{workerData:{database:path.join(app.getPath('userData'),'catalogue.sqlite'),posters,token}});
  const fail=(error:Error)=>{if(failure)return;console.error('Catalogue worker startup failure:',error);failure=error;for(const promise of pending.values())promise.reject(error);pending.clear();window?.webContents.send('media:progress',error.message);};
  worker.on('error',fail);worker.on('exit',code=>{if(!quitting)fail(new Error(`Catalogue worker exited (${code})`));});
  worker.on('message',message=>{
    if(message.artwork){window?.webContents.send('media:artwork',{ids:message.ids,artwork:message.artwork,posterUrl:message.artwork.posterFile?`watchdeck-poster://cache/${message.artwork.posterFile}`:undefined});return;}
    if(message.progress){window?.webContents.send('media:progress',message.progress);return;}
    const promise=pending.get(message.id);if(!promise)return;pending.delete(message.id);
    if(message.error)promise.reject(new Error(message.error));else promise.resolve(message.result);
  });
  window=new BrowserWindow({width:1260,height:850,minWidth:850,minHeight:620,backgroundColor:appearancePalette(appearance,nativeTheme.shouldUseDarkColors)['--background'],title:'Watchdeck',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  function handle(name:string,action:(...args:any[])=>unknown){ipcMain.handle(name,(event,...args)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Untrusted request');return action(...args);});}
  handle('media:appearance',()=>appearance);
  handle('media:save-appearance',(value)=>{const result=preferenceWrites.then(async()=>{appearance=await writeAppearance(appearanceFile,value);return appearance;});preferenceWrites=result.then(()=>undefined,()=>undefined);return result;});
  handle('media:snapshot',async()=>{const snapshot:Snapshot=await call('snapshot');return {...snapshot,items:snapshot.items.map(posterURL)};});
  handle('media:poster-settings',()=>({configured:!!token}));
  handle('media:poster-token',async(value)=>{
    if(typeof value!=='string'||value.length>4096)throw new Error('Invalid token');value=value.trim();
    if(value){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows credential encryption is unavailable.');await writeFile(tokenFile+'.tmp',safeStorage.encryptString(value));await rename(tokenFile+'.tmp',tokenFile);}else await rm(tokenFile,{force:true});
    token=value;await call('token',token);
  });
  handle('media:sync-posters',()=>call('sync-posters'));
  handle('media:cancel-posters',()=>call('cancel-posters'));
  handle('media:search-poster',(id,title,year)=>{if(typeof title!=='string'||!title.trim()||title.length>200||year!==null&&(!Number.isInteger(year)||year<1800||year>2200))throw new Error('Enter a title and valid year, or leave the year blank.');return call('search-poster',stringId(id),title.trim(),year);});
  handle('media:select-poster',(id,tmdbId)=>{if(!Number.isSafeInteger(tmdbId)||tmdbId<1)throw new Error('Invalid TMDB match');return call('select-poster',stringId(id),tmdbId);});
  handle('media:add-root',async(relinkId?:unknown)=>{
    const id=relinkId===undefined?undefined:stringId(relinkId);
    const chosen=await dialog.showOpenDialog(window,{title:id?'Relink the same library folder':'Choose your media folder',properties:['openDirectory']});
    if(chosen.canceled||!chosen.filePaths[0])return false;
    const rootId=await call('register',chosen.filePaths[0],id);await call('scan',rootId);return true;
  });
  handle('media:inspect-runtimes',()=>call('inspect-runtimes'));
  handle('media:classify',(id,value)=>{if(!['auto','movie','episode'].includes(value))throw new Error('Invalid classification');return call('classify',stringId(id),value);});
  handle('media:movie-details',(id,refresh=false)=>{if(typeof refresh!=='boolean')throw new Error('Invalid refresh option');return call('movie-details',stringId(id),refresh);});
  handle('media:scan',(id)=>call('scan',stringId(id)));
  handle('media:watched',(id,value)=>{if(typeof value!=='boolean')throw new Error('Invalid watched value');return call('watched',stringId(id),value);});
  handle('media:pick',async(kind)=>{if(!['all','movie','episode'].includes(kind))throw new Error('Invalid selection');const item=await call('pick',kind);return item?posterURL(item):null;});
  handle('media:open',async(id)=>{const file=await call('path',stringId(id));await access(file);const error=await shell.openPath(file);if(error)throw new Error(error);});
  await window.loadFile(path.join(__dirname,'../../dist/index.html'));
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{quitting=true;void worker?.terminate();});
}
