import { execFile } from 'node:child_process';
import path from 'node:path';
export interface ProbeResult {seconds:number|null;error?:string;}
export function parseDuration(output:string):number|null{
  const data=JSON.parse(output);const values=[data.format?.duration,...(Array.isArray(data.streams)?data.streams.map((s:any)=>s.duration):[])].map(Number).filter(n=>Number.isFinite(n)&&n>0);
  return values.length?Math.max(...values):null;
}
export function ffprobePath():string{
  const packaged=require('ffprobe-static') as {path:string};
  if(!packaged.path)throw new Error('FFprobe is unavailable on this platform.');
  return packaged.path.replace(`app.asar${path.sep}`,`app.asar.unpacked${path.sep}`);
}
export async function inspectVideo(file:string,binary=ffprobePath()):Promise<ProbeResult>{
  return new Promise(resolve=>{execFile(binary,['-v','error','-protocol_whitelist','file,crypto','-show_entries','format=duration:stream=duration','-of','json',path.resolve(file)],{timeout:20000,maxBuffer:1024*1024,windowsHide:true,shell:false},(error,stdout)=>{
    if(error){resolve({seconds:null,error:(error as NodeJS.ErrnoException).code==='ENOENT'?'FFprobe executable is missing. Reinstall the app/dependencies.':'Could not read duration (unsupported, incomplete, unavailable or timed-out file).'});return;}
    try{const seconds=parseDuration(stdout);resolve(seconds===null?{seconds:null,error:'No valid duration was reported.'}:{seconds});}catch{resolve({seconds:null,error:'FFprobe returned invalid metadata.'});}
  });});
}
