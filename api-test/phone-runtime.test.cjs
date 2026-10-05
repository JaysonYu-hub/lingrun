const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Executes the delivered AutoJs6 script plus the delivered page bundle.
// Native Android services and school responses are simulated; no network, phone,
// accessibility service, microphone or real account is accessed by these tests.
function harness(options = {}) {
  let now = 0, serial = 0, inUi = true, web, tts, detailRound = 0;
  const tasks = new Map(), writes = new Map(), buttons = new Map();
  const dialogs = [], utterances = [], requests = [], uiHandlers = {}, exitHandlers = {};
  const base = '/virtual/Download/phone-api-test';
  const flags = new Set();
  const schedule = (fn, delay = 0) => { const id = ++serial; tasks.set(id, { fn, at: now + Math.max(1, Number(delay)) }); return id; };
  const uiRun = fn => { const before = inUi; inUi = true; try { return fn(); } finally { inUi = before; } };
  function step() {
    const next = [...tasks].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
    if (!next) return false;
    const [id, job] = next; tasks.delete(id); now = job.at;
    const before = inUi; inUi = false;
    try { job.fn(); } finally { inUi = before; }
    return true;
  }
  function drain(until = () => false) {
    for (let i = 0; i < 5000; i++) { if (until() || !step()) return; }
    throw Error('Unexpected nonterminating simulated runtime');
  }
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [1700000000000 + now])); } static now() { return 1700000000000 + now; } }
  function NativeObject(implementation) { return implementation; }
  class Queue {constructor(){this.items=[];}clear(){this.items=[];}size(){return this.items.length;}contains(x){return this.items.includes(x);}poll(){return this.items.shift();}add(x){this.items.push(x);}iterator(){const data=[...this.items];let i=0;return {hasNext:()=>i<data.length,next:()=>data[i++]};}}
  function Widget() { this.children = []; this.enabled = true; }
  Widget.prototype = {
    setOrientation() {}, setPadding() {}, setTextSize() {}, setMaxLines() {},
    setText(value) { assert.ok(inUi, 'TextView mutations must run on UI thread'); this.text = String(value); },
    setId(id) { this.id = id; }, setEnabled(value) { assert.ok(inUi); this.enabled = value; },
    addView(child) { this.children.push(child); },
    setOnClickListener(listener) { this.listener = listener; buttons.set(this.text, this); },
    check(id) { this.checked = id; }, getCheckedRadioButtonId() { return this.checked; }
  };
  function LinearLayout() { Widget.call(this); }
  LinearLayout.prototype = Object.create(Widget.prototype);
  LinearLayout.LayoutParams = function() {};
  function Builder() { this.choices = []; }
  Builder.prototype = {
    setTitle(v) { this.title = v; return this; }, setMessage(v) { this.message = v; return this; },
    setCancelable() { return this; },
    setPositiveButton(v, cb) { this.choices[0] = { text: v, cb }; return this; },
    setNegativeButton(v, cb) { this.choices[1] = { text: v, cb }; return this; },
    setNeutralButton(v, cb) { this.choices[2] = { text: v, cb }; return this; },
    show() {
      dialogs.push({ title: this.title, message: this.message });
      if (options.holdConfirmation) return;
      const answer = this.title === '确认测试声音' ? (options.heardTest ?? 0) : (options.heardResult ?? 0);
      schedule(() => uiRun(() => this.choices[answer].cb.onClick()), 5);
    }
  };
  function Tts(activity, listener) { tts = this; schedule(() => listener.onInit(options.noTts ? -1 : 0), 2); }
  Tts.QUEUE_FLUSH = 0; Tts.OnInitListener = NativeObject;
  Tts.prototype = {
    setLanguage() { return options.noChinese ? -2 : 0; },
    setOnUtteranceProgressListener(listener) { this.listener = listener; },
    speak(message, queue, parameters, id) {
      utterances.push({ message, id });
      if (options.ttsQueueError) return -1;
      schedule(() => {
        // TTS deliberately calls back off the UI thread, as Android may do.
        this.listener.onStart(id);
        if (options.ttsError) this.listener.onError(id);
        else if (!options.ttsNeverDone) this.listener.onDone(id);
      }, 20);
      return 0;
    }, stop() {}, shutdown() { this.closed = true; }
  };
  const origin = 'https://webvpn.dlut.edu.cn';
  const endpoint = origin + '/http-8081/test/service/mobile/extExercise/';
  const page = {
    URL, TextEncoder, Uint8Array, DataView, Int32Array, Date: FakeDate,
    location: { protocol: 'https:', hostname: 'webvpn.dlut.edu.cn', origin,
      pathname: '/http-8081/test/mobilenew/', hash: '#/index', href: origin + '/http-8081/test/mobilenew/#/index' },
    performance: { getEntriesByType: () => options.noEndpoint ? [] : [{ name: endpoint + 'findExeRule' }] },
    localStorage: { getItem: key => options.noLogin ? null : key === 'userid' ? 'SIMULATED-USER' : 'SIMULATED-TOKEN' }
  };
  page.window = page;
  if(options.scopedLogin||options.opaqueLogin){
   const prefix=options.opaqueLogin?'unrecognized-prefix:':'http://202.118.65.138:8081:';
   const values={[prefix+'tokenMobile']:'SIMULATED-TOKEN',[prefix+'userid']:'SIMULATED-USER'};
   const keys=Object.keys(values);page.localStorage={length:keys.length,key:i=>keys[i],getItem:key=>values[key]??null};
  }
  page.XMLHttpRequest = class {
    open(method, url) { assert.equal(method, 'POST'); assert.ok([endpoint + 'findExeRule', endpoint + 'findExtExercise'].includes(url)); this.url = url; this.headers = {}; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    getResponseHeader() { return options.expired ? 'TIMEOUT' : null; }
    abort() { this.aborted = true; }
    send(body) {
      const call = { method: 'POST', url: this.url, body: JSON.parse(body), time: now };
      requests.push(call);
      if (options.pending) return;
      schedule(() => {
        if (this.aborted) return;
        if (options.networkError) { this.onerror(); return; }
        this.status = 200;
        let data;
        if (this.url.endsWith('findExeRule')) data = { status: 'PASS', isRun: options.ruleOnly ? '0' : '1', amId: 'a', pmId: 'b' };
        else {
          detailRound++;
          const detail = options.detailAt ? options.detailAt(detailRound,now) : options.observedIdleShape ? {
            // Reconstructed from the real desktop summary; IDs and full response were not retained.
            exercise_run_status:'0',distance:'无',time:'无',running_countdown_time:null
          } : {
            exercise_run_status: options.inactive ? '0' : '1', distance: '200米', time: '80秒',
            running_countdown_time: Math.max(0, 300 - Math.floor(now / 1000)),
            tag_path: [{ reader_id: 'SIMULATED-LOCATION', date_time: 'SIMULATED-TIME' }]
          };
          data = { status: 'PASS', amDel: detail, pmDel: detail };
        }
        this.responseText = JSON.stringify(data); this.onload();
      }, 30);
    }
  };
  vm.createContext(page);
  function WebView() { web = this; }
  WebView.prototype = {
    getSettings() { return { setJavaScriptEnabled() {}, setDomStorageEnabled() {}, setAllowFileAccess() {}, setAllowContentAccess() {} }; },
    setWebViewClient(client) { this.client = client; },
    loadUrl(url) { assert.ok(inUi); this.url = url; this.client.onPageStarted(this, url); },
    canGoBack() { return false; }, goBack() {},
    evaluateJavascript(code, callback) {
      assert.ok(inUi, 'WebView must be called on UI thread');
      if (options.webNeverAnswers && callback) return;
      let result;
      try { result = vm.runInContext(code, page); }
      catch (error) { if (!options.ignorePageErrors) throw error; result = null; }
      if (callback) schedule(() => uiRun(() => callback.onReceiveValue(result === undefined ? 'null' : JSON.stringify(result))), 1);
    }
  };
  const scope = {
    require(name) { assert.ok(['./phone-workflow.js','./adaptive-run.js','./phone-motion.js'].includes(name)); return require(name); },
    files: {
      cwd: () => base, join: (...parts) => parts.join('/'),
      read(filename) { assert.equal(filename, base + '/page-bundle.js'); return fs.readFileSync(path.join(__dirname, 'page-bundle.js'), 'utf8'); },
      ensureDir() {},
      write(filename, data) { if (options.writeError) throw Error('Permission denied'); writes.set(filename, data); }
    },
    dialogs: { alert: (title, message) => dialogs.push({ title, message }) },
    ui: { run: uiRun, emitter: { on: (name, fn) => { uiHandlers[name] = fn; } } },
    events: { on: (name, fn) => { exitHandlers[name] = fn; } },
    activity: { setContentView(root) { this.root = root; }, getWindow: () => ({ addFlags: f => flags.add(f), clearFlags: f => flags.delete(f) }) },
    android: {
      widget: { LinearLayout, Button: Widget, TextView: Widget, RadioGroup: Widget, RadioButton: Widget },
      view: { View: { OnClickListener: NativeObject }, WindowManager: { LayoutParams: { FLAG_KEEP_SCREEN_ON: 128 } } },
      webkit: { WebView, WebViewClient: function() {}, ValueCallback: NativeObject, CookieManager: { getInstance: () => ({ setAcceptCookie() {} }) } },
      speech: { tts: { TextToSpeech: Tts, UtteranceProgressListener: function() {} } },
      os: { SystemClock: { elapsedRealtime: () => now } },
      app: { AlertDialog: { Builder } }, content: { DialogInterface: { OnClickListener: NativeObject } }
    },
    java: {lang:{String:function(value){this.getBytes=()=>Buffer.from(value,'utf8');}},security:{MessageDigest:{getInstance(name){assert.equal(name,'SHA-1');return {digest:bytes=>[...crypto.createHash('sha1').update(bytes).digest()].map(b=>b>127?b-256:b)};}}},util: { concurrent:{ConcurrentLinkedQueue:Queue},Locale: { SIMPLIFIED_CHINESE: 'zh-CN' } }, net: { URI: function(url) { const u = new URL(url); this.getHost = () => u.hostname; this.getPath=()=>u.pathname;this.getScheme = () => u.protocol.slice(0, -1); this.getPort = () => Number(u.port || -1); } } },
    JavaAdapter: function(kind, implementation) { return implementation; },
    setTimeout: schedule, clearTimeout: id => tasks.delete(id), Date: FakeDate,
    exit() { throw Error('Unexpected AutoJs6 exit'); }
  };
  // Any accidental accessibility/global touch use fails instantly in this harness.
  ['auto', 'click', 'swipe', 'captureScreen', 'requestScreenCapture'].forEach(name => Object.defineProperty(scope, name, { get() { throw Error('Forbidden device operation: ' + name); } }));
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname, options.runMode?'phone-run.js':options.diagnostic?'phone-diagnose.js':'phone-main.js'), 'utf8'), scope);
  function click(label) { const button = buttons.get(label); assert.ok(button, 'Button exists: ' + label); if (button.enabled) uiRun(() => button.listener.onClick()); }
  function login() { page.location.hash = '#/extExercise'; page.location.href = origin + page.location.pathname + '#/extExercise'; if(options.nativeObserved){const before=inUi;inUi=false;try{
   const request={getUrl:()=>endpoint+'findExeRule',getMethod:()=>options.observeGet?'GET':'POST'};
   if(options.authHeader)request.getRequestHeaders=()=>({keySet:()=>({iterator(){const keys=['Cookie','aUtHoRiZaTiOn'];let i=0;return {hasNext:()=>i<keys.length,next:()=>keys[i++]};}}),get(key){assert.equal(key,'aUtHoRiZaTiOn','Only authorization header is read');return options.authHeader;}});
   assert.equal(web.client.shouldInterceptRequest(web,request),null);
  }finally{inUi=before;}} }
  return { scope, page, writes, dialogs, utterances, requests, flags, click, login, drain,
    emit(name) { return uiRun(() => uiHandlers[name]?.({ consumed: false })); },
    exit() { return uiRun(() => exitHandlers.exit?.()); },
    get report() { const value = [...writes].filter(([filename]) => filename.endsWith('.json')).at(-1); return value ? JSON.parse(value[1]) : null; },
    get now() { return now; }, get active() { return scope.active; }
  };
}

