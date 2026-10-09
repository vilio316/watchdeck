export interface Appearance {theme:'dark'|'light'|'system';background:string|null;font:'system'|'verdana'|'georgia';}
export const DEFAULT_APPEARANCE:Appearance={theme:'dark',background:null,font:'system'};
export const FONT_OPTIONS={system:'Segoe UI, system-ui, sans-serif',verdana:'Verdana, Geneva, sans-serif',georgia:'Georgia, Cambria, serif'};
export function validateAppearance(value:unknown):Appearance{
  if(!value||typeof value!=='object')throw new Error('Invalid appearance settings');
  const p=value as Appearance;
  if(!['dark','light','system'].includes(p.theme)||!['system','verdana','georgia'].includes(p.font)||p.background!==null&&(typeof p.background!=='string'||!/^#[0-9a-f]{6}$/i.test(p.background)))throw new Error('Invalid theme, font or background colour');
  return {theme:p.theme,font:p.font,background:p.background?.toLowerCase()??null};
}
function rgb(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function luminance(hex:string):number{return rgb(hex).map(c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
export function contrast(a:string,b:string):number{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function mix(a:string,b:string,fraction:number){const second=rgb(b);return '#'+rgb(a).map((c,i)=>Math.round(c*(1-fraction)+second[i]*fraction).toString(16).padStart(2,'0')).join('');}
const textFor=(bg:string)=>contrast(bg,'#ffffff')>contrast(bg,'#000000')?'#ffffff':'#000000';
function readable(bg:string,preferred:string,minimum=4.5){return contrast(bg,preferred)>=minimum?preferred:textFor(bg);}
export function appearancePalette(preferences:Appearance,systemDark:boolean):Record<string,string>{
  const background=preferences.background??(preferences.theme==='dark'||preferences.theme==='system'&&systemDark?'#101614':'#f5f7f2');
  const text=textFor(background),dark=text==='#ffffff',end=dark?'#000000':'#ffffff';
  const surface=mix(background,end,.18),sidebar=mix(background,end,.1),hero=mix(background,dark?'#284735':'#dbe8ce',.4);
  const muted=readable(background,mix(background,text,.7));
  const warning=readable(background,dark?'#e6d096':'#72500b'),error=readable(background,dark?'#f0c5b1':'#8d351c');
  return {'--background':background,'--text':text,'--muted':muted,'--surface':surface,'--sidebar':sidebar,'--surface-raised':mix(background,end,.25),'--input':surface,'--control':mix(background,end,.3),'--border':readable(background,mix(background,text,.48),3),'--hero':hero,'--hero-text':textFor(hero),'--hero-muted':readable(hero,mix(hero,textFor(hero),.75)),'--brand':readable(background,dark?'#d2f3ac':'#365c2e'),'--warning-text':warning,'--error-text':error,'--accent':'#d2f3ac','--accent-text':'#213022','--font':FONT_OPTIONS[preferences.font]};
}
