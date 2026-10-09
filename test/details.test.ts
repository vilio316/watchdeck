import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TMDBClient,artworkKey} from '../core/posters';
import {Catalogue} from '../core/catalogue';
import {loadMovieDetails} from '../core/enrichment';
import {parseMedia} from '../core/parser';
import {CollectionList,ItemDialog} from '../src/collection';
import type {Item,MovieDetails} from '../shared/types';
const details:MovieDetails={summary:'Two people meet.',genres:['Drama'],directors:['Director Name'],writers:[],cast:[{name:'Actor Name',character:'Hero'}],releaseDate:'2020-01-01',language:'en',rating:7,ratingCount:100,listedRuntimeMinutes:90};
const base:Item={...parseMedia('/Film.2020.mkv'),id:'test',available:true,watched:false,watchedAt:null,paths:[],runtimeSeconds:5400,artwork:{status:'matched',selected:{id:42,title:'Film',originalTitle:'Film',year:2020,posterPath:null},candidates:[],checkedAt:'now'}};
test('movie request appends credits, maps key fields, and limits summary and starring cast',async()=>{
  const urls:string[]=[];const request=(async(url:any)=>{urls.push(String(url));return Response.json({id:42,overview:'First sentence. Second sentence. Third sentence.',genres:[{name:'Drama'}],runtime:90,vote_count:100,vote_average:7,credits:{crew:[{job:'Director',name:'Director Name'},{job:'Producer',name:'Producer Name'}],cast:Array.from({length:20},(_,i)=>({name:`Actor ${i}`,character:'Hero'}))}});}) as typeof fetch;
  const result=await new TMDBClient('token','unused',request).movieDetails(42);assert.match(urls[0],/\/movie\/42\?append_to_response=credits/);assert.deepEqual(result.directors,['Director Name']);assert.equal(result.cast.length,8);assert.doesNotMatch(result.summary,/Third/);assert.equal(result.listedRuntimeMinutes,90);
});
test('movie metadata gating, cache, offline access, failure isolation, and type switches',async()=>{
  const db=new Catalogue(':memory:');let calls=0;const provider={movieDetails:async()=>{calls++;return details;}};
  try{assert.equal(await loadMovieDetails(db,{...base,kind:'episode'},provider),undefined);assert.equal(calls,0);assert.equal(await loadMovieDetails(db,{...base,artwork:undefined},provider),undefined);
    await loadMovieDetails(db,base,provider);await loadMovieDetails(db,base,provider);assert.equal(calls,1);assert.equal((await loadMovieDetails(db,base,undefined))?.data?.summary,details.summary);
    const failed=await loadMovieDetails(db,base,{movieDetails:async()=>{throw new Error('offline');}},true);assert.equal(failed?.status,'error');assert.deepEqual(failed?.data,details);
    const root=db.register('/media');db.commitScan(root,[{relativePath:'Film.2020.mkv',size:1,mtime:1,parsed:parseMedia('/Film.2020.mkv')}]);const i=db.snapshot().items[0];db.saveArtwork(artworkKey(i),base.artwork!);assert.ok(db.snapshot().items[0].movieDetails?.data);db.setClassification(i.id,'episode');assert.equal(db.snapshot().items[0].movieDetails,undefined);assert.equal(db.snapshot().items[0].artwork,undefined);db.setClassification(i.id,'movie');assert.ok(db.snapshot().items[0].movieDetails?.data);
  }finally{db.close();}
});
test('list has accessible title and decision actions; movie modal details stay hidden for episodes',()=>{
  const noop=()=>{};const html=renderToStaticMarkup(React.createElement(CollectionList,{items:[base],busy:false,details:noop,open:noop,toggle:noop}));assert.match(html,/<table/);assert.match(html,/scope="col"/);assert.match(html,/Mark watched/);assert.match(html,/1h 30m/);
  const props={api:undefined,busy:false,configured:false,isPick:false,close:noop,open:noop,toggle:noop,classify:noop,match:noop,pickAgain:noop,changed:async()=>{}};
  const film={...base,movieDetails:{status:'ready' as const,data:details,checkedAt:'now'}};
  const movie=renderToStaticMarkup(React.createElement(ItemDialog,{...props,item:film}));assert.match(movie,/Director Name/);assert.match(movie,/Actor Name/);assert.match(movie,/<dialog/);assert.match(movie,/Automatic/);
  const tv=renderToStaticMarkup(React.createElement(ItemDialog,{...props,item:{...film,kind:'episode'}}));assert.doesNotMatch(tv,/Director Name|Actor Name|Movie details/);assert.match(tv,/TV episode/);
});
