// Minimal stand-in for himobile-crm-server: same endpoints, upsert-only /api/sync,
// cascade delete, API key check. In-memory only. Used for testing the frontend.
const http = require('http');
const KEY = '2052';
let db = { customers: new Map(), services: new Map(), templates: [], reminderState: {} };
const log = [];
function send(res, code, obj){
  res.writeHead(code, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, X-API-Key','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});
  res.end(obj===undefined ? '' : JSON.stringify(obj));
}
http.createServer((req, res)=>{
  if(req.method==='OPTIONS') return send(res, 204);
  let body=''; req.on('data', c=> body+=c); req.on('end', ()=>{
    const url = req.url.split('?')[0];
    if(url==='/api/health') return send(res, 200, {ok:true, schemaOk:true});
    // test-only helpers (no key)
    if(url==='/__state') return send(res, 200, {customers:[...db.customers.values()], services:[...db.services.values()], log});
    if(url==='/__seed' && req.method==='POST'){ const d=JSON.parse(body); db.customers=new Map(d.customers.map(c=>[c.id,c])); db.services=new Map(d.services.map(s=>[s.id,s])); db.templates=d.templates||[]; db.reminderState=d.reminderState||{}; log.length=0; return send(res,200,{ok:true}); }
    if(req.headers['x-api-key']!==KEY) return send(res, 401, {error:'bad key'});
    if(url==='/api/snapshot') return send(res, 200, {customers:[...db.customers.values()], services:[...db.services.values()], templates:db.templates, reminderState:db.reminderState});
    if(url==='/api/sync' && req.method==='POST'){
      const d = JSON.parse(body||'{}');
      const failedServices = [];
      (d.customers||[]).forEach(c=> db.customers.set(c.id, c));
      (d.services||[]).forEach(s=>{ if(!db.customers.has(s.customerId)) failedServices.push(s.id); else db.services.set(s.id, s); });
      if(Array.isArray(d.templates)) db.templates = d.templates;
      if(d.reminderState) db.reminderState = d.reminderState;
      log.push({t:'sync', customers:(d.customers||[]).length, services:(d.services||[]).length, bytes: body.length});
      return send(res, 200, {ok:true, failedCustomers:[], failedServices});
    }
    const m = url.match(/^\/api\/customers\/(.+)$/);
    if(m && req.method==='DELETE'){
      const id = decodeURIComponent(m[1]);
      if(!db.customers.has(id)) return send(res, 404, {error:'not found'});
      db.customers.delete(id); [...db.services.values()].filter(s=>s.customerId===id).forEach(s=>db.services.delete(s.id));
      log.push({t:'delete', id}); return send(res, 200, {ok:true});
    }
    if(url==='/api/wipe' && req.method==='POST'){ db.customers.clear(); db.services.clear(); db.reminderState={}; return send(res,200,{ok:true}); }
    send(res, 404, {error:'no route'});
  });
}).listen(4000, ()=> console.log('mock on 4000'));
