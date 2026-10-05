'use strict';
// Optional foreground native sensors. No coordinates or routes are written to disk.
var motionModel=require('./motion-model.js');
function create(p){
 var model=motionModel.create(),locationManager=null,locationListener=null,sensorManager=null,sensorListener=null;
 function permit(permission,code){
  if(Number(p.android.os.Build.VERSION.SDK_INT)<23||p.activity.checkSelfPermission(permission)===0)return true;
  p.activity.requestPermissions([permission],code);return false;
 }
 function location(){
  if(locationListener)return '定位辅助已开启。';
  try{
   if(!permit('android.permission.ACCESS_FINE_LOCATION',9021))return '请在系统弹窗授权，然后再次点击定位辅助。拒绝授权也能继续监测。';
   locationManager=p.activity.getSystemService(p.android.content.Context.LOCATION_SERVICE);
   if(!locationManager.isProviderEnabled('gps'))return '手机GPS未开启，继续使用时间估算。';
   locationListener=new p.JavaAdapter(p.android.location.LocationListener,{
    onLocationChanged:function(value){p.ui.run(function(){try{var now=p.now();model.location({lat:Number(value.getLatitude()),lon:Number(value.getLongitude()),accuracy:Number(value.getAccuracy()),at:Number(value.getElapsedRealtimeNanos())/1000000},now);}catch(ignored){}});},
    onStatusChanged:function(){},onProviderEnabled:function(){},onProviderDisabled:function(){}
   });
   locationManager.requestLocationUpdates('gps',3000,0,locationListener,p.android.os.Looper.getMainLooper());return '定位辅助已开启，精度不足或信号过期时自动回到时间估算。';
  }catch(ignored){if(locationManager&&locationListener){try{locationManager.removeUpdates(locationListener);}catch(e){}}locationListener=null;return '当前设备未能开启定位，继续使用时间估算。';}
 }
 function steps(){
  if(sensorListener)return '步频辅助已开启。';
  try{
   if(Number(p.android.os.Build.VERSION.SDK_INT)>=29&&!permit('android.permission.ACTIVITY_RECOGNITION',9022))return '请在系统弹窗授权身体活动，然后再次点击步频辅助。';
   sensorManager=p.activity.getSystemService(p.android.content.Context.SENSOR_SERVICE);
   var sensor=sensorManager.getDefaultSensor(p.android.hardware.Sensor.TYPE_STEP_COUNTER);if(!sensor)return '设备没有可用的计步传感器，继续使用打卡间隔估算。';
   sensorListener=new p.JavaAdapter(p.android.hardware.SensorEventListener,{onAccuracyChanged:function(){},onSensorChanged:function(event){var total=Number(event.values[0]),at=Number(event.timestamp)/1000000;p.ui.run(function(){model.step(total,at);});}});
   if(!sensorManager.registerListener(sensorListener,sensor,p.android.hardware.SensorManager.SENSOR_DELAY_NORMAL)){sensorListener=null;return '计步传感器注册失败，继续使用时间估算。';}
   return '步频辅助已开启；步长需经过有效200米区间后校准。';
  }catch(ignored){if(sensorManager&&sensorListener){try{sensorManager.unregisterListener(sensorListener);}catch(e){}}sensorListener=null;return '设备未能开启步频辅助，继续使用时间估算。';}
 }
 function stop(){try{if(locationManager&&locationListener)locationManager.removeUpdates(locationListener);}catch(e){}try{if(sensorManager&&sensorListener)sensorManager.unregisterListener(sensorListener);}catch(e){}locationListener=null;sensorListener=null;}
 return {enableLocation:location,enableSteps:steps,snapshot:model.snapshot,stop:stop};
}
module.exports={create:create};
