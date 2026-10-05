const test=require('node:test'),assert=require('node:assert/strict');
const bridge=require('./phone-motion.js');
function setup(options={}){
 let time=0,locationListener,sensorListener,removed=0,unregistered=0;
 const requested=[];
 const location={isProviderEnabled:()=>!options.noGps,requestLocationUpdates(provider,ms,d,listener){locationListener=listener;if(options.locationFailure)throw Error('unsupported');},removeUpdates(){removed++;locationListener=null;}};
 const sensor={getDefaultSensor:()=>options.noSteps?null:{},registerListener(listener){sensorListener=listener;if(options.sensorFailure)throw Error('unsupported');return true;},unregisterListener(){unregistered++;sensorListener=null;}};
 const p={now:()=>time,ui:{run:fn=>fn()},JavaAdapter:function(type,implementation){return implementation;},activity:{checkSelfPermission:()=>options.denied?-1:0,requestPermissions:(perms,code)=>requested.push({perms,code}),getSystemService:key=>key==='location'?location:sensor},android:{os:{Build:{VERSION:{SDK_INT:30}},Looper:{getMainLooper:()=>({})}},content:{Context:{LOCATION_SERVICE:'location',SENSOR_SERVICE:'sensor'}},location:{LocationListener:{}},hardware:{Sensor:{TYPE_STEP_COUNTER:19},SensorEventListener:{},SensorManager:{SENSOR_DELAY_NORMAL:3}}}};
 const m=bridge.create(p);
 return {m,requested,get removed(){return removed;},get unregistered(){return unregistered;},fix(lat,lon,at){time=at;locationListener.onLocationChanged({getLatitude:()=>lat,getLongitude:()=>lon,getAccuracy:()=>5,getElapsedRealtimeNanos:()=>at*1e6});},step(total,at){time=at;sensorListener.onSensorChanged({values:[total],timestamp:at*1e6});}};
}
test('optional sensors request their own permissions without blocking time-only operation',()=>{
 const h=setup({denied:true});assert.match(h.m.enableLocation(),/再次点击/);assert.match(h.m.enableSteps(),/再次点击/);
 assert.equal(h.requested.length,2);assert.equal(h.m.snapshot(0).gpsFresh,false);assert.equal(h.m.snapshot(0).stepsFresh,false);h.m.stop();
});
test('native bridges feed monotonic samples and stop unregisters both listeners',()=>{
 const h=setup();assert.match(h.m.enableLocation(),/已开启/);assert.match(h.m.enableSteps(),/已开启/);
 h.fix(39,116,0);h.fix(39.00005,116,3000);h.step(100,3000);h.step(120,13000);
 const s=h.m.snapshot(13000);assert.ok(s.gpsMeters>5);assert.equal(s.cadence,120);assert.ok(!('lat' in s)&&!('lon' in s));
 h.m.stop();h.m.stop();assert.equal(h.removed,1);assert.equal(h.unregistered,1);
});
test('missing or failing sensors degrade to interval estimation and release partial listeners',()=>{
 const absent=setup({noGps:true,noSteps:true});assert.match(absent.m.enableLocation(),/时间估算/);assert.match(absent.m.enableSteps(),/间隔估算/);
 const failed=setup({locationFailure:true,sensorFailure:true});assert.match(failed.m.enableLocation(),/时间估算/);assert.match(failed.m.enableSteps(),/时间估算/);
 assert.equal(failed.removed,1);assert.equal(failed.unregistered,1);failed.m.stop();assert.equal(failed.removed,1);
});
