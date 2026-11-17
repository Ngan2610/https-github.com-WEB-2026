const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
export function registerAccountRoutes(app,{services,throttle,auth,customerOnly}) {
  const service=services.account;
  app.post('/api/auth/register',throttle('register',20,15*60*1000),wrap(async(req,res)=>{
    res.status(201).json({user:await service.register(req.body)});
  }));
  app.post('/api/auth/login',throttle('login',60,15*60*1000),wrap(async(req,res)=>{
    res.json({user:await service.login(req.body,req.ip)});
  }));
  app.get('/api/me',auth,(req,res)=>res.json(service.profile(req.currentUser)));
  app.get('/api/me/entitlements',customerOnly,wrap(async(req,res)=>{
    res.set('Cache-Control','no-store');res.json(await service.entitlements(req.currentUser));
  }));
  app.patch('/api/me',auth,wrap(async(req,res)=>{
    res.json({user:await service.updateProfile(req.currentUser,req.body)});
  }));
  app.patch('/api/me/password',auth,wrap(async(req,res)=>{
    await service.changePassword(req.currentUser,req.body);res.json({ok:true});
  }));
}
