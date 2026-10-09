import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMedia } from '../core/parser';
const cases:[string,string,number|null,number|null,number|null][]=[
  [String.raw`E:\@CC_Links.The.Terminator.1984.720p.UHD.BluRay.x264.Pahe.mkv`,'The Terminator',1984,null,null],
  [String.raw`E:\[MFA].Alien.1979.DC.UHD.720p.BluRay.x264-Pahe.mkv`,'Alien',1979,null,null],
  [String.raw`E:\After.The.Hunt.2025.1080p.WEB-DL.x265.6CH-Pahe.in.mkv`,'After The Hunt',2025,null,null],
  [String.raw`E:\Bakcrooms.2026.720p.WEB-DL.x264.950MB-Pahe.in.mkv`,'Bakcrooms',2026,null,null],
  [String.raw`E:\Us (2019) [WEBRip] [720p] [YTS.AM]\Us.2019.720p.WEBRip.x264-[YTS.AM].mp4`,'Us',2019,null,null],
  [String.raw`E:\One Day 2024 Season 1 Complete 720p NF WEB-DL x264 [i_c]\One Day (2024) - S01E01 - Episode 1.mkv`,'One Day',2024,1,1],
  [String.raw`E:\Lanterns\Lanterns.S01E02.Trust.Fall.720p.WEB-DL.x265.10Bit-Pahe.in.mkv`,'Lanterns',null,1,2],
  [String.raw`E:\Dororo\EP.2.v0.1639395379.720p.mp4`,'Dororo',null,null,2]
];
for(const [file,title,year,season,episode] of cases)test(`user fixture: ${title}`,()=>{const parsed=parseMedia(file);assert.equal(parsed.title,title);assert.equal(parsed.year,year);assert.equal(parsed.season,season);assert.equal(parsed.episode,episode);assert.equal(parsed.kind,episode===null?'movie':'episode');if(title==='Dororo')assert.match(parsed.review!,/Season/);if(title==='Lanterns')assert.equal(parsed.episodeTitle,'Trust Fall');});
test('numeric movie title is preserved',()=>{assert.equal(parseMedia(String.raw`E:\1917.2019.1080p.mkv`).title,'1917');assert.equal(parseMedia(String.raw`E:\2001.A.Space.Odyssey.1968.1080p.mkv`).title,'2001 A Space Odyssey');});
test('conflicting season evidence and multi episode need review',()=>{assert.match(parseMedia(String.raw`E:\Show Season 2\Show.S01E01.mkv`).review!,/conflicts/);assert.match(parseMedia(String.raw`E:\Show\Show.S01E01E02.mkv`).review!,/multi-episode/);});
test('source prefixes can be stacked, but title brackets, articles and embedded words survive',()=>{
  assert.equal(parseMedia(String.raw`E:\[MFA].@CC_Links.The.Terminator.1984.720p.mkv`).title,'The Terminator');
  assert.equal(parseMedia(String.raw`E:\[REC].2007.720p.mkv`).title,'REC');
  assert.equal(parseMedia(String.raw`E:\The.MFA.Story.2020.720p.mkv`).title,'The MFA Story');
  assert.equal(parseMedia(String.raw`E:\@Home.2019.720p.mkv`).title,'@Home');
  assert.equal(parseMedia(String.raw`E:\[MFA].1917.2019.1080p.mkv`).title,'1917');
});
test('source prefixes are removed from series folders too',()=>{const item=parseMedia(String.raw`E:\[MFA].Dororo\EP.2.v0.1639395379.720p.mp4`);assert.equal(item.title,'Dororo');assert.equal(item.episode,2);assert.equal(item.season,null);});
