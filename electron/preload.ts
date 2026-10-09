import { contextBridge,ipcRenderer } from 'electron';
import type { MediaAPI } from '../shared/types';
const api:MediaAPI={
  inspectRuntimes:()=>ipcRenderer.invoke('media:inspect-runtimes'),
  classify:(id,value)=>ipcRenderer.invoke('media:classify',id,value),
  movieDetails:(id,refresh=false)=>ipcRenderer.invoke('media:movie-details',id,refresh),
  appearance:()=>ipcRenderer.invoke('media:appearance'),
  saveAppearance:(value)=>ipcRenderer.invoke('media:save-appearance',value),
  snapshot:()=>ipcRenderer.invoke('media:snapshot'),
  addRoot:(id)=>ipcRenderer.invoke('media:add-root',id),
  scan:(id)=>ipcRenderer.invoke('media:scan',id),
  watched:(id,value)=>ipcRenderer.invoke('media:watched',id,value),
  pick:(kind)=>ipcRenderer.invoke('media:pick',kind),
  open:(id)=>ipcRenderer.invoke('media:open',id),
  posterSettings:()=>ipcRenderer.invoke('media:poster-settings'),
  savePosterToken:(token)=>ipcRenderer.invoke('media:poster-token',token),
  syncPosters:()=>ipcRenderer.invoke('media:sync-posters'),
  cancelPosters:()=>ipcRenderer.invoke('media:cancel-posters'),
  searchPoster:(id,title,year)=>ipcRenderer.invoke('media:search-poster',id,title,year),
  selectPoster:(id,tmdbId)=>ipcRenderer.invoke('media:select-poster',id,tmdbId),
  onArtwork:(callback)=>{const listener=(_event:unknown,update:any)=>callback(update);ipcRenderer.on('media:artwork',listener);return()=>ipcRenderer.removeListener('media:artwork',listener);},
  onProgress:(callback)=>{const listener=(_event:unknown,message:string)=>callback(message);ipcRenderer.on('media:progress',listener);return()=>ipcRenderer.removeListener('media:progress',listener);}
};
contextBridge.exposeInMainWorld('media',api);
