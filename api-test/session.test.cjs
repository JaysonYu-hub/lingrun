const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const bundle=fs.readFileSync(__dirname+'/page-bundle.js','utf8');
function setup(options={}){
 const calls=[];const origin='https://webvpn.dlut.edu.cn';const base=origin+'/http-8081/test/service/mobile/extExercise/';
 const scope={URL,TextEncoder,Uint8Array,DataView,Int32Array,location:{protocol:'https:',hostname:'webvpn.dlut.edu.cn',origin,pathname:'/http-8081/test/mobilenew/',hash:'#/extExercise'},performance:{getEntriesByType:()=>options.noEndpoint?[]:options.entries||[{name:base+'findExeRule'}]},localStorage:{getItem:key=>options.noLogin?null:key==='userid'?'test-user':'test-token'},__exerciseObservedRequests:options.observed||[]};
 scope.window=scope;
 if(options.local)scope.localStorage=storage(options.local);
 if(options.session)scope.sessionStorage=storage(options.session);
 if(options.authObserved)scope.__exerciseObservedAuth=options.authObserved;
 scope.XMLHttpRequest=class{
  open(method,url){this.method=method;this.url=url;this.headers={};}setRequestHeader(k,v){this.headers[k]=v;}abort(){this.aborted=true;}getResponseHeader(){return options.expired?'TIMEOUT':null;}
  send(data){calls.push({url:this.url,method:this.method,body:JSON.parse(data)});this.status=200;this.responseText=JSON.stringify(new URL(this.url).pathname.endsWith('findExeRule')?{status:'PASS',isRun:options.waiting?'0':'1',amId:'1',pmId:'2'}:{status:'PASS',amDel:{exercise_run_status:'1',distance:'200米',time:'80秒',running_countdown_time:90}});if(!options.pending)this.onload();}
 };
 vm.createContext(scope);vm.runInContext(bundle,scope);return {scope,calls,api:scope.__exerciseApiTest};
}
function storage(values){const keys=Object.keys(values);return {length:keys.length,key:i=>keys[i]??null,getItem:key=>values[key]??null};}
const crypto=require('node:crypto');
test('native handoff resolves only current authorized endpoints without a request and clears private result',()=>{
 const s=setup();const value=s.api.takeNativeSession('amDel');assert.equal(s.calls.length,0);assert.equal(value.ok,true);assert.equal(value.privateSession.token,'test-token');assert.equal(value.privateSession.userId,'test-user');assert.ok(value.privateSession.ruleUrl.endsWith('/findExeRule'));assert.equal(s.api.state.result,null);assert.equal(s.api.state.busy,false);
 const missing=setup({noLogin:true});assert.equal(missing.api.takeNativeSession('amDel').ok,false);assert.equal(missing.calls.length,0);assert.equal(missing.api.state.result,null);
 const foreign=setup();foreign.scope.location.hostname='foreign.example';assert.equal(foreign.api.takeNativeSession('amDel').ok,false);assert.equal(foreign.calls.length,0);
});
function authEvidence(token,url='https://webvpn.dlut.edu.cn/http-8081/test/service/mobile/extExercise/findExeRule',at=Date.now()){
 return [{url,digest:crypto.createHash('sha1').update(token).digest('hex'),at}];
}
test('native stop/restart after six minutes uses fresh successful evidence, not expired browser evidence',()=>{
 let now=Date.now();const local={'opaque/tokenMobile':'OPAQUE-SECRET','opaque/userid':'OPAQUE-USER'};
 const s=setup({local,authObserved:authEvidence('OPAQUE-SECRET',undefined,now)});
 s.scope.Date=class extends Date{static now(){return now;}};
 assert.equal(s.api.takeNativeSession('pmDel').ok,true);
 now+=360000;assert.equal(s.api.takeNativeSession('pmDel').ok,false,'old browser evidence actually expires');
 s.scope.__exerciseObservedAuth.push(...authEvidence('OPAQUE-SECRET',undefined,now));
 assert.equal(s.api.takeNativeSession('pmDel').ok,true,'latest successful native request restores matching');
 assert.equal(s.api.state.result,null);assert.equal(s.calls.length,0,'handoff does not poll by itself');
 s.scope.localStorage=storage({'opaque/tokenMobile':'OTHER-SECRET','opaque/userid':'OTHER-USER'});
 assert.equal(s.api.takeNativeSession('pmDel').ok,false,'changed credentials must not inherit previous evidence');
});
test('R3 unknown namespace is verified by actual same-endpoint authorization fingerprint',()=>{
 const s=setup({local:{'opaque/tokenMobile':'OPAQUE-SECRET','opaque/userid':'OPAQUE-USER'},authObserved:authEvidence('OPAQUE-SECRET')});
 s.api.start('amDel');assert.equal(s.api.state.result.ok,true,s.api.state.result.message);
 assert.equal(s.calls[0].body.userId,'OPAQUE-USER');assert.equal(s.api.state.result.diagnostics.session.source,'local-observed');
 assert.doesNotMatch(JSON.stringify(s.api.state.result),/OPAQUE|opaque|[a-f0-9]{40}/);
});
test('R3 missing, stale, foreign, wrong endpoint and mismatched evidence never authorize unknown pair',()=>{
 const local={'opaque/tokenMobile':'OPAQUE-SECRET','opaque/userid':'OPAQUE-USER'};
 const cases=[[],authEvidence('OPAQUE-SECRET',undefined,Date.now()-301000),authEvidence('OPAQUE-SECRET','https://other.example/http-8081/test/service/mobile/extExercise/findExeRule'),authEvidence('OPAQUE-SECRET','https://webvpn.dlut.edu.cn/another/mobile/extExercise/findExeRule'),authEvidence('DIFFERENT')];
 for(const observed of cases){const s=setup({local,authObserved:observed});s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.ok,false);}
});
test('R3 multiple matched namespaces stop instead of choosing a user and latest evidence wins',()=>{
 const local={'one/tokenMobile':'SECRET','one/userid':'USER-A','two/tokenMobile':'SECRET','two/userid':'USER-B'};
 const s=setup({local,authObserved:authEvidence('SECRET')});s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.diagnostics.session.source,'ambiguous');
 const changed=setup({local,authObserved:[...authEvidence('SECRET'),...authEvidence('NEW-SECRET')]});changed.api.start('amDel');assert.equal(changed.calls.length,0);assert.equal(changed.api.state.result.diagnostics.session.matchedPairs,0);
});

