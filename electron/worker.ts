import { parentPort,workerData } from 'node:worker_threads';
import { loadMovieDetails } from '../core/enrichment';
import { Catalogue } from '../core/catalogue';
import { TMDBClient,artworkKey } from '../core/posters';
import type { Item } from '../shared/types';
import { access } from 'node:fs/promises';
import path from 'node:path';
const catalogue=new Catalogue(workerData.database);
let token:string=workerData.token??'';let cancelled=false;
const client=()=>{if(!token)throw new Error('Add your TMDB API Read Access Token in Poster settings.');return new TMDBClient(token,workerData.posters);};
function item(id:string):Item{const value=catalogue.snapshot().items.find(i=>i.id===id);if(!value)throw new Error('Unknown title');return value;}
async function enrich(){
  const provider=client();cancelled=false;
  const items=catalogue.snapshot().items;
  const unique=[...new Map(items.map(i=>[artworkKey(i),i])).entries()];let count=0;
  for(const [key,value] of unique){
    if(cancelled)break;
    const old=catalogue.artwork(key);
    if(old?.status==='matched'){await loadMovieDetails(catalogue,value,provider);if(!old.posterFile)continue;try{await access(path.join(workerData.posters,old.posterFile));continue;}catch{}}
    if(old?.status==='review'||old?.status==='not_found')continue;
    parentPort!.postMessage({progress:`Fetching posters ${++count} · ${value.title}`});
    try{const art=old?.selected?await provider.accept(old.selected,old.candidates):await provider.resolve(value.kind==='movie'?'movie':'tv',value.title,value.year);catalogue.saveArtwork(key,art);await loadMovieDetails(catalogue,{...value,artwork:art},provider);parentPort!.postMessage({artwork:art,ids:items.filter(i=>artworkKey(i)===key).map(i=>i.id)});}
    catch(error){const message=error instanceof Error?error.message:String(error);catalogue.saveArtwork(key,{...old,status:'error',candidates:old?.candidates??[],message,checkedAt:new Date().toISOString()});if(/token|unreachable|429/.test(message))throw error;}
  }
}
let queue=Promise.resolve();
parentPort!.on('message',(message:{id:number;command:string;args:any[]})=>{
  if(message.command==='cancel-posters'){cancelled=true;parentPort!.postMessage({id:message.id});return;}
  queue=queue.then(async()=>{
    try {
      let result:unknown;
      switch(message.command){
        case 'snapshot':result=catalogue.snapshot();break;
        case 'register':result=catalogue.register(message.args[0],message.args[1]);break;
        case 'scan':await catalogue.scan(message.args[0],count=>parentPort!.postMessage({progress:`Found ${count} videos…`}));await catalogue.inspectRoot(message.args[0],progress=>parentPort!.postMessage({progress}));if(token)await enrich();break;
        case 'inspect-runtimes':{const errors:string[]=[];for(const root of catalogue.roots()){try{await catalogue.scan(root.id);await catalogue.inspectRoot(root.id,progress=>parentPort!.postMessage({progress}));}catch(error){errors.push(`${root.path}: ${String(error)}`);}}if(errors.length)throw new Error('Some folders could not be inspected. Completed runtime measurements were kept. '+errors.join('; '));break;}
        case 'classify':catalogue.setClassification(message.args[0],message.args[1]);break;
        case 'movie-details':result=await loadMovieDetails(catalogue,item(message.args[0]),token?client():undefined,message.args[1]);break;
        case 'token':token=message.args[0];break;
        case 'sync-posters':await enrich();break;
        case 'search-poster':{const value=item(message.args[0]);const art=await client().resolve(value.kind==='movie'?'movie':'tv',message.args[1],message.args[2]);catalogue.saveArtwork(artworkKey(value),art);await loadMovieDetails(catalogue,{...value,artwork:art},client());result=art;break;}
        case 'select-poster':{const value=item(message.args[0]);const old=catalogue.artwork(artworkKey(value));const candidate=old?.candidates.find(c=>c.id===message.args[1]);if(!candidate)throw new Error('Search again before choosing this match.');const art=await client().accept(candidate,old!.candidates);catalogue.saveArtwork(artworkKey(value),art);await loadMovieDetails(catalogue,{...value,artwork:art},client());break;}
        case 'watched':catalogue.watched(message.args[0],message.args[1]);break;
        case 'pick':result=catalogue.pick(message.args[0]);break;
        case 'path':result=catalogue.playablePath(message.args[0]);break;
        default:throw new Error('Unknown operation');
      }
      parentPort!.postMessage({id:message.id,result});
    }catch(error){parentPort!.postMessage({id:message.id,error:error instanceof Error?error.message:String(error)});}
  });
});
