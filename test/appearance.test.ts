import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appearancePalette,contrast,DEFAULT_APPEARANCE,validateAppearance } from '../shared/appearance';
import { readAppearance,writeAppearance } from '../core/preferences';
test('system theme tracks Windows preference and explicit themes stay fixed',()=>{
  const system={...DEFAULT_APPEARANCE,theme:'system' as const};assert.notEqual(appearancePalette(system,true)['--background'],appearancePalette(system,false)['--background']);
  assert.deepEqual(appearancePalette(DEFAULT_APPEARANCE,true),appearancePalette(DEFAULT_APPEARANCE,false));
});
test('custom colours maintain normal-text and control contrast across surfaces',()=>{
  // Saturated colours and greys around the black/white contrast crossover.
  const colours=['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#777777','#747474','#808080','#101827','#faf7ef'];
  for(const background of colours){const palette=appearancePalette({...DEFAULT_APPEARANCE,background},true);
    for(const surface of ['--background','--surface','--surface-raised','--sidebar','--input','--control'])for(const text of ['--text','--muted','--warning-text','--error-text'])assert.ok(contrast(palette[surface],palette[text])>=4.5,`${text} on ${surface}: ${background}`);
    assert.ok(contrast(palette['--hero'],palette['--hero-text'])>=4.5);assert.ok(contrast(palette['--hero'],palette['--hero-muted'])>=4.5);
    assert.ok(contrast(palette['--background'],palette['--border'])>=3);assert.ok(contrast(palette['--accent'],palette['--accent-text'])>=4.5);
  }
});
test('preferences persist across reloads, missing/broken files recover to defaults',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'watchdeck-appearance-'));const file=path.join(folder,'appearance.json');try{assert.deepEqual(await readAppearance(file),DEFAULT_APPEARANCE);const settings={theme:'light' as const,background:'#Faf7Ef',font:'georgia' as const};await writeAppearance(file,settings);assert.deepEqual(await readAppearance(file),{...settings,background:'#faf7ef'});await writeFile(file,'not json');assert.deepEqual(await readAppearance(file),DEFAULT_APPEARANCE);}finally{await rm(folder,{recursive:true,force:true});}
});
test('invalid CSS colours and unsupported font/theme values are rejected',()=>{
  assert.throws(()=>validateAppearance({...DEFAULT_APPEARANCE,background:'url(https://example.com)'}));assert.throws(()=>validateAppearance({...DEFAULT_APPEARANCE,font:'external-font'}));assert.throws(()=>validateAppearance({...DEFAULT_APPEARANCE,theme:'invalid'}));assert.throws(()=>validateAppearance(null));
});