test('phone UI completes five real-path mocked query rounds, TTS callbacks, stop and PASS_BASIC report', () => {
  const h = harness(); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'PASS_BASIC');
  assert.equal(h.requests.length, 10); assert.equal(h.report.samples.length, 5);
  assert.equal(h.report.coverage.detailsReceived, true);
  assert.equal(h.report.coverage.countdownReceived, true);
  assert.equal(h.utterances.length, 2, 'ordinary countdown must remain silent after first result');
  assert.ok(h.report.speech.every(s => s.status === 'DONE'));
  assert.equal(h.page.__exerciseApiTest.state.busy, false);
  assert.equal(h.page.__exerciseApiTest.state.result, null);
  assert.equal(h.flags.size, 0); assert.equal(h.active, false);
  const exported = [...h.writes.values()].join('\n');
  for (const secret of ['SIMULATED-USER', 'SIMULATED-TOKEN', 'SIMULATED-LOCATION', 'SIMULATED-TIME']) assert.ok(!exported.includes(secret), 'report must not contain ' + secret);
  assert.ok(h.now >= 120000, 'five rounds retain four thirty-second gaps');
});

test('rule-only waiting can validate basic query and speech without falsely claiming countdown', () => {
  const h = harness({ ruleOnly: true }); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'PASS_BASIC'); assert.equal(h.requests.length, 5);
  assert.equal(h.report.coverage.detailsReceived, false); assert.equal(h.report.coverage.countdownReceived, false);
});
test('real phone bridge recovers when performance resource list is empty',()=>{
 const h=harness({noEndpoint:true,nativeObserved:true});h.login();h.click('开始全面测试');h.drain();
 assert.equal(h.report.state,'PASS_BASIC');assert.equal(h.requests.length,10);
 assert.equal(h.report.samples[0].result.diagnostics.source,'webview-rule');
 assert.equal(h.report.samples[0].result.diagnostics.resourceCount,0);
 const exported=[...h.writes.values()].join('\n');assert.ok(!exported.includes('https://webvpn.dlut.edu.cn/'));
});

