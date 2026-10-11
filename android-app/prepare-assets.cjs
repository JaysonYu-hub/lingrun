const fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const dest=path.join(__dirname,'app/src/main/assets');fs.mkdirSync(dest,{recursive:true});
const version=JSON.parse(fs.readFileSync(path.join(__dirname,'version.json'),'utf8'));
const manifest=fs.readFileSync(path.join(__dirname,'app/src/main/AndroidManifest.xml'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'app/src/main/java/cn/trackcheck/beta/MainActivity.java'),'utf8');
if(!manifest.includes(`android:versionCode="${version.versionCode}"`)||!manifest.includes(`android:versionName="${version.versionName}"`)||!main.includes(`VERSION="${version.versionName}"`))throw Error('Version files disagree; use bump-version.cjs');
// Build directly from the audited R4 source. Do not download executable runtime code.
const core=require('./runtime/core.cjs'),install=require('./runtime/session.js'),selfCheck=require('./runtime/self-check.cjs');
const moduleSource=(file,name)=>`window.${name}=(function(){var module={exports:{}};\n${fs.readFileSync(path.join(root,file),'utf8')}\nreturn module.exports;})();`;
const base=`(function(){var core=(${core.toString()})();var install=(${install.toString()});install(core);window.__exerciseApiSelfCheck=function(){return (${selfCheck.toString()})(install,core);};})();`;
const shared=moduleSource('runtime/adaptive-run.js','__trackPolicy')+moduleSource('runtime/phone-workflow.js','__trackWorkflow');
fs.writeFileSync(path.join(dest,'app-bundle.js'),base+shared);
const offline=`window.__runOfflineTests=function(){
 var checks=[],p=window.__trackPolicy.create(),events=[],epoch=1790400000000;
 function sample(at,status){return p.update({ok:true,sample:{status:status||'1',runKey:'SIMULATED',checkpointEvents:events}},at,{},epoch+at);}
 function check(name,value){checks.push({name:name,passed:!!value});}
 check('起跑前每5秒查询',sample(0,'0').nextMs===5000);
 events.push({id:'A1',station:'A',timeMs:epoch+5000});check('起跑点不计算完整区间',sample(5000).confirmedSegments===0);
 events.push({id:'B1',station:'B',timeMs:epoch+85000});var half=sample(85000);check('半圈与80秒用时学习',half.confirmedSegments===1&&half.estimated200Seconds===80);
 check('途中降频',sample(90000).nextMs===20000);check('接近点位加频',sample(145000).nextMs===5000);
 events.push({id:'A2',station:'A',timeMs:epoch+165000});check('一圈确认',sample(165000).completedLaps===1);
 check('相同数据保持静默',sample(170000).message===null);
 sample(280000);check('迟到宽限后提醒',sample(290000).type==='POSSIBLE_MISS');check('同段不重复警告',sample(300000).message===null);
 var q=window.__trackPolicy.create();q.update({ok:true,sample:{status:'0',checkpointEvents:[]}},0,{gpsMeters:0});q.update({ok:true,sample:{status:'1',checkpointEvents:[{id:'X',station:'X',timeMs:null}]}},5000,{gpsMeters:0});
 check('定位不能确认打卡',q.update({ok:true,sample:{status:'1',checkpointEvents:[{id:'X',station:'X',timeMs:null}]}},50000,{gpsMeters:250,gpsFresh:true}).confirmedSegments===0);
 return {source:'SIMULATED_OFFLINE',passed:checks.every(function(c){return c.passed;}),checks:checks,notice:'未请求学校，不代表实跑或实际声音通过'};
};`;
fs.writeFileSync(path.join(dest,'offline-bundle.js'),shared+offline);
console.log('Prepared local API, adaptive policy and offline test assets.');
