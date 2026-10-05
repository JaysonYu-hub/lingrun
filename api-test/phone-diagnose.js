"ui";
var DIAGNOSTIC_ONLY=true; // build.cjs generates the one-round diagnostic entry.
var RUN_MODE=false; // Separate experimental runner; five-round acceptance remains available.
// AutoJs6 UI mode. No accessibility, OCR, screen reading or synthetic taps.
var base=files.cwd(),workflow,bundle;
try{workflow=require('./phone-workflow.js');bundle=files.read(files.join(base,'page-bundle.js'));}
catch(e){dialogs.alert('测试文件不完整','请完整解压测试包，在 AutoJs6 中进入解压目录运行入口脚本，不要从压缩包直接运行。');exit();}
var ENTRY='https://webvpn.dlut.edu.cn/http-8081/57787a7876706e323032336b657940242a485056ad52cb00fc19b469c2e3/mobilenew/#/index';
var report=null,stem=null,active=false,phase='',generation=0,timers=[],engine=null,ready=false,previous=null,previousAt=0,round=0,spoken=0;
var speechWait={},speechCounter=0;
var runEngine=null,motion=null,motionWantedLocation=false,motionWantedSteps=false,runVoiceBusy=false,pendingRunSpeech=null,lastRunMessage=null;
var runPolicy=null;
if(RUN_MODE)runPolicy=require('./adaptive-run.js');
function ensureMotion(){if(!motion)motion=require('./phone-motion.js').create({activity:activity,android:android,java:java,JavaAdapter:JavaAdapter,ui:ui,now:function(){return Number(android.os.SystemClock.elapsedRealtime());}});return motion;}
function runSay(message,done){
 if(!message){if(done)done();return;}
 lastRunMessage=message;
 if(runVoiceBusy){pendingRunSpeech={message:message,done:done};return;}
 runVoiceBusy=true;
 speak(message,'RUN',function(){runVoiceBusy=false;if(done)done();if(active&&pendingRunSpeech){var next=pendingRunSpeech;pendingRunSpeech=null;runSay(next.message,next.done);}});
}
function handleRun(result,now){
 var decision;
 try{decision=runEngine.update(result,now,motion?motion.snapshot(now):{},Date.now());}catch(e){fail('动态监测','算法状态异常，已停止。');return;}
 if(decision.type==='CARD_CONFIRMED'&&result.message)decision.message+=' '+result.message;
 report.adaptiveSummary=decision;save();
 var text='第'+round+'次查询；阶段：'+decision.stage+'\n已确认'+(decision.confirmedSegments||0)+'个200米区间；完成'+(decision.completedLaps||0)+'圈（本次监测范围）。';
 if(result.sample)text+='\n后台路程'+result.sample.distance+'；总用时'+result.sample.totalTime+'；后台倒计时'+(result.sample.remaining==null?'暂无':result.sample.remaining+'秒')+'（查询时读数）。';
 if(decision.estimated200Seconds!==null&&decision.estimated200Seconds!==undefined)text+='\n预计200米用时'+decision.estimated200Seconds+'秒；区间均速'+decision.estimatedSpeedMps+'米/秒。';
 text+='\n'+(decision.message||'后台没有新增打卡确认，本轮静默。');
 if(decision.stop){setStatus(text);if(decision.message)runSay(decision.message,function(){finish('RUN_ENDED');});else finish('RUN_ENDED');return;}
 setStatus(text+'\n'+Math.round(decision.nextMs/1000)+'秒后查询。');
 // Query scheduling does not wait for speech completion. At most one query is in flight.
 later(nextQuery,decision.nextMs);
 if(decision.message)runSay(decision.message);
}
// Network callbacks run on worker threads. Keep only these two observed endpoint URLs in memory.
var observedRequests=new java.util.concurrent.ConcurrentLinkedQueue();
var observedAuth=new java.util.concurrent.ConcurrentLinkedQueue();
function observedSnapshot(){var values=[],it=observedRequests.iterator();while(it.hasNext()&&values.length<16)values.push(String(it.next()));return values;}
function authSnapshot(){var values=[],it=observedAuth.iterator();while(it.hasNext()&&values.length<16){try{values.push(JSON.parse(String(it.next())));}catch(ignored){}}return values;}
function authFingerprint(value){
 var bytes=java.security.MessageDigest.getInstance('SHA-1').digest(new java.lang.String(value).getBytes('UTF-8')),hex='';
 for(var i=0;i<bytes.length;i++)hex+=('0'+(bytes[i]&255).toString(16)).slice(-2);
 return hex;
}
function later(fn,ms){var gen=generation,t=setTimeout(function(){ui.run(function(){if(gen===generation)fn();});},ms);timers.push(t);return t;}
function setStatus(text){status.setText(text);}
function save(){if(!report||!stem)return true;try{files.write(stem+'.json',JSON.stringify(report,null,2));files.write(stem+'.txt',workflow.text(report));return true;}catch(e){report.ioFailed=true;report.state='BLOCKED';if(active){active=false;cancelWork();start.setEnabled(true);}setStatus('报告无法写入，测试已停止。请检查脚本目录的文件访问权限。');return false;}}
function logCheck(name,state,message,source){report.checks.push({name:name,status:state,message:message,source:source||'DEVICE'});save();}
function cancelWork(){
 generation++;timers.forEach(function(t){clearTimeout(t);});timers=[];speechWait={};if(engine)engine.stop();
 activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
 if(web)web.evaluateJavascript('if(window.__exerciseApiTest)window.__exerciseApiTest.stop();',null);
 if(motion)motion.stop();runVoiceBusy=false;pendingRunSpeech=null;
}
function finish(reason){
 if(!active)return;active=false;cancelWork();workflow.finish(report,reason);save();start.setEnabled(true);
 setStatus(workflow.text(report).split('\n').slice(0,6).join('\n')+'\n点击“查看报告”获取详细结果。');
}
function fail(name,message){if(!active)return;logCheck(name,'BLOCKED',message);finish('FAILED');}
function evaluate(code,callback){
 if(!active)return;
 var gen=generation,answered=false;
 var timeout=later(function(){if(gen===generation&&!answered){answered=true;fail('WebView 执行','页面脚本未响应，请重新进入学校页面后重试。');}},8000);
 try{web.evaluateJavascript('JSON.stringify((function(){'+code+'})())',new android.webkit.ValueCallback({onReceiveValue:function(raw){ui.run(function(){
  if(gen!==generation||answered)return;answered=true;clearTimeout(timeout);
  var data;try{data=JSON.parse(JSON.parse(String(raw)));}catch(e){fail('WebView 兼容','未得到有效结果，请检查系统 WebView 和 AutoJs6 版本。');return;}
  callback(data);
 });}}));}catch(e){clearTimeout(timeout);fail('WebView 执行','无法调用网页脚本，请检查 AutoJs6 和系统 WebView。');}
}
function speak(message,kind,done){
 if(!active)return;
 if(!ready){fail('语音播放','中文语音引擎未就绪');return;}
 var id='test-'+(++speechCounter),gen=generation,entry={id:id,kind:kind,status:'REQUESTED',message:message,requestedAt:new Date().toISOString()};
 if(RUN_MODE&&report.speech.length>=100)report.speech.shift();
 report.speech.push(entry);save();
 speechWait[id]=function(ok){if(gen!==generation)return;entry.status=ok?'DONE':'ERROR';entry.finishedAt=new Date().toISOString();save();if(!ok){fail('语音播放','系统语音合成或播放失败，请检查中文语音包。');return;}done();};
 var result=engine.speak(message,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,id);
 if(result!==0){var cb=speechWait[id];delete speechWait[id];if(cb)cb(false);return;}
 later(function(){if(gen!==generation)return;var cb=speechWait[id];delete speechWait[id];if(cb)cb(false);},25000);
}
function ask(title,message,choices,callback){
 var gen=generation,builder=new android.app.AlertDialog.Builder(activity).setTitle(title).setMessage(message).setCancelable(false);
 function listener(index){return new android.content.DialogInterface.OnClickListener({onClick:function(){if(gen===generation&&active)callback(index);}});}
 builder.setPositiveButton(choices[0],listener(0));builder.setNegativeButton(choices[1],listener(1));
 if(choices[2])builder.setNeutralButton(choices[2],listener(2));builder.show();
}
function begin(){
 if(active)return;cancelWork();report=workflow.create(periods.getCheckedRadioButtonId()===102?'pmDel':'amDel');
 try{var folder=files.join(base,'reports');files.ensureDir(folder+'/');stem=files.join(folder,'phone-'+Date.now());}catch(e){setStatus('无法创建 reports 目录，请检查文件权限。');return;}
 if(DIAGNOSTIC_ONLY){report.mode='DIAGNOSTIC';report.targetRounds=1;}
 if(RUN_MODE){report.mode='ADAPTIVE_EXPERIMENTAL';report.targetRounds=null;report.totalSuccessfulQueries=0;runEngine=runPolicy.create();lastRunMessage=null;}
 active=true;round=0;previous=null;spoken=0;phase='PREFLIGHT';start.setEnabled(false);
 if(!save()){active=false;start.setEnabled(true);return;}logCheck('报告写入','PASS','JSON 和 TXT 报告可写。');
 activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
 if(RUN_MODE&&motion){if(motionWantedLocation)motion.enableLocation();if(motionWantedSteps)motion.enableSteps();}
 setStatus('阶段1/4：检查网页、中文语音与本地模拟逻辑……');
 evaluate(bundle+';return {simulation:window.__exerciseApiSelfCheck(),host:location.hostname,route:location.hash.split("?")[0]};',function(data){
  if(!data||!data.simulation){fail('模拟自检','页面环境不支持测试脚本');return;}
  report.simulated=data.simulation;
  var passed=data.simulation.every(function(x){return x.status==='PASS';});
  logCheck('模拟自检',passed?'PASS':'FAIL',data.simulation.length+'项隔离模拟检查；没有请求学校或修改登录状态。','SIMULATED');
  if(!passed){finish('FAILED');return;}
  if(!((data.host==='webvpn.dlut.edu.cn'||data.host==='202.118.65.138')&&data.route==='#/extExercise')){fail('登录页面位置','请在下方网页手动登录，从首页进入健身长跑，再重新开始。');return;}
  logCheck('页面位置','PASS','位于学校健身长跑；有效登录仍由下一阶段真实请求验证。');
  if(DIAGNOSTIC_ONLY){phase='LIVE';nextQuery();return;}
  var deadline=Date.now()+15000;
  function waitVoice(){if(!active)return;if(ready){
   logCheck('中文语音引擎','PASS','引擎初始化和中文语言支持正常。');phase='SPEECH';
   speak('这是全面测试的中文试听，模拟倒计时一分三十秒，不是实际成绩。','TEST',function(){
    ask('确认测试声音','刚才是否清楚听到了中文试听？',['听到了','未听到'],function(answer){
     logCheck('中文试听确认',answer===0?'PASS':'FAIL','用户实际听感确认。','USER');
     if(answer!==0){finish('FAILED');return;}phase='LIVE';nextQuery();
    });
   });
  }else if(Date.now()>=deadline)fail('中文语音引擎','15秒内未就绪，请先配置系统中文 TTS。');else later(waitVoice,300);}
  waitVoice();
 });
}
function nextQuery(){
 if(!active||phase!=='LIVE')return;round++;var started=Date.now();
 setStatus(RUN_MODE?'动态监测第'+round+'次，正在查询……':'真实 API 第'+round+'/'+report.targetRounds+'轮，正在查询……');
 evaluate('window.__exerciseObservedRequests='+JSON.stringify(observedSnapshot())+';window.__exerciseObservedAuth='+JSON.stringify(authSnapshot())+';window.__exerciseApiTest.start('+JSON.stringify(report.period)+');return {started:true};',function(){
  function readResult(){
   if(!active)return;if(Date.now()-started>35000){fail('真实 API 查询','超过35秒未完成，停止轮询；检查网络或登录。');return;}
   evaluate('return window.__exerciseApiTest?window.__exerciseApiTest.state:null;',function(state){
    if(!state){fail('真实 API 查询','页面已变化，请重新登录或进入健身长跑。');return;}
    if(state.busy){later(readResult,500);return;}
    if(!state.result){fail('真实 API 查询','查询已取消，未取得有效数据。');return;}
    var result=state.result,now=Number(android.os.SystemClock.elapsedRealtime());
    var savedResult=result;
    if(RUN_MODE){savedResult=JSON.parse(JSON.stringify(result));if(savedResult.sample)delete savedResult.sample.checkpointEvents;if(report.samples.length>=180)report.samples.shift();}
    report.samples.push({round:round,time:new Date().toISOString(),result:savedResult});save();
    if(!result.ok){fail('真实 API 第'+round+'轮',result.message);if(DIAGNOSTIC_ONLY)showReport();return;}
    if(RUN_MODE){report.totalSuccessfulQueries++;handleRun(result,now);return;}
    logCheck('真实 API 第'+round+'轮','PASS',result.stage==='DETAIL'?'已取得详情 JSON。':'已取得规则 JSON；详情尚未开放。','LIVE');
    if(DIAGNOSTIC_ONLY){finish('DIAGNOSTIC');showReport();return;}
    var shouldSpeak=workflow.meaningful(previous,result,previousAt,now);previous=result;previousAt=now;
    setStatus('第'+round+'/5轮成功：'+result.message+(shouldSpeak?'':'\n数据无变化，本轮静默。'));
    function advance(){
     if(!active)return;if(round===5){verifyStop();return;}
     setStatus('第'+round+'/5轮完成，30秒后自动查询。\n最近一次：'+result.message+'\n这是查询时读数，不是每秒更新。');later(nextQuery,30000);
    }
    if(shouldSpeak){spoken++;speak(result.message,'LIVE',advance);}else advance();
   });
  }
  readResult();
 });
}
function verifyStop(){
 phase='STOP_CHECK';setStatus('阶段3/4：检查自动停止……');
 evaluate('window.__exerciseApiTest.stop();return window.__exerciseApiTest.state;',function(state){
  var ok=state&&!state.busy&&state.result===null;logCheck('自动停止',ok?'PASS':'FAIL','达到5轮后停止查询；进行中请求的取消已在隔离模拟中检查。');
  if(!ok){finish('FAILED');return;}phase='FINAL_CONFIRM';setStatus('阶段4/4：请确认实际结果播报，随后生成报告。');
  ask('确认真实结果播报','测试期间是否听到了查询结果（等待起跑提示也算）？\n共提交了'+spoken+'次结果播报。',['听到了','未听到','不确定'],function(answer){
   logCheck('真实结果播报确认',answer===0?'PASS':answer===1?'FAIL':'PENDING','人工确认实际结果语音。','USER');finish('COMPLETE');showReport();
  });
 });
}
function showReport(){if(!report){dialogs.alert('暂无报告','请先登录并开始全面测试。');return;}dialogs.alert('验收报告',workflow.text(report)+'\n\n文件：'+stem+'.txt');}
var root=new android.widget.LinearLayout(activity);root.setOrientation(1);root.setPadding(12,8,12,8);
var title=new android.widget.TextView(activity);title.setText(RUN_MODE?'自适应跑步监测 · R4实验版':DIAGNOSTIC_ONLY?'API 接口定位测试 · R4':'API 语音全面测试 · R4');title.setTextSize(17);root.addView(title);
var periods=new android.widget.RadioGroup(activity);periods.setOrientation(0);
['早操','晚操'].forEach(function(name,index){var b=new android.widget.RadioButton(activity);b.setText(name);b.setId(101+index);periods.addView(b);});periods.check(101);root.addView(periods);
var buttons=new android.widget.LinearLayout(activity);buttons.setOrientation(0);root.addView(buttons);
function button(label,fn){var b=new android.widget.Button(activity);b.setText(label);b.setTextSize(12);b.setOnClickListener(new android.view.View.OnClickListener({onClick:fn}));buttons.addView(b,new android.widget.LinearLayout.LayoutParams(0,-2,1));return b;}
var start=button(RUN_MODE?'开始跑步监测':DIAGNOSTIC_ONLY?'开始定位测试':'开始全面测试',begin);button('停止',function(){finish('USER_STOP');});button('查看报告',showReport);button('登录首页',function(){if(active)finish('NAVIGATION');web.loadUrl(ENTRY);});
if(RUN_MODE){
 buttons=new android.widget.LinearLayout(activity);buttons.setOrientation(0);root.addView(buttons);
 button('定位辅助',function(){if(active){setStatus('先停止监测，再设置定位权限；开始后会自动恢复辅助。');return;}var message=ensureMotion().enableLocation();motionWantedLocation=message.indexOf('定位辅助已开启')===0;setStatus(message);});
 button('步频辅助',function(){if(active){setStatus('先停止监测，再设置步频权限；开始后会自动恢复辅助。');return;}var message=ensureMotion().enableSteps();motionWantedSteps=message.indexOf('步频辅助已开启')===0;setStatus(message);});
 button('关闭辅助',function(){if(motion)motion.stop();motionWantedLocation=false;motionWantedSteps=false;motion=null;setStatus('已关闭定位和计步，继续按打卡间隔估算。');});
 button('重播提示',function(){if(active&&lastRunMessage)runSay(lastRunMessage);else setStatus('开始监测并取得结果后，可重播最近提示。');});
}
var status=new android.widget.TextView(activity);status.setTextSize(13);status.setMaxLines(6);root.addView(status);
var web=new android.webkit.WebView(activity);root.addView(web,new android.widget.LinearLayout.LayoutParams(-1,0,1));activity.setContentView(root);
web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
android.webkit.CookieManager.getInstance().setAcceptCookie(true);
function allowed(url){try{var u=new java.net.URI(String(url)),h=String(u.getHost()),p=String(u.getScheme());return p==='https'&&(h==='dlut.edu.cn'||/\.dlut\.edu\.cn$/.test(h))||p==='http'&&h==='202.118.65.138'&&u.getPort()===8081;}catch(e){return false;}}
web.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient,{
 shouldInterceptRequest:function(view,request){
  try{
   var raw=request&&typeof request.getUrl==='function'?String(request.getUrl()):String(request);
   var uri=new java.net.URI(raw),path=String(uri.getPath());
   if(allowed(raw)&&/\/mobile\/extExercise\/(findExeRule|findExtExercise)\/?$/.test(path)){
    if(!observedRequests.contains(raw)){while(observedRequests.size()>=16)observedRequests.poll();observedRequests.add(raw);}
    if(request&&typeof request.getMethod==='function'&&String(request.getMethod())==='POST'&&typeof request.getRequestHeaders==='function'){
     var headers=request.getRequestHeaders(),keys=headers.keySet().iterator();
     while(keys.hasNext()){
      var key=keys.next();if(String(key).toLowerCase()!=='authorization')continue;
      var authorization=String(headers.get(key));
      if(authorization&&authorization!=='null'&&authorization!=='undefined'){
       var evidence=JSON.stringify({url:raw,digest:authFingerprint(authorization),at:Date.now()});
       while(observedAuth.size()>=16)observedAuth.poll();observedAuth.add(evidence);
      }
      break;
     }
    }
   }
  }catch(ignored){}
  return null; // Observe only; the WebView sends the original request unchanged.
 },
 shouldOverrideUrlLoading:function(view,request){var url=request&&typeof request.getUrl==='function'?String(request.getUrl()):String(request);if(!allowed(url)){if(active)fail('页面跳转','不是已确认的学校地址，已拒绝跳转。');else setStatus('不是已确认的学校地址，已拒绝跳转。');return true;}return false;},
 onPageStarted:function(){observedRequests.clear();observedAuth.clear();if(active)finish('NAVIGATION');setStatus('请在下方登录，从学校首页进入健身长跑，待加载完成后点击'+(RUN_MODE?'开始跑步监测':'开始测试')+'。');},
 onReceivedSslError:function(view,handler){handler.cancel();if(active)fail('学校连接','证书校验失败，未继续连接。');else setStatus('证书校验失败，请检查手机时间或学校服务。');}
}));
if(!DIAGNOSTIC_ONLY){
engine=new android.speech.tts.TextToSpeech(activity,new android.speech.tts.TextToSpeech.OnInitListener({onInit:function(code){
 setTimeout(function(){ui.run(function(){try{ready=Number(code)===0&&engine.setLanguage(java.util.Locale.SIMPLIFIED_CHINESE)>=0;}catch(e){ready=false;}});},1);
}}));
engine.setOnUtteranceProgressListener(new JavaAdapter(android.speech.tts.UtteranceProgressListener,{
 onStart:function(id){ui.run(function(){if(!active||!report||!speechWait[String(id)])return;report.speech.forEach(function(entry){if(entry.id===String(id)){entry.startedAt=new Date().toISOString();entry.status='STARTED';}});save();});},onDone:function(id){ui.run(function(){var key=String(id),cb=speechWait[key];delete speechWait[key];if(cb)cb(true);});},
 onError:function(id){ui.run(function(){var key=String(id),cb=speechWait[key];delete speechWait[key];if(cb)cb(false);});}
}));
}
ui.emitter.on('pause',function(){if(active)finish('BACKGROUND');else if(motion)motion.stop();});
ui.emitter.on('back_pressed',function(event){if(active)finish('NAVIGATION');if(web.canGoBack()){web.goBack();event.consumed=true;}});
events.on('exit',function(){if(active){active=false;workflow.finish(report,'EXIT');save();}if(motion)motion.stop();if(engine){engine.stop();engine.shutdown();}});
setStatus('先在下方登录学校，再进入健身长跑。选择早/晚操后点击“'+(DIAGNOSTIC_ONLY?'开始定位测试':'开始全面测试')+'”。');web.loadUrl(ENTRY);
