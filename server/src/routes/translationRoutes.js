import {asyncRoute as wrap} from '../http/asyncRoute.js';
export function registerTranslationRoutes(app,{services,throttle,auth}){
  const service=services.translation;
  app.post('/api/translate',throttle('translate',40,60000),auth,wrap(async(req,res)=>res.json(await service.translate(req.currentUser,req.body))));
  app.get('/api/health',wrap(async(_req,res)=>{const result=await service.health();res.status(result.ok?200:503).json(result);}));
  app.get('/api/health/translation',wrap(async(_req,res)=>{const result=await service.translationHealth();res.status(result.ok?200:503).json(result);}));
}
