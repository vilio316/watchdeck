import { readFile,writeFile,rename } from 'node:fs/promises';
import type { Appearance } from '../shared/appearance';
import { DEFAULT_APPEARANCE,validateAppearance } from '../shared/appearance';
export async function readAppearance(file:string):Promise<Appearance>{try{return validateAppearance(JSON.parse(await readFile(file,'utf8')));}catch{return {...DEFAULT_APPEARANCE};}}
export async function writeAppearance(file:string,value:unknown):Promise<Appearance>{const settings=validateAppearance(value);await writeFile(file+'.tmp',JSON.stringify(settings,null,2),'utf8');await rename(file+'.tmp',file);return settings;}
