import { asyncRoute as wrap } from '../http/asyncRoute.js';
export function registerPaymentRoutes(app,{services,throttle,adminOnly,customerOnly}) {
  const service=services.payment;
  app.get('/api/pricing',wrap(async(_req,res)=>res.json(await service.pricing())));
  app.get('/api/admin/pricing/history',adminOnly,wrap(async(req,res)=>res.json(await service.pricingHistory(req.currentUser))));
  app.put('/api/admin/pricing',adminOnly,wrap(async(req,res)=>res.json(await service.updatePricing(req.currentUser,req.body))));
  app.get('/api/admin/pricing/packs/history',adminOnly,wrap(async(req,res)=>res.json(await service.packHistory(req.currentUser))));
  app.post('/api/admin/pricing/packs',adminOnly,wrap(async(req,res)=>res.status(201).json(await service.createPack(req.currentUser,req.body))));
  app.put('/api/admin/pricing/packs/:id',adminOnly,wrap(async(req,res)=>res.json(await service.updatePack(req.currentUser,req.params.id,req.body))));
  app.post('/api/orders',throttle('orders',30,60000),customerOnly,wrap(async(req,res)=>res.status(201).json(await service.createOrder(req.currentUser,req.body))));
  app.get('/api/payments/config',(_req,res)=>res.json(service.config()));
  app.get('/api/orders/:id/status',customerOnly,wrap(async(req,res)=>res.json(await service.status(req.currentUser,req.params.id))));
  app.post('/api/orders/:id/checkout',throttle('checkout',30,60000),customerOnly,wrap(async(req,res)=>res.json(await service.checkout(req.currentUser,req.params.id))));
  app.post('/api/payments/payos/webhook',throttle('payos-webhook',240,60000),wrap(async(req,res)=>res.json(await service.webhook(req.body))));
  app.post('/api/orders/:id/pay',throttle('demo-pay',30,60000),customerOnly,wrap(async(req,res)=>res.json(await service.demoPay(req.currentUser,req.params.id,req.body))));
  app.get('/api/orders',customerOnly,wrap(async(req,res)=>res.json(await service.orders(req.currentUser))));
}