test('targeted diagnostic completes exactly one query without TTS or confirmation',()=>{
 const h=harness({diagnostic:true,noTts:true,noEndpoint:true,nativeObserved:true});h.login();h.click('开始定位测试');h.drain();
 assert.equal(h.report.state,'PASS_QUERY');assert.equal(h.requests.length,2);assert.equal(h.report.samples.length,1);
 assert.equal(h.utterances.length,0);assert.equal(h.report.targetRounds,1);assert.equal(h.flags.size,0);
 assert.equal(h.report.samples[0].result.diagnostics.phase,'DETAIL');assert.equal(h.report.samples[0].result.diagnostics.httpStatus,200);
});

test('targeted diagnostic distinguishes discovery failure from session expiry',()=>{
 for(const options of [{noEndpoint:true},{expired:true}]){
 const h=harness({...options,diagnostic:true});h.login();h.click('开始定位测试');h.drain();
 assert.equal(h.report.state,'BLOCKED');assert.equal(h.utterances.length,0);
 assert.equal(h.report.samples[0].result.diagnostics.phase,options.noEndpoint?'DISCOVERY':'RULE');
 assert.equal(h.requests.length,options.noEndpoint?0:1);
 }
});

test('targeted phone SESSION regression uses scoped pair and emits only safe report',()=>{
 const h=harness({diagnostic:true,scopedLogin:true,noEndpoint:true,nativeObserved:true});h.login();h.click('开始定位测试');h.drain();
 assert.equal(h.report.state,'PASS_QUERY');assert.equal(h.requests.length,2);assert.equal(h.utterances.length,0);
 assert.equal(h.report.samples[0].result.diagnostics.session.source,'local-scoped');
 const output=[...h.writes.values()].join('\n');assert.match(output,/会话识别/);assert.doesNotMatch(output,/SIMULATED-TOKEN|SIMULATED-USER|202\.118\.65\.138/);
});

