window.__trackPolicy=(function(){var module={exports:{}};
'use strict';
// Pure experimental policy. Only server checkpoint events can confirm a card.
function finite(n){return typeof n==='number'&&isFinite(n);}
function create(options){
 var cfg=Object.assign({fastMs:5000,cruiseMs:20000,lateMs:15000,startupMs:120000,maxMs:7200000},options||{});
 cfg.fastMs=Math.max(5000,cfg.fastMs);cfg.cruiseMs=Math.max(cfg.fastMs,Math.min(30000,cfg.cruiseMs));
 var began=null,lastNow=null,seen=Object.create(null),stations=[],anchor=null,segments=0,mean=null,deviation=0,runKey=null;
 var wasActive=false,initialized=false,aligned=false,warning=false,lateCount=0,lateAt=null,pauseMs=0,lastPaused=false,unsupported=false;
 var stride=null,baseSteps=null,baseGps=null,lastStatus=null,missingAt=null;
 function markMotion(aux){baseSteps=finite(aux.steps)?aux.steps:null;baseGps=finite(aux.gpsMeters)?aux.gpsMeters:null;}
 function lapText(){var complete=Math.floor(segments/2);return segments%2?'监测后第'+(complete+1)+'圈，半圈已确认。':'监测后第'+complete+'圈已完成。';}
 function pointName(station){var index=stations.indexOf(station);if(index<0){stations.push(station);index=stations.length-1;}if(stations.length>2)unsupported=true;return index===0?'A点':index===1?'B点':'未知点';}
 function resetAnchor(event,now,wall,aux){
  var lag=finite(event.timeMs)&&finite(wall)?wall-event.timeMs:0;
  anchor={event:event,at:now-(lag>=0&&lag<=300000?lag:0),receivedAt:now};
  warning=false;lateCount=0;lateAt=null;pauseMs=0;markMotion(aux);
 }
 function update(result,now,aux,wall){
  aux=aux||{};var message=null,type=null,stop=false;
  if(!finite(now)||lastNow!==null&&now<lastNow)throw Error('单调时钟异常');
  if(began===null)began=now;
  if(lastNow!==null&&lastPaused)pauseMs+=now-lastNow;
  lastNow=now;lastPaused=aux.stationary===true;
  if(!result||!result.ok)return {stage:'ERROR',stop:true,nextMs:null,message:'查询失败，已停止判断打卡。',type:'ERROR'};
  if(now-began>=cfg.maxMs)return {stage:'LIMIT',stop:true,nextMs:null,message:'已达到两小时监测上限。',type:'LIMIT'};
  var sample=result.sample,events=sample&&Array.isArray(sample.checkpointEvents)?sample.checkpointEvents:[];
  if(!sample){var first=missingAt===null;if(first)missingAt=now;if(now-missingAt>=300000)return {stage:'DATA_UNAVAILABLE',type:'DATA_UNAVAILABLE',stop:true,nextMs:null,message:'详情持续五分钟不可用，已停止；这不代表跑步结束。'};return {stage:'WAIT_DATA',type:first?'DATA_UNAVAILABLE':null,stop:false,nextMs:15000,message:first?'暂未取得跑步详情，正在重试。':null,confirmedSegments:segments,completedLaps:Math.floor(segments/2)};}missingAt=null;
  var active=!!sample&&String(sample.status)==='1';
  if(sample&&sample.runKey&&runKey&&sample.runKey!==runKey)return {stage:'RECORD_CHANGED',stop:true,nextMs:null,message:'后台跑步记录已切换，请重新开始监测。',type:'RECORD_CHANGED'};
  if(sample&&sample.runKey)runKey=sample.runKey;
  var fresh=events.filter(function(e){return e&&typeof e.id==='string'&&typeof e.station==='string'&&!seen[e.id];});
  // Multiple records without ordering evidence must not manufacture laps.
  if(fresh.length>1&&fresh.some(function(e){return !finite(e.timeMs);})&&initialized){
   fresh.forEach(function(e){seen[e.id]=true;});
   return {stage:'ORDER_UNKNOWN',stop:true,nextMs:null,message:'收到多条打卡记录但无法确认时间顺序，请核对记录。',type:'ORDER_UNKNOWN'};
  }
  if(fresh.length>1&&fresh.every(function(e){return finite(e.timeMs);}))fresh.sort(function(a,b){return a.timeMs-b.timeMs;});
  if(!initialized){
   initialized=true;aligned=!active;fresh.forEach(function(e){seen[e.id]=true;});
   if(active&&fresh.length&&(fresh.length===1||fresh.every(function(e){return finite(e.timeMs);}))) {var baseline=fresh[fresh.length-1];pointName(baseline.station);resetAnchor(baseline,now,wall,aux);}
   fresh=[];type='BASELINE';message=active?'已接入跑步，已有记录作为基准，圈数从本次监测后计算。':'等待起跑打卡，正在查询后台确认。';
  }
  var confirmed=0,samePoint=false;
  fresh.forEach(function(event){
   seen[event.id]=true;
   if(!active&&!wasActive)return;
   if(!anchor){pointName(event.station);resetAnchor(event,now,wall,aux);type='START';message=aligned?'起跑打卡已确认，开始第1圈。':'新打卡已确认，以此点作为监测圈数起点。';return;}
   if(finite(event.timeMs)&&finite(anchor.event.timeMs)&&event.timeMs<=anchor.event.timeMs)return; // delayed older records
   if(event.station===anchor.event.station){
    var repeatSeconds=finite(event.timeMs)&&finite(anchor.event.timeMs)?(event.timeMs-anchor.event.timeMs)/1000:(now-anchor.receivedAt)/1000;
    if(repeatSeconds>=30){samePoint=true;resetAnchor(event,now,wall,aux);}
    return;
   }
   pointName(event.station);if(unsupported)return;
   var seconds=finite(event.timeMs)&&finite(anchor.event.timeMs)?(event.timeMs-anchor.event.timeMs)/1000:(now-anchor.receivedAt)/1000;
   // Very close alternating reader hits could be reader overlap, not a 200 m segment.
   if(seconds<20){type='UNCERTAIN';message='收到点位变化，但间隔过短，暂不增加圈数。';return;}
   if(seconds>600){resetAnchor(event,now,wall,aux);mean=null;deviation=0;stride=null;type='UNCERTAIN';message='新打卡已收到，但间隔过长，无法确认经过几个区间。本段不增加圈数，重新估算用时。';return;}
   if(seconds<=600){
    var old=mean;mean=old===null?seconds:0.65*old+0.35*seconds;
    deviation=old===null?0:0.65*deviation+0.35*Math.abs(seconds-old);
    var steps=finite(aux.steps)&&baseSteps!==null?aux.steps-baseSteps:0;
    if(fresh.length===1&&steps>=112&&steps<=570){var length=200/steps;stride=stride===null?length:0.7*stride+0.3*length;}
   }
   segments++;confirmed++;resetAnchor(event,now,wall,aux);
  });
  if(unsupported){type='UNSUPPORTED_POINTS';message='后台出现超过两个点位，暂停圈数估算，请核对跑道设置。';stop=true;}
  else if(confirmed){type='CARD_CONFIRMED';message=(confirmed>1?'后台补回'+confirmed+'段打卡记录。':pointName(anchor.event.station)+'打卡成功。')+lapText();}
  else if(samePoint){type='SAME_POINT';message='后台新增同一点位记录，未确认中间点。请核对是否漏卡，确认漏卡且现场安全时再返回补卡。';}
  if(wasActive&&!active){stop=true;type='ENDED';message=(confirmed?'最后的打卡更新已确认。'+lapText():'')+(sample?'后台跑步状态已结束或暂停，监测停止。':'当前规则不再提供详情，监测停止。');}
  else if(active&&!wasActive&&!message){type='START_PENDING';message='后台显示已开始跑步，等待打卡记录确认。';}
  wasActive=active;
  if(sample&&lastStatus!==null&&sample.status!==lastStatus&&!message){type='STATUS';message='跑步状态已更新。';}
  lastStatus=sample?sample.status:lastStatus;
  var elapsed=anchor?Math.max(0,(now-anchor.at-pauseMs)/1000):0;
  var gps=baseGps!==null&&aux.gpsFresh&&finite(aux.gpsMeters)?Math.max(0,aux.gpsMeters-baseGps):null;
  var stepsMeters=stride!==null&&baseSteps!==null&&aux.stepsFresh&&finite(aux.steps)?Math.max(0,(aux.steps-baseSteps)*stride):null;
  var auxiliary=Math.max(gps===null?0:gps,stepsMeters===null?0:stepsMeters);
  var distanceSource=gps!==null&&(stepsMeters===null||gps>=stepsMeters)?'gps-path':stepsMeters!==null?'calibrated-steps':'time-estimate';
  var lead=mean===null?null:Math.max(15,mean*0.25,2*deviation+10);
  var near=anchor&&(auxiliary>=160||mean!==null&&elapsed>=Math.max(0,mean-lead));
  var stage='STARTUP',interval=cfg.fastMs;
  if(!active){stage='WAIT_START';interval=now-began<cfg.startupMs?cfg.fastMs:cfg.lateMs;}
  else if(aux.stationary===true){stage='PAUSED_MOVEMENT';interval=cfg.cruiseMs;}
  else if(anchor&&mean!==null&&!near){stage='CRUISE';interval=Math.min(cfg.cruiseMs,Math.max(cfg.fastMs,(mean-lead-elapsed)*1000));}
  else if(near){stage='NEAR_POINT';interval=cfg.fastMs;}
  else if(anchor&&elapsed>120){stage='LEARNING_SLOW';interval=10000;}
  else if(!anchor&&now-began>=cfg.startupMs){stage='WAIT_FIRST_CARD';interval=cfg.lateMs;}
  var overdue=active&&anchor&&aux.stationary!==true&&((mean!==null&&elapsed>mean+Math.max(20,mean*0.35,2*deviation))||auxiliary>=230);
  if(overdue){
   lateCount++;if(lateAt===null)lateAt=now;
   stage='AWAIT_CONFIRMATION';interval=now-lateAt<=30000?cfg.fastMs:cfg.lateMs;
   if(!warning&&lateCount>=2&&now-lateAt>=10000&&!message){warning=true;type='POSSIBLE_MISS';message='尚未收到下一点打卡确认，可能有延迟或漏卡。若已经过点位，请核对；确认漏卡且现场安全时，再返回补卡。';}
  }else{lateCount=0;lateAt=null;}
  return {stage:stop?type:stage,stop:stop,nextMs:stop?null:Math.round(interval),type:type,message:message,confirmedSegments:segments,completedLaps:Math.floor(segments/2),currentLap:Math.floor(segments/2)+1,lapScope:aligned?'from-start-confirmation':'since-monitor-baseline',estimated200Seconds:mean===null?null:Math.round(mean),estimatedSpeedMps:mean===null?null:Math.round(200/mean*100)/100,estimatedSegmentMeters:Math.round(distanceSource==='time-estimate'?(mean===null?0:200*elapsed/mean):auxiliary),distanceSource:distanceSource,cadence:aux.stepsFresh&&finite(aux.cadence)?Math.round(aux.cadence):null,warning:warning};
 }
 return {update:update};
}
module.exports={create:create};

return module.exports;})();window.__trackWorkflow=(function(){var module={exports:{}};
'use strict';
// ES5 module shared with the AutoJs6 UI and deterministic desktop tests.
function meaningful(before,after,beforeAt,now){
  if(!before)return true;
  if(before.waiting!==after.waiting||before.stage!==after.stage)return true;
  if(after.waiting)return before.message!==after.message;
  var a=before.sample,b=after.sample;
  if(!a||!b)return true;
  if(['period','status','distance','totalTime','checkpointRevision'].some(function(k){return a[k]!==b[k];}))return true;
  if((a.remaining===null)!==(b.remaining===null))return true;
  if(a.remaining===null)return false;
  return Math.abs(b.remaining-Math.max(0,a.remaining-Math.floor((now-beforeAt)/1000)))>3;
}
function create(period){return {schema:2,version:'2026-09-26-adaptive-r4',period:period,started:new Date().toISOString(),state:'RUNNING',targetRounds:5,checks:[],samples:[],speech:[],limitations:['后台和锁屏不在本版支持范围','模拟故障测试不替代真实网络切换验收']};}
function finish(report,reason){
  report.finished=new Date().toISOString();report.reason=reason||'';
  var ok=function(name){return report.checks.some(function(c){return c.name===name&&c.status==='PASS';});};
  var bad=report.ioFailed||report.checks.some(function(c){return c.status==='FAIL'||c.status==='BLOCKED';});
  var rounds=report.samples.filter(function(s){return s.result.ok;}).length;
  var details=report.samples.some(function(s){return s.result.ok&&s.result.stage==='DETAIL';});
  var countdown=report.samples.some(function(s){return s.result.sample&&s.result.sample.remaining!==null;});
  report.coverage={ruleQueries:rounds,detailsReceived:details,countdownReceived:countdown,realCheckpointReset:'PENDING',background:'UNSUPPORTED'};
  if(reason==='USER_STOP'||reason==='BACKGROUND'||reason==='NAVIGATION'||reason==='EXIT')report.state='INTERRUPTED';
  else if(bad)report.state='BLOCKED';
  else if(report.mode==='ADAPTIVE_EXPERIMENTAL')report.state='RUN_STOPPED';
  else if(reason==='DIAGNOSTIC'&&report.mode==='DIAGNOSTIC'&&rounds===1)report.state='PASS_QUERY';
  else if(rounds===report.targetRounds&&ok('中文试听确认')&&ok('真实结果播报确认')&&ok('模拟自检')&&ok('中文语音引擎')&&ok('自动停止'))report.state='PASS_BASIC';
  else report.state='PARTIAL';
  return report;
}
function text(report){
  var labels={RUNNING:'正在测试',RUN_STOPPED:'实验监测已停止；实跑准确性待核验',PASS_QUERY:'单轮接口查询通过；未测试循环和语音',PASS_BASIC:'基础查询和语音链路通过',PARTIAL:'部分完成，仍有待确认项目',BLOCKED:'存在阻塞或失败',INTERRUPTED:'测试被中断'};
  var out=[report.mode==='DIAGNOSTIC'?'手机 API 接口定位报告':'手机 API 全面测试报告',labels[report.state]||report.state,'考勤：'+(report.period==='amDel'?'早操':'晚操'),'开始：'+report.started,'结束：'+(report.finished||'尚未结束'),'真实成功查询：'+report.samples.filter(function(s){return s.result.ok;}).length+'/'+report.targetRounds];
  if(report.mode==='ADAPTIVE_EXPERIMENTAL'){out[0]='自适应跑步监测实验报告';out[5]='真实成功查询累计：'+report.totalSuccessfulQueries+'；仅保留最近180轮摘要';out.push('实跑算法与实际听感仍需人工核验；系统播放回调不代表已听到。');if(report.adaptiveSummary){out.push('监测后确认区间：'+(report.adaptiveSummary.confirmedSegments||0)+'；完成圈数：'+(report.adaptiveSummary.completedLaps||0));out.push('最后阶段：'+report.adaptiveSummary.stage+'；本轮提示：'+(report.adaptiveSummary.message||'静默'));}var voice=report.speech[report.speech.length-1];if(voice)out.push('最近播报：'+voice.message+'；回调状态：'+voice.status);}
  report.checks.forEach(function(c){out.push(c.status+' | '+c.name+' | '+c.message);});
  var last=report.samples.length?report.samples[report.samples.length-1].result:null;
  if(last&&last.diagnostics){var d=last.diagnostics;out.push('接口识别：资源记录'+d.resourceCount+'，WebView记录'+d.nativeCount+'，规则匹配'+d.ruleSeen+'，详情匹配'+d.detailSeen+'，不同源'+d.crossOriginSeen+'，来源'+d.source);}
  if(last&&last.diagnostics&&last.diagnostics.phase)out.push('查询阶段：'+last.diagnostics.phase+'；HTTP：'+(last.diagnostics.httpStatus==null?'未收到响应':last.diagnostics.httpStatus));
  if(last&&last.diagnostics&&last.diagnostics.session){var s=last.diagnostics.session;var mark=function(v){return v?'有':'无';};out.push('会话识别：本地授权'+mark(s.localToken)+'／用户'+mark(s.localUser)+'；会话授权'+mark(s.sessionToken)+'／用户'+mark(s.sessionUser));out.push('会话来源：'+s.source+'；本站命名组'+s.scopedPairs+'；其他命名组'+s.otherPairs+'；读取错误'+s.storageErrors+'；检查截断'+mark(s.truncated));}
  if(last&&last.diagnostics&&last.diagnostics.session){var auth=last.diagnostics.session;out.push('实际请求对照：授权证据'+(auth.requestAuthSeen?'有':'无')+'；匹配字段组'+(auth.matchedPairs||0)+'。其他命名组表示名称未识别，不代表其他账号。');}
  if(report.coverage){out.push('真实详情接口：'+(report.coverage.detailsReceived?'已返回':'待验证'));out.push('真实倒计时：'+(report.coverage.countdownReceived?'已读到，仍需与学校显示核对':'待起跑后验证'));}
  out.push('真实检查点重置：待跑过检查点验证','后台/锁屏：本版不支持','完整数据见同名 JSON。无账号、密码、Cookie 或 Token。');
  return out.join('\n');
}
module.exports={meaningful:meaningful,create:create,finish:finish,text:text};

return module.exports;})();window.__runOfflineTests=function(){
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
};