test('SESSION regression: logged-in storage pair scoped to sports site is usable without exporting values',()=>{
 const s=setup({local:{'http://202.118.65.138:8081:tokenMobile':'SCOPED-SECRET','http://202.118.65.138:8081:userid':'SCOPED-USER'}});
 s.api.start('amDel');assert.equal(s.api.state.result.ok,true,s.api.state.result.message);assert.equal(s.calls.length,2);
 assert.equal(s.calls[0].body.userId,'SCOPED-USER');assert.equal(s.api.state.result.diagnostics.session.source,'local-scoped');
 assert.doesNotMatch(JSON.stringify(s.api.state.result),/SCOPED-SECRET|SCOPED-USER|202\.118\.65\.138/);
});

test('SESSION regression: sessionStorage pair is used as one pair, not mixed with localStorage',()=>{
 const s=setup({local:{tokenMobile:'STALE-LOCAL'},session:{tokenMobile:'SESSION-SECRET',userid:'SESSION-USER'}});
 s.api.start('amDel');assert.equal(s.api.state.result.ok,true,s.api.state.result.message);assert.equal(s.calls[0].body.userId,'SESSION-USER');
 assert.equal(s.api.state.result.diagnostics.session.source,'session-exact');
});

test('SESSION refuses ambiguous sports namespaces instead of choosing an account',()=>{
 const s=setup({local:{'http://202.118.65.138:8081/a/tokenMobile':'a','http://202.118.65.138:8081/a/userid':'u1','http://202.118.65.138:8081/b/tokenMobile':'b','http://202.118.65.138:8081/b/userid':'u2'}});
 s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.diagnostics.session.source,'ambiguous');
});

test('SESSION never reads unrelated namespace values or another port',()=>{
 const s=setup({local:{'other/tokenMobile':'FOREIGN','other/userid':'OTHER','202.118.65.138:8082/tokenMobile':'PORT','202.118.65.138:8082/userid':'PORT-USER'}});
 const original=s.scope.localStorage.getItem;
 s.scope.localStorage.getItem=key=>{assert.ok(['tokenMobile','userid'].includes(key),'must not read foreign credential values');return original(key);};
 s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.diagnostics.session.otherPairs,2);
 assert.equal(s.api.state.result.diagnostics.session.storageErrors,0);
});

test('SESSION pairs encoded sports namespace and suffix form without exporting key names',()=>{
 const suffix='@http%3A%2F%2F202.118.65.138%3A8081';const s=setup({local:{['tokenMobile'+suffix]:'ENCODED-SECRET',['userid'+suffix]:'ENCODED-USER'}});
 s.api.start('amDel');assert.equal(s.api.state.result.ok,true);assert.equal(s.calls[0].body.userId,'ENCODED-USER');
 assert.doesNotMatch(JSON.stringify(s.api.state.result),/ENCODED|http%3A/);
});

