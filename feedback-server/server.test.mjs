import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createFeedbackServer} from './server.mjs';

test('receiver: authentication, durable receipt, deduplication, privacy boundary and capacity',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'trackcheck-feedback-'));
 const key='test-only-upload-code-not-for-deployment';
 const server=createFeedbackServer({directory,keys:[key],maxRecords:1});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/v1/feedback`;
 const p={schema:1,feedbackId:randomUUID(),createdAt:new Date().toISOString(),appVersion:'test',description:'息屏后播报延迟，重新进入才有声音。',report:{simulated:true,querySuccess:5}};
 const post=(body=p,auth=key)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify(body)});
 try {
  assert.equal((await post(p,'wrong')).status,401);
  assert.equal((await post({...p,feedbackId:'../../escape'})).status,400);
  assert.equal((await post({...p,description:'短'})).status,400);
  assert.equal((await post({...p,unknown:'not allowed'})).status,400);
  assert.equal((await post({...p,report:{large:'x'.repeat(4*1024*1024)}})).status,413);
  let r=await post();assert.equal(r.status,201);assert.equal((await r.json()).feedbackId,p.feedbackId);
  const saved=JSON.parse(await readFile(path.join(directory,p.feedbackId+'.json'),'utf8'));
  assert.deepEqual(saved.feedback,p);assert.equal(JSON.stringify(saved).includes(key),false);
  r=await post();assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);
  assert.equal((await post(Object.fromEntries(Object.entries(p).reverse()))).status,200);
  assert.equal((await post({...p,description:'同一个编号但内容发生变化了'})).status,409);
  assert.equal((await post({...p,feedbackId:randomUUID(),report:null})).status,507);
  assert.equal((await fetch(url)).status,404);
  assert.equal((await fetch(url+'/'+p.feedbackId+'.json')).status,404);
  assert.equal((await readdir(directory)).length,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
});
test('receiver refuses absent or weak upload codes',()=>{
 assert.throws(()=>createFeedbackServer({directory:'.',keys:[]}));
 assert.throws(()=>createFeedbackServer({directory:'.',keys:['123']}));
});
