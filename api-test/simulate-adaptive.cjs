// Offline only: no HTTP, browser, credentials, GPS or school writes.
const fs=require('node:fs'),path=require('node:path');
const policy=require('./adaptive-run.js').create();
const epoch=Date.UTC(2026,8,26,0,0,0);
const cards=[{second:5,station:'A'},{second:85,station:'B'},{second:165,station:'A'},{second:230,station:'B'},{second:350,station:'A'}];
const rows=[];let now=0;
while(now<=385000){
 const events=cards.filter(x=>x.second*1000<=now).map(x=>({id:x.station+x.second,station:x.station,timeMs:epoch+x.second*1000}));
 const state=policy.update({ok:true,sample:{status:now<5000?'0':now>=370000?'2':'1',runKey:'SIMULATION',checkpointEvents:events}},now,{},epoch+now);
 rows.push({seconds:now/1000,stage:state.stage,nextSeconds:state.nextMs==null?null:state.nextMs/1000,confirmedSegments:state.confirmedSegments,completedLaps:state.completedLaps,estimated200Seconds:state.estimated200Seconds,message:state.message});
 if(state.stop)break;now+=state.nextMs;
}
const folder=path.join(__dirname,'output');fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'adaptive-simulation.json'),JSON.stringify({source:'SIMULATED_OFFLINE',notice:'合成时间线，不是学校数据或实跑验收',rows},null,2));
const md=['# 自适应策略离线演示','', '全部为合成事件，未请求学校接口。仅验证程序分支；不能证明真实点位识别、定位或语音已通过。','', '| 秒 | 阶段 | 下次查询间隔/秒 | 已确认区间 | 完成圈数 | 事件提示 |','|---:|---|---:|---:|---:|---|',...rows.map(r=>`| ${r.seconds} | ${r.stage} | ${r.nextSeconds??'停止'} | ${r.confirmedSegments} | ${r.completedLaps} | ${r.message??'静默'} |`)];
fs.writeFileSync(path.join(folder,'adaptive-simulation.md'),md.join('\n')+'\n');
console.log(JSON.stringify({source:'SIMULATED_OFFLINE',queries:rows.length,last:rows.at(-1),artifacts:['output/adaptive-simulation.json','output/adaptive-simulation.md']},null,2));