test('R3 actual native callback fingerprint bridges unknown namespace without exporting credential or hash',()=>{
 const h=harness({diagnostic:true,opaqueLogin:true,nativeObserved:true,authHeader:'SIMULATED-TOKEN'});h.login();h.click('开始定位测试');h.drain();
 assert.equal(h.report.state,'PASS_QUERY');assert.equal(h.requests.length,2);
 const info=h.report.samples[0].result.diagnostics.session;assert.equal(info.source,'local-observed');assert.equal(info.matchedPairs,1);assert.equal(info.requestAuthSeen,true);
 const output=[...h.writes.values()].join('\n');assert.doesNotMatch(output,/SIMULATED-TOKEN|SIMULATED-USER|unrecognized-prefix/);
 assert.ok(!output.toLowerCase().includes(crypto.createHash('sha1').update('SIMULATED-TOKEN').digest('hex')));
});
test('R3 handles the desktop-observed idle response shape after unknown-namespace session matching',()=>{
 for(const diagnostic of [true,false]){
  const h=harness({diagnostic,opaqueLogin:true,nativeObserved:true,authHeader:'SIMULATED-TOKEN',observedIdleShape:true});
  h.login();h.click(diagnostic?'开始定位测试':'开始全面测试');h.drain();
  assert.equal(h.report.state,diagnostic?'PASS_QUERY':'PASS_BASIC');
  assert.equal(h.requests.length,diagnostic?2:10);assert.equal(h.report.coverage.detailsReceived,true);
  assert.equal(h.report.coverage.countdownReceived,false);
  assert.ok(h.report.samples.every(s=>s.result.stage==='DETAIL'&&s.result.waiting&&s.result.sample.distance==='无'&&s.result.sample.totalTime==='无'&&s.result.sample.remaining===null));
  if(!diagnostic){assert.equal(h.utterances.length,2);assert.match(h.utterances[1].message,/没有进行中的跑步/);}
 }
});
test('R3 native missing, GET or mismatched authorization leaves unknown namespace blocked',()=>{
 for(const options of [{},{authHeader:'SIMULATED-TOKEN',observeGet:true},{authHeader:'ANOTHER-TOKEN'}]){
  const h=harness({diagnostic:true,opaqueLogin:true,nativeObserved:true,...options});h.login();h.click('开始定位测试');h.drain();assert.equal(h.report.state,'BLOCKED');assert.equal(h.requests.length,0);
 }
});

