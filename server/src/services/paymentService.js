import { createHash } from 'node:crypto';
import { METHODS, newTransactionRef, validateOrder } from '../orders.js';
import { cleanPriceUpdate, cleanPackInput } from '../pricingPolicy.js';
import { fail, positiveId, requireRole } from '../domain/errors.js';

export function createPaymentService(repo, { paymentMode, gateway }) {
  const ownedOrder = async (user, value) => {
    requireRole(user, 'user');
    const order = await repo.getOrderForPayment(positiveId(value), user.id);
    if (!order) fail('not_found', 404);
    return order;
  };
  return {
    async pricing() {
      if (!repo.getPricing) fail('pricing_unavailable', 503);
      return repo.getPricing();
    },
    async pricingHistory(user) { requireRole(user, 'admin'); return {history: await repo.getPricingHistory()}; },
    async updatePricing(user, body) {
      requireRole(user, 'admin');
      const checked = cleanPriceUpdate(body);
      if (checked.error) fail(checked.error);
      try { return {pricing: await repo.updatePricing(checked.value, user.email)}; }
      catch (e) { if (['price_changed','pack_exceeds_pricing_limits'].includes(e.code)) fail(e.code, 409); throw e; }
    },
    async packHistory(user) {
      requireRole(user, 'admin');
      return {history: await repo.getPackHistory()};
    },
    async createPack(user, body) {
      requireRole(user, 'admin');
      const checked=cleanPackInput(body);
      if (checked.error) fail(checked.error);
      try {
        const pack=await repo.createPack(checked.value,user.email);
        return {pack};
      } catch(e) { if (e.code==='pack_exceeds_pricing_limits') fail(e.code,409); throw e; }
    },
    async updatePack(user, id, body) {
      requireRole(user, 'admin');
      const packId=positiveId(id);
      const checked=cleanPackInput(body);
      if (checked.error) fail(checked.error);
      if (!body?.expected || typeof body.expected !== 'object') fail('pack_version_required',409);
      try {
        const pack=await repo.updatePack(packId,checked.value,body.expected,user.email);
        if (!pack) fail('not_found',404);
        return {pack};
      } catch (e) {
        if (['pack_changed','pack_exceeds_pricing_limits'].includes(e.code)) fail(e.code,409);
        throw e;
      }
    },
    async createOrder(user, body) {
      requireRole(user, 'user');
      const policy = repo.getPricing ? await repo.getPricing() : null;
      if (repo.getPricing && (!Number.isSafeInteger(body?.priceVersion) || body.priceVersion < 1)) fail('price_changed', 409);
      const currency = ['VND','USD','CNY'][Number(body?.L)];
      const configured = policy?.currencies?.find(x => x.currency === currency);
      const checked = validateOrder(body, configured || undefined);
      if (checked.error) fail(checked.error);
      if (checked.value.email !== user.email) fail('forbidden', 403);
      if (paymentMode === 'payos' && checked.value.L !== 0) fail('currency_unsupported', 422);
      let order;
      try {
        order = await repo.createOrder({...checked.value, currency, priceVersion: body?.priceVersion, userId: user.id, name: user.name});
      } catch (e) { if (['price_changed','invalid_quantity'].includes(e.code)) fail(e.code,409); throw e; }
      if (!order) fail('account_unavailable', 409);
      return {order};
    },
    config() {
      const mode = paymentMode === 'payos' && !gateway ? 'unavailable' : paymentMode;
      return {mode, methods: mode === 'payos' ? ['qr','bank'] : mode === 'demo' ? METHODS : [],
        supportedCurrencies: mode === 'payos' ? ['VND'] : mode === 'demo' ? ['VND','USD','CNY'] : []};
    },
    async status(user, id) { return {order: await ownedOrder(user,id)}; },
    async checkout(user, id) {
      if (paymentMode !== 'payos' || !gateway) fail('payment_unavailable',503);
      const order = await ownedOrder(user,id);
      if (order.status !== 'pending') fail('not_payable',409);
      if (order.currency !== 'VND' || !Number.isSafeInteger(order.amountMinor) || order.amountMinor <= 0) fail('currency_unsupported',422);
      try { return {order, ...await gateway.createCheckout(order)}; }
      catch { fail('payment_gateway_unavailable',502); }
    },
    async webhook(body) {
      if (paymentMode !== 'payos' || !gateway) fail('payment_unavailable',503);
      let event;
      try { event = gateway.verifyWebhook(body); } catch { fail('invalid_signature'); }
      if (!event.success) return {ok:true, ignored:true};
      const id = positiveId(event.orderCode);
      const order = await repo.getOrderForPayment(id);
      if (!order) return {ok:true, ignored:true};
      if (order.currency !== 'VND' || event.currency !== 'VND' || event.amount !== order.amountMinor) fail('payment_mismatch',409);
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(event.reference)) fail('invalid_reference');
      if (order.status === 'paid') return {ok:true, alreadyProcessed:true};
      if (order.status !== 'pending') fail('not_payable',409);
      const payloadSha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const payment = {method:'qr',ref:event.reference,source:'payos'};
      const result = typeof repo.payVerifiedWebhook === 'function'
        ? await repo.payVerifiedWebhook(id,{...payment,verifiedWebhook:{eventId:`payos:${event.reference}`,payloadSha256}})
        : await repo.payOrder(id,payment);
      return result ? {ok:true,paid:true} : {ok:true,alreadyProcessed:true};
    },
    async demoPay(user, value, body) {
      requireRole(user,'user'); const id = positiveId(value);
      if (!METHODS.includes(body?.method)) fail('method');
      if (!await repo.orderOwner(id,user.id)) fail('not_found',404);
      if (paymentMode !== 'demo') fail('payment_unavailable',503);
      const result = await repo.payOrder(id,{method:body.method,ref:newTransactionRef(body.method)});
      if (!result) fail('not_payable',409);
      return result;
    },
    async orders(user) { requireRole(user,'user'); return {orders: await repo.listOrders(user.email,20,user.id)}; },
  };
}
