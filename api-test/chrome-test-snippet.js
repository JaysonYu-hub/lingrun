(function(){if(!['webvpn.dlut.edu.cn','202.118.65.138'].includes(location.hostname)||!location.hash.startsWith('#/extExercise'))throw Error('请在已登录的学校健身长跑页面运行');(function(){var core=(function createCore() {
  const origin = 'http://202.118.65.138:8081';
  function sha1(text) {
    const bytes = new TextEncoder().encode(text);
    const size = Math.ceil((bytes.length + 9) / 64) * 64;
    const buffer = new Uint8Array(size); buffer.set(bytes); buffer[bytes.length] = 128;
    const view = new DataView(buffer.buffer);
    view.setUint32(size - 8, Math.floor(bytes.length / 0x20000000));
    view.setUint32(size - 4, (bytes.length * 8) >>> 0);
    let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const rotate = (n, bits) => (n << bits) | (n >>> (32 - bits));
    for (let offset = 0; offset < size; offset += 64) {
      const w = new Int32Array(80);
      for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
      for (let i = 16; i < 80; i++) w[i] = rotate(w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16], 1);
      let [a,b,c,d,e] = h;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const next = (rotate(a,5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = rotate(b,30); b = a; a = next;
      }
      h = h.map((v,i) => (v + [a,b,c,d,e][i]) | 0);
    }
    return h.map(n => (n >>> 0).toString(16).padStart(8,'0')).join('').toUpperCase();
  }
  function sign(fields) {
    const pairs = Object.keys(fields).sort().filter(key => {
      if (!['userId','amId','pmId'].includes(key)) throw Error('未知查询字段');
      if (fields[key] != null && typeof fields[key] !== 'string') throw Error('ID必须为字符串');
      return fields[key] != null && fields[key] !== '';
    }).map(key => key + '=' + fields[key]);
    pairs.push('key=8d6c5b73a50d4707bd71c93882ddbc8b');
    return {...fields, sign: sha1(pairs.join('&'))};
  }
  function parse(body, period) {
    if (!['amDel','pmDel'].includes(period) || body?.status !== 'PASS') throw Error('接口未返回成功状态');
    const d = body[period];
    const scalar = x => (typeof x === 'string' && x.trim() !== '') || (typeof x === 'number' && Number.isFinite(x));
    if (!d || !scalar(d.distance) || !scalar(d.time) || !scalar(d.exercise_run_status)) throw Error('接口字段不完整');
    const raw = d.running_countdown_time;
    const seconds = raw == null || raw === '' ? null : Number(raw);
    if (seconds !== null && (!Number.isInteger(seconds) || seconds < 0 || typeof raw === 'boolean')) throw Error('倒计时格式无法确认');
    return {
      period, distance: String(d.distance), totalTime: String(d.time), status: String(d.exercise_run_status),
      remaining: seconds,
      // 只保存变化标识，不导出全部踩点信息。
      checkpoint: JSON.stringify(Array.isArray(d.tag_path) ? d.tag_path.map(p => [p.reader_id,p.date_time]) : []),
    };
  }
  function secondsText(seconds) {
    const n = Math.max(0, Math.floor(seconds));
    return (n >= 60 ? Math.floor(n/60) + '分' : '') + n % 60 + '秒';
  }
  function remaining(sample, receivedAt, now, staleMs) {
    if (!sample || now - receivedAt > staleMs || now < receivedAt || sample.status !== '1' || sample.remaining == null) return null;
    return Math.max(0, sample.remaining - Math.floor((now-receivedAt)/1000));
  }
  function meaningful(before, after, beforeAt, now) {
    if (!before) return true;
    if (['period','distance','totalTime','status','checkpoint'].some(k => before[k] !== after[k])) return true;
    if ((before.remaining == null) !== (after.remaining == null)) return true;
    if (after.remaining == null) return false;
    const expected = Math.max(0, before.remaining - Math.floor((now-beforeAt)/1000));
    // 正常倒数不是新成绩；服务器校时或踩点重置超过3秒才作为新变化。
    return Math.abs(after.remaining - expected) > 3;
  }
  function summary(sample, seconds) {
    const label = sample.period === 'amDel' ? '早操' : '晚操';
    const duration = sample.totalTime.replace(/:/g,'比');
    return label + '，路程' + sample.distance + '，总用时' + duration + '。' +
      (seconds === null ? '当前无有效检查点倒计时。' : '到下一个检查点还剩' + secondsText(seconds) + '。');
  }
  function threshold(previous, current, already) {
    if (previous == null || current == null) return null;
    const crossed = [60,30,10,0].filter(n => previous > n && current <= n && !already.has(n));
    crossed.forEach(n => already.add(n));
    return crossed.length ? Math.min(...crossed) : null;
  }
  return {origin,sha1,sign,parse,remaining,meaningful,summary,threshold,secondsText};
})();var install=(function installApiTest(core, scope) {
  scope=scope||window;
  if (scope.__exerciseApiTest) return scope.__exerciseApiTest;
  var location=scope.location;
  var state={busy:false,result:null}, xhr=null, generation=0;
  function resolveSession(endpoint){
    var info={source:'none',localToken:false,localUser:false,sessionToken:false,sessionUser:false,scopedPairs:0,otherPairs:0,storageErrors:0,truncated:false,requestAuthSeen:false,matchedPairs:0};
    var candidates=[],exact=[],stores=[];
    var observed=Array.isArray(scope.__exerciseObservedAuth)?scope.__exerciseObservedAuth:[],fingerprint=null;
    for(var a=observed.length-1;a>=0;a--){
      try{var item=observed[a],url=new URL(item.url),age=Date.now()-item.at;
        if(url.origin===location.origin&&url.pathname===endpoint.pathname&&!url.username&&!url.password&&age>=0&&age<=300000&&/^[a-f0-9]{40}$/i.test(item.digest)){fingerprint=item.digest.toLowerCase();info.requestAuthSeen=true;break;}
      }catch(ignored){}
    }
    function valid(value){return typeof value==='string'&&value.trim()!==''&&value!=='null'&&value!=='undefined';}
    function belongs(namespace){
      var value=namespace;
      for(var n=0;n<2;n++){try{var decoded=decodeURIComponent(value);if(decoded===value)break;value=decoded;}catch(ignored){break;}}
      if(/(^|[^0-9A-Za-z.])202\.118\.65\.138:8081(?=$|[^0-9A-Za-z.])/.test(value))return true;
      var mapping=/\/http-8081\/([a-f0-9]{16,})\//i.exec(location.pathname);
      return !!(mapping&&value.indexOf(mapping[1])>=0);
    }
    ['local','session'].forEach(function(name){
      var storage;try{storage=scope[name+'Storage'];}catch(ignored){info.storageErrors++;return;}
      if(!storage||typeof storage.getItem!=='function')return;
      stores.push({name:name,storage:storage});
      try{
        var token=storage.getItem('tokenMobile'),user=storage.getItem('userid');
        info[name+'Token']=valid(token);info[name+'User']=valid(user);
        if(valid(token)&&valid(user))exact.push({token:token,userId:user,source:name+'-exact'});
      }catch(ignored){info.storageErrors++;}
    });
    // Preserve existing unprefixed behavior. Never combine keys from different stores.
    if(exact.length){info.source=exact[0].source;return {value:exact[0],diagnostics:info};}
    stores.forEach(function(entry){
      try{
        var storage=entry.storage,count=Number(storage.length)||0,keys=[],names=Object.create(null);
        if(count>512){info.truncated=true;return;}
        if(typeof storage.key!=='function')return;
        for(var i=0;i<count;i++){var key=storage.key(i);if(typeof key==='string'){keys.push(key);names[key]=true;}}
        keys.forEach(function(key){
          var at=key.indexOf('tokenMobile');if(at<0||key.indexOf('tokenMobile',at+1)>=0)return;
          var prefix=key.slice(0,at),suffix=key.slice(at+11),pair=prefix+'userid'+suffix;
          if((!prefix&&!suffix)||!names[pair])return;
          // An unknown namespace is used only if its authorization matches the live sports request.
          if(!belongs(prefix+' '+suffix)){
            info.otherPairs++;
            if(!fingerprint)return;
            var candidateToken=storage.getItem(key);
            if(!valid(candidateToken)||core.sha1(candidateToken).toLowerCase()!==fingerprint)return;
            var candidateUser=storage.getItem(pair);info.matchedPairs++;
            if(valid(candidateUser))candidates.push({token:candidateToken,userId:candidateUser,source:entry.name+'-observed'});
            return;
          }
          info.scopedPairs++;
          var token=storage.getItem(key),user=storage.getItem(pair);
          if(valid(token)&&valid(user))candidates.push({token:token,userId:user,source:entry.name+'-scoped'});
        });
      }catch(ignored){info.storageErrors++;}
    });
    if(candidates.length===1&&!info.truncated){info.source=candidates[0].source;return {value:candidates[0],diagnostics:info};}
    if(candidates.length>1)info.source='ambiguous';
    return {value:null,diagnostics:info};
  }
  function stop(){generation++;if(xhr)xhr.abort();xhr=null;state.busy=false;state.result=null;}
  function start(period,nativeOnly){
    if(state.busy)return;
    if(period!=='amDel'&&period!=='pmDel')throw Error('考勤参数错误');
    stop();var id=generation;state.busy=true;
    function done(result){if(id!==generation)return;state.result=result;state.busy=false;xhr=null;}
    var diagnostics={version:'2026-09-26-session-r3',phase:'DISCOVERY',httpStatus:null,resourceCount:0,nativeCount:0,ruleSeen:0,detailSeen:0,crossOriginSeen:0,source:'none'};
    function fail(message){done({ok:false,message:message,diagnostics:diagnostics});}
    try{
      if(!((location.protocol==='https:'&&location.hostname==='webvpn.dlut.edu.cn')||(location.protocol==='http:'&&location.host==='202.118.65.138:8081')))return fail('请在学校 WebVPN 或原站的健身长跑页面开始');
      if(location.pathname.indexOf('/mobilenew/')<0||location.hash.indexOf('#/extExercise')!==0)return fail('请先手动进入健身长跑页面');
      // Use a request URL actually issued by the school's frontend, including VPN rewriting.
      var entries=[];
      try{entries=scope.performance.getEntriesByType('resource');}catch(ignored){}
      var native=Array.isArray(scope.__exerciseObservedRequests)?scope.__exerciseObservedRequests:[];
      diagnostics.resourceCount=entries.length;diagnostics.nativeCount=native.length;
      var candidates=entries.map(function(e){return {name:e.name,source:'timing'};}).concat(native.map(function(name){return {name:name,source:'webview'};}));
      var selected=null,detail=null;
      for(var i=candidates.length-1;i>=0;i--){
        var url;try{url=new URL(candidates[i].name,location.href);}catch(ignored){continue;}
        var match=/\/mobile\/extExercise\/(findExeRule|findExtExercise)\/?$/.exec(url.pathname);
        if(!match)continue;
        if(match[1]==='findExeRule')diagnostics.ruleSeen++;else diagnostics.detailSeen++;
        if(url.origin!==location.origin||url.username||url.password){diagnostics.crossOriginSeen++;continue;}
        if(match[1]==='findExeRule'&&!selected)selected={url:url,source:candidates[i].source+'-rule'};
        if(match[1]==='findExtExercise'&&!detail)detail={url:url,source:candidates[i].source+'-detail-prefix'};
      }
      selected=selected||detail;
      if(!selected)return fail(diagnostics.crossOriginSeen?'发现学校接口请求，但与当前页面不同源；请保留新版报告以适配，暂不跨域发送凭据。':'网页和WebView均未记录到可用接口；请点登录首页后重新进入健身长跑。若仍失败，请提供新版JSON报告。');
      diagnostics.source=selected.source;
      function requestUrl(method){var u=new URL(selected.url.href);u.pathname=u.pathname.replace(/(findExeRule|findExtExercise)\/?$/,method);u.hash='';return u.href;}
      diagnostics.phase='SESSION';
      var session=resolveSession(selected.url);diagnostics.session=session.diagnostics;
      if(!session.value)return fail(session.diagnostics.source==='ambiguous'?'发现多组本站登录信息，无法确定当前使用哪组；未发送请求，请提供本次脱敏报告。':'网页位置正确，但脚本尚未取得可用的业务会话；不代表你未登录。请提供本次会话识别报告，无需反复重新登录。');
      var token=session.value.token,userId=session.value.userId;
      // Explicit in-process handoff for the Android foreground service. Never persisted or logged.
      if(nativeOnly){done({ok:true,privateSession:{ruleUrl:requestUrl('findExeRule'),detailUrl:requestUrl('findExtExercise'),origin:location.origin,referer:location.href||'',userAgent:scope.navigator?String(scope.navigator.userAgent||''):'',token:token,userId:userId,period:period}});return;}
      function query(method,fields,next){
        if(id!==generation)return;
        diagnostics.phase=method==='findExeRule'?'RULE':'DETAIL';diagnostics.httpStatus=null;
        xhr=new scope.XMLHttpRequest();var current=xhr;
        current.open('POST',requestUrl(method),true);current.timeout=15000;current.withCredentials=true;
        current.setRequestHeader('Content-Type','application/json;charset=UTF-8');
        current.setRequestHeader('Authorization',token);
        current.onload=function(){
          if(id!==generation)return;
          diagnostics.httpStatus=current.status;
          var abnormal=current.getResponseHeader('abnormal');
          if(abnormal==='TIMEOUT'||abnormal==='NOFUN')return fail('登录失效或无权限，请重新登录');
          if(current.status!==200)return fail('接口 HTTP 状态异常：'+current.status);
          var data;try{data=JSON.parse(current.responseText);}catch(e){return fail('接口返回非 JSON，可能跳回登录页');}
          if(data.status!=='PASS')return fail('接口业务状态未成功');
          try{next(data);}catch(e){fail('接口字段不完整或格式异常');}
        };
        current.onerror=function(){fail('网络查询失败，请检查 WebVPN 会话');};
        current.ontimeout=function(){fail('接口查询超时，已停止');};
        current.send(JSON.stringify(core.sign(fields)));
      }
      query('findExeRule',{userId:userId},function(rule){
        if(String(rule.isRun)==='0')return done({ok:true,stage:'RULE',waiting:true,period:period,diagnostics:diagnostics,message:'当前规则未开放跑步详情，等待可查询状态；未读取到路程或倒计时。'});
        if(rule.isRun==null)return fail('规则响应缺少 isRun 字段');
        var fields={userId:userId,amId:rule.amId==null?null:String(rule.amId),pmId:rule.pmId==null?null:String(rule.pmId)};
        query('findExtExercise',fields,function(body){
          var raw=body[period];
          function checkpointMetadata(sample){
            var rows=raw&&Array.isArray(raw.tag_path)?raw.tag_path:[];
            sample.runKey=core.sha1(period+'|'+String(period==='amDel'?rule.amId:rule.pmId));
            sample.checkpointEvents=rows.slice(-256).filter(function(row){return row&&row.reader_id!=null&&row.date_time!=null;}).map(function(row){
              var text=String(row.date_time),time=null;
              // Only full dated timestamps. Unknown/time-only formats remain unknown.
              if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(text)){var parsed=Date.parse(text.replace(' ','T'));if(isFinite(parsed))time=parsed;}
              return {id:core.sha1(String(row.reader_id)+'|'+text),station:core.sha1(String(row.reader_id)),timeMs:time};
            });
            return sample;
          }
          if(raw&&raw.exercise_run_status!=null&&String(raw.exercise_run_status)!=='1'){
            var value=function(v){return typeof v==='string'||typeof v==='number'?String(v):'无';};
            var inactive=checkpointMetadata({period:period,status:String(raw.exercise_run_status),distance:value(raw.distance),totalTime:value(raw.time),remaining:null});
            return done({ok:true,stage:'DETAIL',waiting:true,period:period,sample:inactive,diagnostics:diagnostics,message:'当前所选考勤没有进行中的跑步。路程'+inactive.distance+'，总用时'+inactive.totalTime+'。'});
          }
          var sample=core.parse(body,period);
          // Do not export checkpoint locations, user IDs, tokens or full responses.
          sample.checkpointRevision=core.sha1(sample.checkpoint);
          delete sample.checkpoint;
          checkpointMetadata(sample);
          done({ok:true,stage:'DETAIL',waiting:false,sample:sample,diagnostics:diagnostics,message:core.summary(sample,sample.remaining)});
        });
      });
    }catch(e){fail('初始化查询失败，请确认登录和网页兼容性');}
  }
  function takeNativeSession(period){stop();start(period,true);var value=state.result;state.result=null;return value;}
  scope.__exerciseApiTest={start:start,stop:stop,state:state,takeNativeSession:takeNativeSession};
  return scope.__exerciseApiTest;
});install(core);window.__exerciseApiSelfCheck=function(){return (function selfCheck(install,core){
  var results=[];
  function check(name,fn){try{if(!fn())throw Error('assert');results.push({name:name,status:'PASS',source:'SIMULATED'});}catch(e){results.push({name:name,status:'FAIL',source:'SIMULATED'});}}
  function fixture(mode){
    var calls=[],last=null;
    var root={location:{protocol:'https:',hostname:'webvpn.dlut.edu.cn',origin:'https://webvpn.dlut.edu.cn',pathname:'/http-8081/test/mobilenew/',hash:'#/extExercise'},
      performance:{getEntriesByType:function(){return mode==='noendpoint'?[]:[{name:'https://webvpn.dlut.edu.cn/http-8081/test/service/mobile/extExercise/findExeRule'}];}},
      localStorage:{getItem:function(k){return mode==='nologin'?null:k==='userid'?'synthetic-user':'synthetic-token';}}};
    root.XMLHttpRequest=function(){last=this;};
    root.XMLHttpRequest.prototype={open:function(method,url){this.url=url;this.method=method;},setRequestHeader:function(){},abort:function(){this.aborted=true;},getResponseHeader:function(){return mode==='expired'?'TIMEOUT':null;},send:function(body){
      calls.push({method:this.method,url:this.url,body:JSON.parse(body)});if(mode==='pending')return;
      if(mode==='network'){this.onerror();return;}if(mode==='timeout'){this.ontimeout();return;}
      this.status=200;
      this.responseText=mode==='html'?'<html>login</html>':JSON.stringify(this.url.slice(-11)==='findExeRule'?{status:'PASS',isRun:mode==='waiting'?'0':'1',amId:'a',pmId:'b'}:{status:'PASS',amDel:{exercise_run_status:'1',distance:'200米',time:'80秒',running_countdown_time:mode==='invalid'?-1:90}});
      this.onload();
    }};
    var api=install(core,root);
    api.start('amDel');return {api:api,calls:calls,last:function(){return last;}};
  }
  check('规则到详情的签名查询',function(){var x=fixture('normal');return x.calls.length===2&&/^[A-F0-9]{40}$/.test(x.calls[0].body.sign)&&x.api.state.result.sample.remaining===90;});
  check('未开放详情时等待',function(){var x=fixture('waiting');return x.calls.length===1&&x.api.state.result.waiting&&!x.api.state.result.sample;});
  ['expired','network','timeout','html','invalid','nologin','noendpoint'].forEach(function(mode){
    var names={expired:'登录过期停止',network:'断网停止',timeout:'请求超时停止',html:'登录页不当数据',invalid:'拒绝异常倒计时',nologin:'无凭据不查询',noendpoint:'不猜测接口地址'};
    check(names[mode],function(){var x=fixture(mode);return x.api.state.result.ok===false&&!x.api.state.busy;});
  });
  check('无重叠请求且停止丢弃晚到结果',function(){var x=fixture('pending');x.api.start('amDel');if(x.calls.length!==1)return false;var request=x.last();x.api.stop();request.status=200;request.responseText='{}';request.onload();return request.aborted&&!x.api.state.busy&&x.api.state.result===null;});
  check('普通倒数静默，检查点重置播报',function(){var a={period:'amDel',distance:'200米',totalTime:'80秒',status:'1',checkpoint:'x',remaining:90};var b=Object.assign({},a,{remaining:60}),c=Object.assign({},b,{remaining:120});return !core.meaningful(a,b,0,30000)&&core.meaningful(a,c,0,30000);});
  return results;
})(install,core);};})();
var module={exports:{}};'use strict';
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

(function chromePanel(workflow){
  if(window.__exerciseChromePanel){window.__exerciseChromePanel.show();return;}
  if(!['webvpn.dlut.edu.cn','202.118.65.138'].includes(location.hostname)||!location.hash.startsWith('#/extExercise'))throw Error('请在已登录的学校健身长跑页面加载此脚本');
  const host=document.createElement('div');host.id='exercise-chrome-test';
  Object.assign(host.style,{position:'fixed',bottom:'8px',left:'8px',right:'8px',zIndex:'2147483647'});
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=':host{font:14px system-ui;color:#172535}section{background:#fff;border:2px solid #147c7a;border-radius:12px;padding:12px;box-shadow:0 6px 24px #0003}h2{font-size:17px;margin:0 0 8px}button,select{font:inherit;min-height:40px;margin:3px;padding:6px 10px;border:1px solid #a9bdc5;border-radius:6px;background:#eef6f6;color:#172535}button:disabled{opacity:.5}pre{white-space:pre-wrap;max-height:160px;overflow:auto;font:13px system-ui;margin:8px 0}small{color:#466}';shadow.appendChild(style);
  const box=document.createElement('section');shadow.appendChild(box);
  const title=document.createElement('h2');title.textContent='Chrome · API 语音测试';box.appendChild(title);
  const select=document.createElement('select');select.setAttribute('aria-label','考勤');[['amDel','早操'],['pmDel','晚操']].forEach(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);});box.appendChild(select);
  function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;box.appendChild(b);return b;}
  let report=null,active=false,gen=0,timers=[],previous=null,at=0,round=0,confirmAction=null;
  const start=button('开始全面测试',begin);
  button('停止',()=>finish('USER_STOP'));
  button('导出报告',download);
  button('移除面板',()=>{if(active)finish('USER_STOP');document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leaving);window.removeEventListener('hashchange',leaving);host.remove();delete window.__exerciseChromePanel;});
  const status=document.createElement('pre');status.setAttribute('role','status');status.textContent='点击开始前保持学校页面已加载。5轮查询，无需刷新或无障碍。';box.appendChild(status);
  const yes=button('听到了',()=>answer(true)),no=button('未听到',()=>answer(false));yes.hidden=no.hidden=true;
  const hint=document.createElement('small');hint.textContent='前台测试约2–4分钟；后台暂停，刷新后需重新加载面板。';box.appendChild(hint);document.body.appendChild(host);
  function after(fn,ms){const id=gen;const t=setTimeout(()=>{if(id===gen)fn();},ms);timers.push(t);return t;}
  function check(name,result,message,source='BROWSER'){report.checks.push({name,status:result,message,source});}
  function cancel(){gen++;timers.forEach(clearTimeout);timers=[];window.__exerciseApiTest.stop();window.speechSynthesis?.cancel();confirmAction=null;yes.hidden=no.hidden=true;}
  function finish(reason){if(!active)return;active=false;cancel();workflow.finish(report,reason);start.disabled=select.disabled=false;status.textContent=workflow.text(report)+'\n点击“导出报告”保存本次结果。';}
  function fail(name,message){check(name,'BLOCKED',message);finish('FAILED');}
  function say(text,kind,next){
    const id=gen,utterance=new SpeechSynthesisUtterance(text),entry={kind,status:'REQUESTED'};report.speech.push(entry);utterance.lang='zh-CN';
    const voice=speechSynthesis.getVoices().find(v=>/^zh[-_]?CN$/i.test(v.lang))||speechSynthesis.getVoices().find(v=>/^zh/i.test(v.lang));if(voice)utterance.voice=voice;
    let settled=false;const timeout=after(()=>complete(false,'播放超时'),25000);
    function complete(ok,reason){if(settled||id!==gen)return;settled=true;clearTimeout(timeout);entry.status=ok?'DONE':'ERROR';if(!ok)fail('浏览器语音',reason||'播放失败，请检查中文语音支持');else next();}
    utterance.onend=()=>complete(true);utterance.onerror=()=>complete(false,'浏览器未能完成中文播报，请检查媒体音量与语音支持');
    try{speechSynthesis.speak(utterance);}catch(e){complete(false,'无法调用浏览器语音');}
  }
  function ask(text,fn){status.textContent=text;confirmAction=fn;yes.hidden=no.hidden=false;}
  function answer(heard){if(!active||!confirmAction)return;const fn=confirmAction;confirmAction=null;yes.hidden=no.hidden=true;fn(heard);}
  function begin(){
    if(active)return;cancel();report=workflow.create(select.value);report.platform='CHROME_PAGE';report.persistence='需点击导出；刷新或关闭会丢失内存报告';active=true;round=0;previous=null;start.disabled=select.disabled=true;
    const checks=window.__exerciseApiSelfCheck();report.simulated=checks;const pass=checks.every(c=>c.status==='PASS');check('模拟自检',pass?'PASS':'FAIL',checks.length+'项隔离模拟检查','SIMULATED');if(!pass){finish('FAILED');return;}
    if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){fail('中文语音引擎','本浏览器没有提供网页TTS接口');return;}
    status.textContent='正在播放中文试听……';
    // Invoked directly by the user's Start click, so browser user activation is preserved.
    say('这是Chrome接口测试的中文试听，不是实际跑步成绩。','TEST',()=>{
      check('中文语音引擎','PASS','浏览器返回播放完成，实际声音需人工确认');
      ask('刚才是否清楚听到了中文试听？',heard=>{check('中文试听确认',heard?'PASS':'FAIL','用户试听确认','USER');if(!heard){finish('FAILED');return;}query();});
    });
  }
  function query(){
    if(!active)return;round++;status.textContent='正在进行真实API查询，第'+round+'/5轮……';
    const deadline=performance.now()+35000;window.__exerciseApiTest.start(report.period);
    function poll(){
      if(!active)return;
      const state=window.__exerciseApiTest.state;
      if(state.busy){if(performance.now()>deadline){fail('真实接口','查询超时');return;}after(poll,300);return;}
      const result=state.result;if(!result){fail('真实接口','页面查询被取消');return;}
      report.samples.push({round,time:new Date().toISOString(),result});if(!result.ok){fail('真实接口第'+round+'轮',result.message);return;}
      check('真实API第'+round+'轮','PASS',result.stage==='DETAIL'?'详情查询成功':'规则查询成功，等待详情开放','LIVE');
      const now=performance.now(),changed=workflow.meaningful(previous,result,at,now);previous=result;at=now;
      status.textContent='第'+round+'/5轮：'+result.message;
      function advance(){
        if(round<5){status.textContent+='\n30秒后自动查询；当前显示的是最近一次读数。';after(query,30000);return;}
        window.__exerciseApiTest.stop();check('自动停止','PASS','已完成5轮，停止调度和接口查询');
        ask('5轮查询已完成。是否听到真实查询结果？等待起跑的提示也算。',heard=>{check('真实结果播报确认',heard?'PASS':'FAIL','用户听感确认','USER');finish('COMPLETE');});
      }
      if(changed)say(result.message,'LIVE',advance);else advance();
    }
    poll();
  }
  function download(){
    if(!report){status.textContent='暂无报告，请先运行测试。';return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='chrome-api-'+Date.now()+'.json';shadow.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function hidden(){if(document.hidden&&active)finish('BACKGROUND');}
  function leaving(){if(active)finish('NAVIGATION');}
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leaving);window.addEventListener('hashchange',leaving);
  window.__exerciseChromePanel={show:()=>{host.hidden=false;},getReport:()=>report};
})(module.exports);})();