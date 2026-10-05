const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const assets=__dirname+'/../app/src/main/assets/';
test('APK offline bundle executes all scenarios without any network surface',()=>{
 const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(assets+'offline-bundle.js','utf8'),sandbox);
 const out=sandbox.window.__runOfflineTests();assert.equal(out.source,'SIMULATED_OFFLINE');assert.equal(out.passed,true,JSON.stringify(out));assert.equal(out.checks.length,10);
});
test('APK API bundle installs shared policy and API self checks in a browser-shaped environment',()=>{
 const sandbox={window:null,TextEncoder,URL,Uint8Array,DataView,Int32Array};sandbox.window=sandbox;vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync(assets+'app-bundle.js','utf8'),sandbox);
 assert.equal(typeof sandbox.__trackPolicy.create,'function');assert.equal(typeof sandbox.__exerciseApiTest.start,'function');
 const checks=sandbox.__exerciseApiSelfCheck();assert.equal(checks.length,11);assert.ok(checks.every(x=>x.status==='PASS'));
});
test('manifest permissions are optional sensors, with no accessibility, background location or storage permission',()=>{
 const manifest=fs.readFileSync(__dirname+'/../app/src/main/AndroidManifest.xml','utf8');
 assert.match(manifest,/android.permission.ACTIVITY_RECOGNITION/);assert.match(manifest,/android.permission.ACCESS_FINE_LOCATION/);
 assert.doesNotMatch(manifest,/BIND_ACCESSIBILITY_SERVICE|ACCESS_BACKGROUND_LOCATION|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
 assert.match(manifest,/android:allowBackup="false"/);
});
