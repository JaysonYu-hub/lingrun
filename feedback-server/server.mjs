// Private file inbox. Put a trusted HTTPS reverse proxy in front; no public read API.
import http from 'node:http';
import { timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, open, link, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const MAX=4*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function canonical(v){
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v!==null&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
export function createFeedbackServer({directory,keys,maxRecords=10000}) {
  if(!Array.isArray(keys)||!keys.length||keys.some(k=>typeof k!=='string'||k.length<24))throw Error('Set upload codes with at least 24 characters.');
  const dir=path.resolve(directory);const counters=new Map();let writing=false;
  const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.method!=='POST'||req.url!=='/v1/feedback'){req.resume();return reply(res,404,{ok:false,error:'not_found'});}
      const auth=req.headers.authorization||'';
      const code=keys.find(k=>{const b=Buffer.from('Bearer '+k),a=Buffer.from(auth);return a.length===b.length&&timingSafeEqual(a,b);});
      if(!code){req.resume();return reply(res,401,{ok:false,error:'unauthorized'});}
      const now=Date.now(),bucket=counters.get(code)||{start:now,count:0};if(now-bucket.start>=60000){bucket.start=now;bucket.count=0;}bucket.count++;counters.set(code,bucket);
      if(bucket.count>20){req.resume();return reply(res,429,{ok:false,error:'rate_limited'});}
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){req.resume();return reply(res,415,{ok:false,error:'json_required'});}
      if(Number(req.headers['content-length'])>MAX){req.resume();return reply(res,413,{ok:false,error:'too_large'});}
      let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>MAX){reply(res,413,{ok:false,error:'too_large'});return;}chunks.push(b);}
      const raw=Buffer.concat(chunks);let p;try{p=JSON.parse(raw.toString('utf8'));}catch{return reply(res,400,{ok:false,error:'invalid_json'});}
      if(!p||p.schema!==1||!UUID.test(p.feedbackId)||typeof p.description!=='string'||p.description.trim().length<5||p.description.length>10000||typeof p.appVersion!=='string'||p.appVersion.length>80||typeof p.createdAt!=='string'||p.createdAt.length>64||!Number.isFinite(Date.parse(p.createdAt))||!(p.report===null||(p.report&&typeof p.report==='object'&&!Array.isArray(p.report)))||Object.keys(p).some(k=>!['schema','feedbackId','createdAt','appVersion','description','report'].includes(k)))return reply(res,400,{ok:false,error:'invalid_fields'});
      // Bound simultaneous durable writes; callers can safely retry the original id.
      if(writing)return reply(res,503,{ok:false,error:'busy'});writing=true;
      try {
        await mkdir(dir,{recursive:true,mode:0o700});
        const target=path.join(dir,p.feedbackId+'.json'),hash=createHash('sha256').update(canonical(p)).digest('hex');
        try {const prior=JSON.parse(await readFile(target,'utf8'));if(prior.sha256!==hash)return reply(res,409,{ok:false,error:'id_conflict'});return reply(res,200,{ok:true,feedbackId:p.feedbackId,duplicate:true});}catch(e){if(e.code!=='ENOENT')throw e;}
        if((await readdir(dir)).filter(n=>n.endsWith('.json')).length>=maxRecords)return reply(res,507,{ok:false,error:'storage_limit'});
        const record={receivedAt:new Date().toISOString(),sha256:hash,feedback:p};
        const tmp=path.join(dir,'.'+randomUUID()+'.tmp');
        try{const f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(record,null,2));await f.sync();}finally{await f.close();}
          // Atomic publication without overwriting another submission.
          await link(tmp,target);
        }finally{await unlink(tmp).catch(()=>{});}
        return reply(res,201,{ok:true,feedbackId:p.feedbackId});
      }finally{writing=false;}
    }catch{if(!res.headersSent)reply(res,500,{ok:false,error:'storage_or_request_error'});else res.end();}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;server.maxConnections=50;
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const keys=(process.env.FEEDBACK_UPLOAD_KEYS||'').split(',').map(k=>k.trim()).filter(Boolean);
  const directory=process.env.FEEDBACK_DATA_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'data');
  const port=Number(process.env.PORT||8787);
  createFeedbackServer({directory,keys}).listen(port,'127.0.0.1',()=>console.log(`Feedback receiver on 127.0.0.1:${port}; private file inbox, no public download endpoint.`));
}
