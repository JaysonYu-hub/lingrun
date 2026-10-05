const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('./adaptive-run.js'),motion=require('./motion-model.js');
const epoch=1790400000000;
function event(id,station,at){return {id,station,timeMs:epoch+at};}
function result(events=[],status='1'){return {ok:true,stage:'DETAIL',waiting:status!=='1',sample:{status,runKey:'run-a',distance:'无',totalTime:'无',checkpointEvents:events}};}
function step(p,at,events,aux={},status='1'){return p.update(result(events,status),at,aux,epoch+at);}
function learned(){const p=policy.create();step(p,0,[],{},'0');const a=event('a1','a',5000),b=event('b1','b',85000);step(p,5000,[a]);step(p,85000,[a,b]);return {p,a,b};}
test('startup is fast, waiting backs off, alternating server events learn speed and count laps',()=>{
 const p=policy.create();assert.equal(step(p,0,[],{},'0').nextMs,5000);assert.equal(step(p,125000,[],{},'0').nextMs,15000);
 const a=event('a','A',130000),b=event('b','B',210000),c=event('c','A',290000);
 assert.equal(step(p,130000,[a]).type,'START');
 const half=step(p,210000,[a,b]);assert.equal(half.confirmedSegments,1);assert.equal(half.estimated200Seconds,80);assert.equal(half.estimatedSpeedMps,2.5);
 const lap=step(p,290000,[a,b,c]);assert.equal(lap.completedLaps,1);assert.match(lap.message,/第1圈已完成/);
 const duplicate=step(p,295000,[a,b,c]);assert.equal(duplicate.message,null);assert.equal(duplicate.completedLaps,1);
});
test('query rate accelerates near predicted arrival, backs off far away and never counts GPS as a card',()=>{
 const {p,a,b}=learned();assert.equal(step(p,90000,[a,b]).nextMs,20000);assert.equal(step(p,145000,[a,b]).nextMs,5000);
 const other=policy.create();step(other,0,[],{gpsFresh:true,gpsMeters:0},'0');step(other,5000,[a],{gpsFresh:true,gpsMeters:0});
 const near=step(other,45000,[a],{gpsFresh:true,gpsMeters:170});assert.equal(near.stage,'NEAR_POINT');assert.equal(near.confirmedSegments,0);assert.equal(near.message,null);
});
test('possible missed card needs repeated successful late queries, warns once and recovers on confirmation',()=>{
 const {p,a,b}=learned();assert.equal(step(p,200000,[a,b]).type,null);
 const warning=step(p,210000,[a,b]);assert.equal(warning.type,'POSSIBLE_MISS');assert.match(warning.message,/可能/);
 assert.equal(step(p,220000,[a,b]).message,null);assert.equal(step(p,240000,[a,b]).nextMs,15000);
 const c=event('a2','a',220000);const recover=step(p,245000,[a,b,c]);assert.equal(recover.type,'CARD_CONFIRMED');assert.equal(recover.warning,false);
});
test('same-point repeat does not add 200 metres; third station stops lap estimation',()=>{
 const {p,a,b}=learned();const repeat=event('b2','b',130000);
 const d=step(p,130000,[a,b,repeat]);assert.equal(d.confirmedSegments,1);assert.equal(d.type,'SAME_POINT');
 const third=step(p,200000,[a,b,repeat,event('c','third',200000)]);assert.equal(third.stop,true);assert.equal(third.confirmedSegments,1);
});
test('mid-run attach does not count history; old delayed events and short duplicate transitions cannot inflate laps',()=>{
 const p=policy.create(),a=event('a','a',0),b=event('b','b',80000);
 const baseline=step(p,90000,[a,b]);assert.equal(baseline.confirmedSegments,0);assert.equal(baseline.lapScope,'since-monitor-baseline');
 assert.equal(step(p,95000,[a,b,event('old','a',20000)]).confirmedSegments,0);
 assert.equal(step(p,100000,[a,b,event('short','a',85000)]).confirmedSegments,0);
});
test('pause suppresses missed-card warnings; API failure, ended run and new record stop',()=>{
 const {p,a,b}=learned();const pause=step(p,250000,[a,b],{stationary:true});assert.equal(pause.stage,'PAUSED_MOVEMENT');assert.equal(pause.warning,false);
 assert.equal(p.update({ok:false},255000).stop,true);
 const record=learned();const changed=result([record.a,record.b]);changed.sample.runKey='other';assert.equal(record.p.update(changed,90000,{},epoch+90000).stop,true);
 const end=learned();assert.equal(step(end.p,90000,[end.a,end.b],{},'2').type,'ENDED');
});
test('two dated catch-up events can count two intervals; undated batch stops rather than guessing order',()=>{
 const {p,a,b}=learned();const d=step(p,260000,[a,b,event('a2','a',165000),event('b2','b',245000)]);assert.equal(d.confirmedSegments,3);assert.match(d.message,/补回2/);
 const x=learned();assert.equal(step(x.p,260000,[x.a,x.b,{id:'u1',station:'a',timeMs:null},{id:'u2',station:'b',timeMs:null}]).stage,'ORDER_UNKNOWN');
});
test('calibrated steps provide approach estimate, uncalibrated steps cannot invent distance',()=>{
 const p=policy.create(),a=event('a','a',5000),b=event('b','b',85000);step(p,0,[],{steps:0},'0');step(p,5000,[a],{steps:0});
 assert.equal(step(p,20000,[a],{steps:200,stepsFresh:true}).distanceSource,'time-estimate');
 step(p,85000,[a,b],{steps:250,stepsFresh:true});const near=step(p,115000,[a,b],{steps:470,stepsFresh:true,cadence:160});assert.equal(near.stage,'NEAR_POINT');assert.equal(near.cadence,160);assert.equal(near.distanceSource,'calibrated-steps');
});
test('foreground test stops at maximum duration',()=>{const p=policy.create();step(p,0,[],{},'0');assert.equal(step(p,7200000,[],{},'0').stage,'LIMIT');});
test('final checkpoint arriving with ended status is counted; a long ambiguous gap is not a fabricated segment',()=>{
 const h=learned();const end=step(h.p,165000,[h.a,h.b,event('end','a',165000)],{},'2');assert.equal(end.stop,true);assert.equal(end.completedLaps,1);assert.match(end.message,/最后的打卡/);
 const x=learned();const late=step(x.p,900000,[x.a,x.b,event('late','a',900000)]);assert.equal(late.confirmedSegments,1);assert.equal(late.estimated200Seconds,null);assert.equal(late.type,'UNCERTAIN');
});
test('unordered initial history establishes no invented anchor or start-of-run claim',()=>{
 const p=policy.create(),old=[{id:'old1',station:'a',timeMs:null},{id:'old2',station:'b',timeMs:null}];
 step(p,0,old);const next=step(p,80000,[...old,{id:'new',station:'a',timeMs:null}]);
 assert.equal(next.confirmedSegments,0);assert.match(next.message,/监测圈数起点/);assert.equal(next.estimated200Seconds,null);
});
test('fresh zero GPS stays zero and selected distance source follows actual estimate',()=>{
 const p=policy.create(),a=event('a','a',5000),b=event('b','b',85000);
 step(p,0,[],{gpsMeters:0,steps:0},'0');step(p,5000,[a],{gpsMeters:0,steps:0});step(p,85000,[a,b],{gpsMeters:200,steps:250});
 const stationaryDistance=step(p,100000,[a,b],{gpsMeters:200,gpsFresh:true});assert.equal(stationaryDistance.estimatedSegmentMeters,0);
 const stepsWin=step(p,110000,[a,b],{gpsMeters:220,gpsFresh:true,steps:350,stepsFresh:true});assert.equal(stepsWin.distanceSource,'calibrated-steps');assert.equal(stepsWin.estimatedSegmentMeters,80);
});
test('motion rejects stale or inaccurate GPS and impossible jumps without exposing coordinates',()=>{
 const m=motion.create();assert.equal(m.location({lat:39,lon:116,accuracy:50,at:0},0),false);
 assert.equal(m.location({lat:39,lon:116,accuracy:5,at:0},0),true);
 assert.equal(m.location({lat:40,lon:116,accuracy:5,at:3000},3000),false);
 assert.equal(m.location({lat:39.00005,lon:116,accuracy:5,at:3000},3000),true);
 const data=m.snapshot(3000);assert.ok(data.gpsMeters>5&&data.gpsMeters<6);assert.equal(data.gpsFresh,true);assert.ok(!JSON.stringify(data).includes('116'));
 assert.equal(m.snapshot(14000).gpsFresh,false);
});
test('stationary good GPS is recognised and counter reset does not create negative cadence',()=>{
 const m=motion.create();for(let at=0;at<=36000;at+=3000)m.location({lat:39,lon:116,accuracy:5,at},at);
 assert.equal(m.snapshot(36000).stationary,true);assert.equal(m.snapshot(36000).gpsMeters,0);
 m.step(100,0);m.step(120,10000);assert.equal(m.snapshot(10000).cadence,120);m.step(1,20000);assert.equal(m.snapshot(20000).cadence,null);
});
