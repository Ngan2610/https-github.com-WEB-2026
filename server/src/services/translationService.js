import {cookingInsights} from './cookingInsights.js';
import {fail} from '../domain/errors.js';
const LANG=new Set(['vi','en','zh']);
export function createTranslationService(repo,{translator,adminReady}){
  const active=new Map();
  return {
    async translate(user,body={}){
      const {text,from,to}=body;
      if(typeof text!=='string'||!text.trim()||text.length>4000||!LANG.has(from)||!LANG.has(to))fail('invalid');
      const key=String(user.id||user.email);
      if((active.get(key)||0)>=2)fail('busy',429);
      active.set(key,(active.get(key)||0)+1);
      try{return {translatedText:await translator.translate(text,from,to),...cookingInsights([{text}],from)};}
      catch(error){const code=['model_missing','timeout','unavailable','empty'].includes(error.code)?error.code:'server';fail(code,['unavailable','model_missing'].includes(code)?503:502);}
      finally{const remaining=(active.get(key)||1)-1;if(remaining>0)active.set(key,remaining);else active.delete(key);}
    },
    async health(){try{await repo.ping();return {ok:Boolean(adminReady),db:true,adminReady:Boolean(adminReady)};}catch{return {ok:false,db:false};}},
    async translationHealth(){const status=await translator.status();return {ok:Boolean(status.reachable&&status.modelReady),...status};},
  };
}
