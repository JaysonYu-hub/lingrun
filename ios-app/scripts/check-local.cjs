const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(root, '../android-app/runtime');
const core = require(path.join(runtime, 'core.cjs'))();
const install = require(path.join(runtime, 'session.js'));
const selfCheck = require(path.join(runtime, 'self-check.cjs'));
const checks = [];
function test(name, action) { action(); checks.push({name, passed: true}); }
test('existing session regression suite', () => {
  const result = selfCheck(install, core);
  assert.ok(Array.isArray(result) && result.length === 11 && result.every(item => item.status === 'PASS'), JSON.stringify(result));
});
const source = fs.readFileSync(path.join(root, 'Resources/school-session.js'), 'utf8');
test('generated script parses', () => new vm.Script(source));
function environment(host = 'webvpn.dlut.edu.cn') {
  let sent = 0;
  class XHR {
    open(method, url) { this.url = url; }
    setRequestHeader() {}
    send() { sent++; }
    abort() {}
  }
  const values = new Map([['unknown_tokenMobile_tail', 'LOCAL_TEST_TOKEN'], ['unknown_userid_tail', 'LOCAL_TEST_USER']]);
  const storage = {length: values.size, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null};
  const location = new URL(`https://${host}/http-8081/abc/mobilenew/#/extExercise`);
  const scope = {location, XMLHttpRequest: XHR, URL, Headers, TextEncoder, Date, WeakMap,
    performance: {getEntriesByType: () => []}, localStorage: storage,
    sessionStorage: {length: 0, getItem: () => null}, navigator: {userAgent: 'local-test'}};
  scope.window = scope;
  vm.createContext(scope); vm.runInContext(source, scope);
  return {scope, XHR, sent: () => sent};
}
test('install does not query school', () => assert.equal(environment().sent(), 0));
test('other sites have no session installation', () => assert.equal(environment('example.org').scope.__exerciseApiTest, undefined));
test('observed authorization resolves VPN-prefixed session without network replay', () => {
  const env = environment();
  const request = new env.XHR();
  request.open('POST', 'https://webvpn.dlut.edu.cn/http-8081/abc/mobile/extExercise/findExeRule');
  request.setRequestHeader('Authorization', 'LOCAL_TEST_TOKEN'); request.send();
  assert.equal(env.sent(), 1);
  const found = env.scope.__exerciseApiTest.takeNativeSession('amDel');
  assert.equal(found.ok, true);
  assert.equal(found.privateSession.userId, 'LOCAL_TEST_USER');
  assert.equal(env.sent(), 1);
  assert.ok(!JSON.stringify(env.scope.__exerciseObservedAuth).includes('LOCAL_TEST_TOKEN'));
});
test('cross-origin request cannot qualify credentials', () => {
  const env = environment(); const request = new env.XHR();
  request.open('POST', 'https://example.org/mobile/extExercise/findExeRule');
  request.setRequestHeader('Authorization', 'LOCAL_TEST_TOKEN'); request.send();
  assert.equal(env.scope.__exerciseApiTest.takeNativeSession('amDel').ok, false);
});
test('a non-exercise page cannot export session', () => {
  const env = environment(); env.scope.location.hash = '#/index';
  assert.equal(env.scope.__exerciseApiTest.takeNativeSession('amDel').ok, false);
});
test('no raw credential written by observer', () => {
  assert.ok(!fs.readFileSync(path.join(root, 'scripts/observer.js'), 'utf8').includes('messageHandlers'));
});
const result = {
  suite: 'iOS local JS bridge checks', passed: true, checks,
  limitation: 'Swift/XCTest, Xcode build, iPhone API/login/audio/background are NOT executed by this script.'
};
fs.mkdirSync(path.join(root, 'TestResults'), {recursive: true});
fs.writeFileSync(path.join(root, 'TestResults/local-checks.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
