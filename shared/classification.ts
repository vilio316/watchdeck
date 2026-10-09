import type { ParsedMedia } from './types';
export function classify(parsedKind:ParsedMedia['kind'],seconds:number|null,override:ParsedMedia['kind']|null=null):{kind:ParsedMedia['kind'];source:'manual'|'duration'|'filename'}{
  if(override)return {kind:override,source:'manual'};
  if(seconds!==null&&Number.isFinite(seconds)&&seconds>0&&seconds<80*60)return {kind:'episode',source:'duration'};
  return {kind:parsedKind,source:'filename'};
}
export function runtimeLabel(seconds:number|null|undefined){if(!seconds||!Number.isFinite(seconds))return 'Runtime unknown';const total=Math.round(seconds/60);return total>=60?`${Math.floor(total/60)}h ${total%60}m`:`${total}m`;}
