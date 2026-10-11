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
