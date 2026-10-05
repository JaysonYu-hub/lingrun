const {test}=require('node:test'),assert=require('node:assert/strict'),policy=require('./adaptive-run.js');
test('October 2: temporary RULE-only response is not a confirmed end',()=>{
 const p=policy.create(),active={ok:true,sample:{status:'1',runKey:'same',checkpointEvents:[]}};
 p.update(active,0,{},0);assert.equal(p.update({ok:true},107954,{},107954).stage,'WAIT_DATA');
 assert.equal(p.update(active,120000,{},120000).stop,false);
 assert.equal(p.update({ok:true,sample:{...active.sample,status:'2'}},130000,{},130000).stop,true);
 const q=policy.create();q.update({ok:true},0,{},0);const timeout=q.update({ok:true},300000,{},300000);assert.equal(timeout.stop,true);assert.equal(timeout.type,'DATA_UNAVAILABLE');
});
