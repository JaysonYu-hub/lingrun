(function(){var core=(function createCore() {
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
})(install,core);};})();window.__trackPolicy=(function(){var module={exports:{}};
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

return module.exports;})();