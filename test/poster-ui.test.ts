import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Poster,displayTitle } from '../src/posters';
import { parseMedia } from '../core/parser';
import type { Item } from '../shared/types';
const base:Item={...parseMedia(String.raw`E:\Us.2019.mkv`),id:'test',available:true,watched:false,watchedAt:null,paths:[]};
test('cached artwork renders an image with the matched title as accessible description',()=>{
  const item:Item={...base,posterUrl:'watchdeck-poster://cache/test.jpg',artwork:{status:'matched',selected:{id:1,title:'Us',originalTitle:'Us',year:2019,posterPath:'/test.jpg'},candidates:[],checkedAt:'now'}};
  const html=renderToStaticMarkup(React.createElement(Poster,{item}));assert.match(html,/<img/);assert.match(html,/Us poster/);assert.match(html,/watchdeck-poster:/);assert.equal(displayTitle(item),'Us');
});
test('unresolved matches render a meaningful placeholder without a remote image',()=>{
  const item:Item={...base,artwork:{status:'review',candidates:[],checkedAt:'now'}};const html=renderToStaticMarkup(React.createElement(Poster,{item}));assert.match(html,/CONFIRM POSTER MATCH/);assert.doesNotMatch(html,/<img/);assert.equal(displayTitle(item),base.title);
});
