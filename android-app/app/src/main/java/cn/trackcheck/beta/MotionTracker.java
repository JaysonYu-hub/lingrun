package cn.trackcheck.beta;
import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.location.*;
import android.os.*;
import org.json.*;
import java.util.*;

final class MotionTracker implements LocationListener, SensorEventListener {
    private final Context activity;
    private final LocationManager locations;
    private final SensorManager sensors;
    private final Handler callbacks;
    private boolean gpsOn=false,stepOn=false;
    private Location anchor;
    private double gpsMeters=0;
    private long goodFix=-1,stillAt=-1,stepAt=-1;
    private double steps=-1;
    private int fixes=0,stepSamples=0;
    private final ArrayList<double[]> history=new ArrayList<>();
    MotionTracker(Context a){this(a,Looper.getMainLooper());}
    MotionTracker(Context a,Looper looper){activity=a;callbacks=new Handler(looper);locations=(LocationManager)a.getSystemService(Context.LOCATION_SERVICE);sensors=(SensorManager)a.getSystemService(Context.SENSOR_SERVICE);}
    boolean locationPermission(){return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    boolean stepPermission(){return Build.VERSION.SDK_INT<29||activity.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION)==PackageManager.PERMISSION_GRANTED;}
    String enableGps(){
        if(!locationPermission())return "尚未取得精确定位权限；时间估算仍可用。";
        if(gpsOn)return "定位已开启，等待合格数据。";
        try {if(locations==null||!locations.isProviderEnabled(LocationManager.GPS_PROVIDER))return "GPS 未开启；时间估算仍可用。";locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,3000,0,this,callbacks.getLooper());gpsOn=true;return "定位已开启。首次室外定位可能需要等待。";}catch(Exception e){return "定位注册失败；时间估算仍可用。";}
    }
    String enableSteps(){
        if(!stepPermission())return "身体活动权限未获准；时间估算仍可用。";
        if(stepOn)return "计步已注册，等待步数回调。";
        try {Sensor s=sensors==null?null:sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);if(s==null)return "设备没有可用计步传感器。";stepOn=sensors.registerListener(this,s,SensorManager.SENSOR_DELAY_NORMAL,callbacks);return stepOn?"计步已注册。可先走几步，观察回调数；不必先跑步。":"计步注册失败；时间估算仍可用。";}catch(Exception e){return "计步不可用；时间估算仍可用。";}
    }
    void stop(){try{if(locations!=null)locations.removeUpdates(this);}catch(Exception ignored){}if(sensors!=null)sensors.unregisterListener(this);gpsOn=stepOn=false;goodFix=stepAt=stillAt=-1;anchor=null;history.clear();}
    @Override public void onLocationChanged(Location v){
        long now=SystemClock.elapsedRealtime(),at=v.getElapsedRealtimeNanos()/1000000;
        if(!gpsOn||!v.hasAccuracy()||v.getAccuracy()>15||at>now||now-at>10000||at<=goodFix)return;
        if(anchor!=null){long old=anchor.getElapsedRealtimeNanos()/1000000;double d=anchor.distanceTo(v),dt=(at-old)/1000.0;
            if(goodFix>=0&&at-goodFix>20000){anchor=new Location(v);stillAt=-1;goodFix=at;fixes++;return;}
            if(dt<=0||d/dt>9)return;
            if(d>=Math.max(3,Math.max(v.getAccuracy(),anchor.getAccuracy())*.5)){gpsMeters+=d;anchor=new Location(v);stillAt=-1;}else if(stillAt<0)stillAt=at;
        }else anchor=new Location(v);
        goodFix=at;fixes++;
    }
    @Override public void onSensorChanged(SensorEvent e){
        if(!stepOn)return;double total=e.values[0];long at=e.timestamp/1000000;if(total<0||at<=stepAt)return;
        if(steps>=0&&total<steps)history.clear();steps=total;stepAt=at;stepSamples++;history.add(new double[]{total,at});while(!history.isEmpty()&&at-history.get(0)[1]>30000)history.remove(0);
    }
    @Override public void onAccuracyChanged(Sensor s,int accuracy){}
    @Override public void onStatusChanged(String p,int status,Bundle extras){}
    @Override public void onProviderEnabled(String p){}
    @Override public void onProviderDisabled(String p){goodFix=-1;}
    JSONObject snapshot(){JSONObject o=new JSONObject();long now=SystemClock.elapsedRealtime();try{
        boolean gpsFresh=gpsOn&&goodFix>=0&&now-goodFix<=10000,stepFresh=stepOn&&stepAt>=0&&now-stepAt<=15000;
        o.put("gpsMeters",gpsMeters).put("gpsFresh",gpsFresh).put("steps",steps<0?JSONObject.NULL:steps).put("stepsFresh",stepFresh).put("stationary",gpsFresh&&stillAt>=0&&now-stillAt>=30000);
        double[] f=history.isEmpty()?null:history.get(0);o.put("cadence",stepFresh&&f!=null&&stepAt-f[1]>=5000?(steps-f[0])*60000/(stepAt-f[1]):JSONObject.NULL);
    }catch(JSONException ignored){}return o;}
    JSONObject diagnostics(){JSONObject o=snapshot();try{o.put("apiLevel",Build.VERSION.SDK_INT).put("fineLocationGranted",locationPermission()).put("activityRecognitionRequired",Build.VERSION.SDK_INT>=29).put("activityRecognitionGranted",stepPermission()).put("stepSensorAvailable",sensors!=null&&sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)!=null).put("gpsRegistered",gpsOn).put("stepRegistered",stepOn).put("acceptedFixes",fixes).put("stepCallbacks",stepSamples);}catch(Exception ignored){}return o;}
    String display(){JSONObject d=diagnostics();return "定位："+(gpsOn?"已注册":"关闭")+" · 有效采样 "+fixes+" · "+(d.optBoolean("gpsFresh")?"新鲜":"暂无新鲜数据")+"\n计步："+(stepOn?"已注册":"关闭")+" · 回调 "+stepSamples+" 次 · "+(stepPermission()?"无需再授权":"未授权")+"\n估计步频："+(d.isNull("cadence")?"等待足够数据":Math.round(d.optDouble("cadence"))+" 步/分")+"；步数/定位不能确认打卡。";}
}