test('expired session terminates polling with a BLOCKED report', () => {
  const h = harness({ expired: true }); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'BLOCKED'); assert.equal(h.requests.length, 1);
  assert.equal(h.flags.size, 0);
});

test('adaptive phone entry queries without optional sensors, records speech and stops all future work',()=>{
 const h=harness({runMode:true,observedIdleShape:true,opaqueLogin:true,nativeObserved:true,authHeader:'SIMULATED-TOKEN'});
 h.login();h.click('开始跑步监测');h.drain(()=>h.report?.totalSuccessfulQueries>=4);
 assert.equal(h.report.mode,'ADAPTIVE_EXPERIMENTAL');assert.equal(h.report.adaptiveSummary.stage,'WAIT_START');
 assert.equal(h.utterances.length,2);assert.ok(h.report.speech.every(entry=>entry.message&&entry.startedAt&&entry.finishedAt));
 const calls=h.requests.length;h.click('停止');h.drain();assert.equal(h.requests.length,calls);assert.equal(h.flags.size,0);assert.equal(h.report.state,'INTERRUPTED');
});
test('adaptive replay button resubmits last actual prompt without resetting API state',()=>{
 const h=harness({runMode:true,observedIdleShape:true});h.login();h.click('开始跑步监测');h.drain(()=>h.report?.speech.some(x=>x.kind==='RUN'&&x.status==='DONE'));
 const queries=h.requests.length;h.click('重播提示');h.drain(()=>h.utterances.length===3);assert.equal(h.requests.length,queries);h.click('停止');h.drain();
});

