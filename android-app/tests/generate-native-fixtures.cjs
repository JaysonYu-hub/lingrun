const fs=require('node:fs'),path=require('node:path');
const policy=require('../../api-test/adaptive-run.js'),core=require('../../quark-api/core.cjs')();
const out=path.join(__dirname,'../build/fixtures');fs.mkdirSync(out,{recursive:true});
const epoch=1790400000000;
const A='a,A,5000',B='b,B,85000',C='c,A,165000';
const scenarios={
 normal:[[0,'0',''],[5000,'1',A],[85000,'1',A+';'+B],[90000,'1',A+';'+B],[145000,'1',A+';'+B],[165000,'1',A+';'+B+';'+C],[170000,'1',A+';'+B+';'+C],[245000,'2',A+';'+B+';'+C+';d,B,245000']],
 late:[[0,'0',''],[5000,'1',A],[85000,'1',A+';'+B],[200000,'1',A+';'+B],[210000,'1',A+';'+B],[240000,'1',A+';'+B],[245000,'1',A+';'+B+';c,A,220000']],
 repeated:[[0,'0',''],[5000,'1',A],[85000,'1',A+';'+B],[130000,'1',A+';'+B+';repeat,B,130000'],[135000,'1',A+';'+B+';repeat,B,130000'],[200000,'1',A+';'+B+';repeat,B,130000;x,C,200000']],
 history:[[90000,'1',A+';'+B],[95000,'1',A+';'+B+';old,A,20000'],[100000,'1',A+';'+B+';short,A,87000'],[900000,'1',A+';'+B+';long,A,900000']],
 batch:[[0,'0',''],[5000,'1',A],[250000,'1',A+';'+B+';'+C],[260000,'1',A+';'+B+';'+C+';u,A,?;v,B,?']],
 gps:[[0,'0','',0],[5000,'1',A,0],[45000,'1',A,170],[50000,'1',A,235],[65000,'1',A,240]],
 pause:[[0,'0',''],[5000,'1',A],[85000,'1',A+';'+B],[200000,'1',A+';'+B,0,true],[240000,'1',A+';'+B,0,true],[250000,'1',A+';'+B,0,false]],
 limit:[[0,'0',''],[125000,'0',''],[7200000,'0','']]
};
const lines=[];for(const [name,rows] of Object.entries(scenarios)){const p=policy.create();for(const [now,status,spec,gps,stationary]of rows){const events=spec?spec.split(';').map(s=>{const [id,station,time]=s.split(',');return{id,station,timeMs:time==='?'?null:epoch+Number(time)};}):[];
 const d=p.update({ok:true,sample:{status,runKey:'same',checkpointEvents:events}},now,{gpsMeters:gps,gpsFresh:gps!==undefined,stationary:!!stationary},epoch+now);
 const expected=[d.stage,d.type??'-',d.confirmedSegments??'*',d.completedLaps??'*',d.nextMs??0,d.stop?'*':d.estimated200Seconds??'-',d.stop];
 lines.push([name,now,status,spec||'-',gps??'-',!!stationary,...expected].join('\t'));
}}
fs.writeFileSync(path.join(out,'native-policy.tsv'),lines.join('\n')+'\n');
fs.writeFileSync(path.join(out,'signatures.json'),JSON.stringify([{userId:'u'},{userId:'u',amId:'a',pmId:'b'},{userId:'u',amId:null,pmId:''}].map(fields=>({fields,sign:core.sign(fields).sign})),null,2));
console.log(`Generated ${lines.length} JS→Java policy comparison steps and 3 signing fixtures.`);
