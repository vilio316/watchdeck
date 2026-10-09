import { createHash } from 'node:crypto';
import { mkdir,writeFile,rename,access } from 'node:fs/promises';
import path from 'node:path';
import type { Artwork,ParsedMedia,PosterCandidate,MovieDetails } from '../shared/types';
export const normalizeTitle=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function artworkKey(p:ParsedMedia):string {return [p.kind==='movie'?'movie':'tv',normalizeTitle(p.title),p.year??''].join('|');}
export function chooseAutomatic(title:string,year:number|null,candidates:PosterCandidate[]):PosterCandidate|undefined {
  const exact=candidates.filter(c=>(normalizeTitle(c.title)===normalizeTitle(title)||normalizeTitle(c.originalTitle)===normalizeTitle(title))&&(year===null||year===c.year));
  return exact.length===1?exact[0]:undefined;
}
export class TMDBClient {
  constructor(private token:string,private folder:string,private request:typeof fetch=fetch){}
  private async get(url:string,poster=false):Promise<Response>{
    for(let attempt=0;attempt<3;attempt++){
      let response:Response;
      try{response=await this.request(url,{headers:poster?{}:{Authorization:`Bearer ${this.token}`,Accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new Error('TMDB is unreachable. Check your connection and retry.');}
      if(response.status===401||response.status===403)throw new Error('TMDB rejected the token. Check your API Read Access Token in Poster settings.');
      if((response.status===429||response.status>=500)&&attempt<2){const delay=Math.min(5000,Math.max(500,Number(response.headers.get('retry-after')??1)*1000));await response.body?.cancel();await new Promise(r=>setTimeout(r,delay));continue;}
      if(!response.ok)throw new Error(`TMDB request failed (${response.status}). Retry later.`);
      return response;
    }
    throw new Error('TMDB request failed.');
  }
  async movieDetails(id:number):Promise<MovieDetails>{
    if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid movie match');
    const raw=await (await this.get(`https://api.themoviedb.org/3/movie/${id}?append_to_response=credits&language=en-US`)).json() as any;
    if(raw.id!==id)throw new Error('TMDB returned an unexpected movie.');
    const crew=Array.isArray(raw.credits?.crew)?raw.credits.crew:[];
    const names=(jobs:string[])=>[...new Set<string>(crew.filter((c:any)=>jobs.includes(c.job)&&typeof c.name==='string').map((c:any)=>c.name))].slice(0,8);
    const overview=typeof raw.overview==='string'?raw.overview.trim():'';
    const sentences=overview.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
    const summary=(sentences?.slice(0,2).join('').trim()||overview).slice(0,600);
    return {summary:summary.length<overview.length?summary+'…':summary,
      genres:Array.isArray(raw.genres)?raw.genres.filter((g:any)=>typeof g.name==='string').map((g:any)=>g.name):[],
      directors:names(['Director']),writers:names(['Writer','Screenplay','Story']),
      cast:(Array.isArray(raw.credits?.cast)?raw.credits.cast:[]).filter((c:any)=>typeof c.name==='string').slice(0,8).map((c:any)=>({name:c.name,character:typeof c.character==='string'?c.character:''})),
      releaseDate:typeof raw.release_date==='string'?raw.release_date:'',language:typeof raw.original_language==='string'?raw.original_language:'',
      rating:Number.isFinite(raw.vote_average)&&raw.vote_count>0?raw.vote_average:null,ratingCount:Number.isFinite(raw.vote_count)?raw.vote_count:0,
      listedRuntimeMinutes:Number.isFinite(raw.runtime)&&raw.runtime>0?raw.runtime:null};
  }
  async search(kind:'movie'|'tv',title:string,year:number|null):Promise<{candidates:PosterCandidate[];allowAuto:boolean}>{
    const query=new URLSearchParams({query:title,language:'en-US',include_adult:'false'});
    if(year!==null)query.set(kind==='movie'?'primary_release_year':'first_air_date_year',String(year));
    let result=await (await this.get(`https://api.themoviedb.org/3/search/${kind}?${query}`)).json() as any;
    // A year mismatch is offered for review, never silently accepted.
    if(year!==null&&Array.isArray(result.results)&&result.results.length===0){query.delete(kind==='movie'?'primary_release_year':'first_air_date_year');result=await (await this.get(`https://api.themoviedb.org/3/search/${kind}?${query}`)).json() as any;}
    if(!Array.isArray(result.results))throw new Error('TMDB returned an unexpected response.');
    const candidates:PosterCandidate[]=result.results.filter((r:any)=>Number.isSafeInteger(r.id)&&typeof (r.title??r.name)==='string').slice(0,20).map((r:any)=>{
      const date=kind==='movie'?r.release_date:r.first_air_date;const y=typeof date==='string'&&/^\d{4}-/.test(date)?Number(date.slice(0,4)):null;
      return {id:r.id,title:r.title??r.name,originalTitle:r.original_title??r.original_name??r.title??r.name,year:y,posterPath:typeof r.poster_path==='string'&&/^\/[a-zA-Z0-9_-]+\.(jpg|png)$/.test(r.poster_path)?r.poster_path:null};
    });
    candidates.sort((a,b)=>Number(!!chooseAutomatic(title,year,[b]))-Number(!!chooseAutomatic(title,year,[a])));
    return {candidates,allowAuto:Number(result.total_pages??1)<=1};
  }
  async download(candidate:PosterCandidate):Promise<string|undefined>{
    if(!candidate.posterPath)return undefined;
    if(!/^\/[a-zA-Z0-9_-]+\.(jpg|png)$/.test(candidate.posterPath))throw new Error('Invalid poster path');
    const file=createHash('sha256').update(candidate.posterPath).digest('hex')+path.extname(candidate.posterPath);
    await mkdir(this.folder,{recursive:true});const target=path.join(this.folder,file);
    try{await access(target);return file;}catch{}
    const response=await this.get(`https://image.tmdb.org/t/p/w500${candidate.posterPath}`,true);
    if(!['image/jpeg','image/png'].includes((response.headers.get('content-type')??'').split(';')[0]))throw new Error('TMDB returned an invalid poster image.');
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty poster response');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw new Error('Poster image exceeded the cache size limit.');}chunks.push(value);}
    const image=Buffer.concat(chunks);if(image.length<8)throw new Error('Empty poster image');
    const jpg=image[0]===0xff&&image[1]===0xd8;const png=image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if(!jpg&&!png)throw new Error('Invalid poster image data');
    await writeFile(target+'.tmp',image);await rename(target+'.tmp',target);return file;
  }
  async resolve(kind:'movie'|'tv',title:string,year:number|null):Promise<Artwork>{
    const {candidates,allowAuto}=await this.search(kind,title,year);const selected=allowAuto?chooseAutomatic(title,year,candidates):undefined;
    const checkedAt=new Date().toISOString();
    if(!selected)return {status:candidates.length?'review':'not_found',candidates,checkedAt,message:candidates.length?'Confirm the correct title and year.':'No match found. Try correcting the search title.'};
    return this.accept(selected,candidates);
  }
  async accept(selected:PosterCandidate,candidates:PosterCandidate[]):Promise<Artwork>{
    return {status:'matched',selected,candidates,posterFile:await this.download(selected),checkedAt:new Date().toISOString(),message:selected.posterPath?undefined:'This TMDB entry has no poster.'};
  }
}
