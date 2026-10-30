// Generated locally by scripts/prepare-resources.cjs.
(function(){
if(location.protocol!=='https:'||location.hostname!=='webvpn.dlut.edu.cn')return;
var core=(function createCore() {
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
})();
(function installApiTest(core, scope) {
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
})(core,window);
// Executes before page requests. Only records the two sports query paths.
// Tokens are hashed for namespace matching; raw values are never sent to a message handler.
function sportsURL(value) {
  try {
    var url = new URL(value, location.href);
    return url.origin === location.origin && !url.username && !url.password &&
      /\/mobile\/extExercise\/(findExeRule|findExtExercise)\/?$/.test(url.pathname) ? url.href : null;
  } catch (_) { return null; }
}
function observe(url, token) {
  var target = sportsURL(url);
  if (!target) return;
  var requests = window.__exerciseObservedRequests || (window.__exerciseObservedRequests = []);
  if (requests.indexOf(target) < 0) requests.push(target);
  if (requests.length > 32) requests.shift();
  if (typeof token === 'string' && token) {
    var auth = window.__exerciseObservedAuth || (window.__exerciseObservedAuth = []);
    auth.push({url: target, digest: core.sha1(token), at: Date.now()});
    if (auth.length > 32) auth.shift();
  }
}
var open = XMLHttpRequest.prototype.open, set = XMLHttpRequest.prototype.setRequestHeader,
    send = XMLHttpRequest.prototype.send;
var metadata = new WeakMap();
XMLHttpRequest.prototype.open = function(method, url) {
  metadata.set(this, {url: String(url), token: null});
  return open.apply(this, arguments);
};
XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  var item = metadata.get(this);
  if (item && String(name).toLowerCase() === 'authorization') item.token = String(value);
  return set.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function() {
  var item = metadata.get(this);
  if (item) { observe(item.url, item.token); metadata.delete(this); }
  return send.apply(this, arguments);
};
if (typeof window.fetch === 'function') {
  var originalFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      var url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      var headers = new Headers(init && init.headers || input && input.headers || {});
      observe(url, headers.get('Authorization'));
    } catch (_) {}
    return originalFetch.apply(this, arguments);
  };
}

})();
