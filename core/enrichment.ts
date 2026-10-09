import type { Catalogue } from './catalogue';
import type { TMDBClient } from './posters';
import type { Item,MovieDetailsCache } from '../shared/types';
export async function loadMovieDetails(catalogue:Catalogue,item:Item,provider:Pick<TMDBClient,'movieDetails'>|undefined,refresh=false):Promise<MovieDetailsCache|undefined>{
  if(item.kind!=='movie'||item.artwork?.status!=='matched'||!item.artwork.selected)return undefined;
  const id=item.artwork.selected.id,old=catalogue.details(id);
  if(old?.status==='ready'&&!refresh||!provider)return old;
  let result:MovieDetailsCache;
  try{result={status:'ready',data:await provider.movieDetails(id),checkedAt:new Date().toISOString()};}
  catch(error){result={status:'error',data:old?.data,message:error instanceof Error?error.message:String(error),checkedAt:new Date().toISOString()};}
  catalogue.saveDetails(id,result);return result;
}