test('SESSION uses only the current observed WebVPN mapping namespace',()=>{
 const mapping='57787a7876706e323032336b657940242a';const s=setup({local:{[mapping+':tokenMobile']:'MAPPED-SECRET',[mapping+':userid']:'MAPPED-USER'}});
 s.scope.location.pathname='/http-8081/'+mapping+'/mobilenew/';s.api.start('amDel');
 assert.equal(s.api.state.result.ok,true);assert.equal(s.calls[0].body.userId,'MAPPED-USER');
});

test('SESSION placeholder values and partial stores cannot be combined',()=>{
 const s=setup({local:{tokenMobile:'null',userid:'LOCAL-USER'},session:{tokenMobile:'SESSION-SECRET',userid:'undefined'}});
 s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.diagnostics.session.localToken,false);
 assert.equal(s.api.state.result.diagnostics.session.sessionUser,false);assert.match(s.api.state.result.message,/不代表你未登录/);
});

test('SESSION storage errors produce safe diagnostics rather than leaking exceptions',()=>{
 const s=setup({noLogin:true});s.scope.localStorage={getItem(){throw Error('PRIVATE-EXCEPTION');}};
 s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.diagnostics.session.storageErrors,1);
 assert.doesNotMatch(JSON.stringify(s.api.state.result),/PRIVATE-EXCEPTION/);
});
test('real query sequence uses observed VPN path and signed POST',()=>{const s=setup();s.api.start('amDel');assert.equal(s.calls.length,2);assert.equal(s.calls[1].body.amId,'1');assert.match(s.calls[0].body.sign,/^[A-F0-9]{40}$/);assert.equal(s.api.state.result.sample.remaining,90);assert.ok(!JSON.stringify(s.api.state.result).includes('test-token'));});
test('not querying yet is a successful waiting result, not fake zero',()=>{const s=setup({waiting:true});s.api.start('amDel');assert.equal(s.calls.length,1);assert.equal(s.api.state.result.waiting,true);assert.equal(s.api.state.result.sample,undefined);});
test('expired login stops before detail request',()=>{const s=setup({expired:true});s.api.start('amDel');assert.equal(s.api.state.result.ok,false);assert.equal(s.calls.length,1);});
test('missing observed endpoint fails without guessing',()=>{const s=setup({noEndpoint:true});s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.ok,false);});
test('native-observed same-origin rule rescues missing Resource Timing',()=>{const s=setup({noEndpoint:true,observed:['https://webvpn.dlut.edu.cn/http-8081/test/service/mobile/extExercise/findExeRule']});s.api.start('amDel');assert.equal(s.api.state.result.ok,true,s.api.state.result.message);assert.equal(s.calls.length,2);});
test('query markers and trailing slash preserved without leaking addresses into diagnostic',()=>{const s=setup({noEndpoint:true,observed:['https://webvpn.dlut.edu.cn/http-8081/test/service/mobile/extExercise/findExeRule/?vpn-12-vpn=1']});s.api.start('amDel');assert.equal(s.api.state.result.ok,true);assert.ok(s.calls.every(c=>c.url.endsWith('?vpn-12-vpn=1')));assert.doesNotMatch(JSON.stringify(s.api.state.result.diagnostics),/https?:\/\/|vpn-12-vpn/);});
test('observed detail prefix can identify paired rule without performance entry',()=>{const s=setup({noEndpoint:true,observed:['https://webvpn.dlut.edu.cn/http-8081/test/mobile/extExercise/findExtExercise']});s.api.start('amDel');assert.equal(s.api.state.result.ok,true);assert.equal(s.api.state.result.diagnostics.source,'webview-detail-prefix');});
test('cross origin observed API is diagnosed and does not receive credentials',()=>{const s=setup({noEndpoint:true,observed:['http://202.118.65.138:8081/service/mobile/extExercise/findExeRule']});s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.diagnostics.crossOriginSeen,1);assert.match(s.api.state.result.message,/不同源/);});
test('unusable native and performance URLs do not crash or permit foreign traffic',()=>{const s=setup({entries:[{name:'::::bad'}],observed:['https://evil.example/service/mobile/extExercise/findExeRule']});s.api.start('amDel');assert.equal(s.calls.length,0);assert.equal(s.api.state.result.ok,false);});
test('missing business login never issues a request',()=>{const s=setup({noLogin:true});s.api.start('amDel');assert.equal(s.calls.length,0);});
test('foreign page origin rejected',()=>{const s=setup();s.scope.location.hostname='evil.test';s.api.start('amDel');assert.equal(s.calls.length,0);});
test('stop cancels pending request; duplicate start does not overlap',()=>{const s=setup({pending:true});s.api.start('amDel');s.api.start('amDel');assert.equal(s.calls.length,1);s.api.stop();assert.equal(s.api.state.busy,false);assert.equal(s.api.state.result,null);});