test('delivered adaptive runner parses actual-shaped checkpoint updates, counts one lap and speaks each new card once',()=>{
 const epoch=1700000000000;
 const path=[['A',5000],['B',85000],['A',165000]].map(([reader_id,t])=>({reader_id,date_time:new Date(epoch+t).toISOString(),t}));
 const h=harness({runMode:true,detailAt:(round,now)=>({exercise_run_status:now<5000?'0':now<190000?'1':'2',distance:now<85000?'0米':now<165000?'200米':'400米',time:'模拟用时',running_countdown_time:80,tag_path:path.filter(x=>x.t<=now).map(({reader_id,date_time})=>({reader_id,date_time}))})});
 h.login();h.click('开始跑步监测');h.drain(()=>h.report?.adaptiveSummary?.completedLaps===1);
 assert.equal(h.report.adaptiveSummary.confirmedSegments,2);h.drain();
 assert.equal(h.report.state,'RUN_STOPPED');assert.equal(h.report.speech.filter(x=>x.message.includes('打卡成功')).length,2);
 assert.ok(h.report.speech.some(x=>/第1圈已完成/.test(x.message)));
 assert.ok(h.report.samples.every(x=>!x.result.sample?.checkpointEvents));
 assert.equal(h.flags.size,0);
});

test('user stop cancels pending API and records interruption without further requests', () => {
  const h = harness({ pending: true }); h.login(); h.click('开始全面测试'); h.drain(() => h.requests.length === 1);
  h.click('停止'); h.drain();
  assert.equal(h.report.state, 'INTERRUPTED'); assert.equal(h.report.reason, 'USER_STOP');
  assert.equal(h.requests.length, 1); assert.equal(h.page.__exerciseApiTest.state.busy, false); assert.equal(h.flags.size, 0);
});

test('background pause ends the run and preserves an interrupted report', () => {
  const h = harness(); h.login(); h.click('开始全面测试'); h.drain(() => h.report?.samples.length === 1);
  h.emit('pause'); const count = h.requests.length; h.drain();
  assert.equal(h.report.state, 'INTERRUPTED'); assert.equal(h.report.reason, 'BACKGROUND');
  assert.equal(h.requests.length, count); assert.equal(h.flags.size, 0);
});

test('TTS asynchronous engine error blocks before API requests', () => {
  const h = harness({ ttsError: true }); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'BLOCKED'); assert.equal(h.requests.length, 0);
  assert.equal(h.report.speech[0].status, 'ERROR');
});

test('a missing audible confirmation cannot produce a successful report', () => {
  const h = harness({ heardResult: 2 }); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'PARTIAL');
});

test('starting outside exercise page diagnoses navigation before any API calls', () => {
  const h = harness(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'BLOCKED'); assert.equal(h.requests.length, 0);
  assert.ok(h.report.checks.some(c => c.name === '登录页面位置' && c.status === 'BLOCKED'));
});

test('unresponsive WebView times out with a report rather than hanging', () => {
  const h = harness({ webNeverAnswers: true }); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.report.state, 'BLOCKED'); assert.equal(h.requests.length, 0);
});

test('write permission failure stops before sending a request', () => {
  const h = harness({ writeError: true }); h.login(); h.click('开始全面测试'); h.drain();
  assert.equal(h.active, false); assert.equal(h.requests.length, 0); assert.equal(h.flags.size, 0);
});
