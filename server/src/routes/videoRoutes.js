import {asyncRoute as wrap} from '../http/asyncRoute.js';
export function registerVideoRoutes(app,{services,auth,customerOnly}){
  const service=services.video;
  app.get('/api/videos',auth,wrap(async(req,res)=>res.json(await service.list(req.currentUser))));
  app.post('/api/videos',customerOnly,wrap(async(req,res)=>{const result=await service.create(req.currentUser,req.body,req.get('X-Idempotency-Key')||null);res.status(result.video.reused?200:201).json(result);}));
  app.post('/api/videos/:id/cancel',customerOnly,wrap(async(req,res)=>res.json(await service.cancel(req.currentUser,req.params.id))));
  app.put('/api/videos/:id/file',customerOnly,wrap(async(req,res)=>res.status(201).json(await service.upload(req.currentUser,req.params.id,req,{contentType:req.get('content-type'),length:req.get('content-length')}))));
  app.get('/api/videos/:id/file',auth,wrap(async(req,res)=>{const file=await service.file(req.currentUser,req.params.id);res.type(file.mimeType).sendFile(file.path);}));
  app.post('/api/videos/:id/results',customerOnly,wrap(async(req,res)=>res.json(await service.saveResults(req.currentUser,req.params.id,req.body))));
  app.get('/api/videos/:id/insights',auth,wrap(async(req,res)=>res.json(await service.insights(req.currentUser,req.params.id))));
  app.get('/api/videos/:id/results',auth,wrap(async(req,res)=>res.json(await service.results(req.currentUser,req.params.id))));
  app.post('/api/jobs/process-video',customerOnly,wrap(async(req,res)=>res.status(202).json(await service.enqueue(req.currentUser,req.body))));
  app.get('/api/jobs/video/:videoId/latest',customerOnly,wrap(async(req,res)=>res.json(await service.latestJob(req.currentUser,req.params.videoId))));
  app.get('/api/jobs/:id',auth,wrap(async(req,res)=>res.json(await service.job(req.currentUser,req.params.id))));
  app.get('/api/jobs/:id/download/:language/:format',auth,wrap(async(req,res)=>{const file=await service.jobFile(req.currentUser,req.params.id,req.params.language,req.params.format);res.set('Cache-Control','private, no-store');res.download(file.path,file.fileName);}));
  app.get('/api/languages',wrap(async(_req,res)=>res.json(await service.languages())));
  app.get('/api/videos/:id/exports',auth,wrap(async(req,res)=>res.json(await service.exports(req.currentUser,req.params.id))));
  app.get('/api/videos/:id/export/:language/:format',auth,wrap(async(req,res)=>{
    const file=await service.voiceFile(req.currentUser,req.params.id,req.params.language,req.params.format);
    res.set('Cache-Control','no-store');
    res.download(file.path,file.fileName,async error=>{await file.dispose();if(error&&!res.headersSent)res.status(500).json({code:'download_failed'});});
  }));
}
