import {asyncRoute as wrap} from '../http/asyncRoute.js';
export function registerCommunityRoutes(app,{services,auth}){
  const service=services.community;
  app.get('/api/feedback',auth,wrap(async(req,res)=>res.json(await service.feedback(req.currentUser))));
  app.post('/api/feedback',auth,wrap(async(req,res)=>res.status(201).json(await service.addFeedback(req.currentUser,req.body))));
  app.post('/api/contact',wrap(async(req,res)=>res.status(201).json(await service.contact(req.body))));
  app.post('/api/track',wrap(async(req,res)=>{await service.track(req.body);res.status(204).end();}));
  app.post('/api/qr-scan',wrap(async(req,res)=>{await service.track(req.body,true);res.status(204).end();}));
}
