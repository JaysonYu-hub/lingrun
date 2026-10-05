package cn.trackcheck.beta;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;

/** Standard Android permission flow; never treats opening Settings as a grant. */
final class BackgroundSetup {
    static final int NOTIFICATION_REQUEST=610,SETTINGS_REQUEST=611;
    private final Activity activity;
    private final SharedPreferences preferences;
    private Runnable continuation;
    private AlertDialog dialog;
    private boolean skipNextPrompt;
    BackgroundSetup(Activity activity){this.activity=activity;preferences=activity.getSharedPreferences("background-setup",Context.MODE_PRIVATE);}
    boolean batteryExempt(){PowerManager p=(PowerManager)activity.getSystemService(Context.POWER_SERVICE);return p!=null&&p.isIgnoringBatteryOptimizations(activity.getPackageName());}
    boolean notificationsEnabled(){NotificationManager n=(NotificationManager)activity.getSystemService(Context.NOTIFICATION_SERVICE);return n!=null&&n.areNotificationsEnabled();}
    boolean restricted(){ActivityManager a=(ActivityManager)activity.getSystemService(Context.ACTIVITY_SERVICE);return Build.VERSION.SDK_INT>=28&&a!=null&&a.isBackgroundRestricted();}
    String summary(){return "通知："+(notificationsEnabled()?"已开启":"未开启")+" · 电池优化："+(batteryExempt()?"已豁免":"未豁免")+(restricted()?"\n系统显示应用后台活动受限":"");}
    boolean beforeStart(Runnable action){
        if(skipNextPrompt){skipNextPrompt=false;return false;}
        if(batteryExempt()&&notificationsEnabled()&&!restricted())return false;
        if(preferences.getBoolean("introduced",false))return false;
        continuation=action;showDialog();return true;
    }
    void show(){continuation=null;showDialog();}
    private void showDialog(){
        if(activity.isFinishing()||activity.isDestroyed())return;
        preferences.edit().putBoolean("introduced",true).apply();
        if(dialog!=null)dialog.dismiss();
        String explanation=summary()+"\n\n跑步监测需要在后台持续查询，并在新打卡时启动语音。点“系统授权”会请求通知（如需要），再打开本应用的电池优化豁免确认。请由你选择是否允许。\n\n设备："+Build.MANUFACTURER+"。这是通用 Android 设置；不同品牌还可能有应用启动、后台活动或省电管理，需要在应用设置中核对。系统电池优化已豁免不代表所有厂商限制都已解除。\n\n未授权也可以继续，但后台可能停顿。应用不会反复弹窗，也不会自动修改厂商设置。";
        dialog=new AlertDialog.Builder(activity).setTitle("后台运行准备").setMessage(explanation)
            .setPositiveButton("系统授权",(d,w)->requestSystem())
            .setNeutralButton("应用设置",(d,w)->openAppSettings())
            .setNegativeButton(continuation==null?"完成":"继续开始",(d,w)->{Runnable action=continuation;continuation=null;if(action!=null){skipNextPrompt=true;action.run();}})
            .setOnCancelListener(d->continuation=null).create();dialog.show();
    }
    private void requestSystem(){
        if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_REQUEST);return;}
        requestBattery();
    }
    private void requestBattery(){
        if(!batteryExempt()){
            Intent request=new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:"+activity.getPackageName()));
            if(open(request))return;
            if(open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)))return;
            openAppSettings();return;
        }
        if(!notificationsEnabled()){if(open(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,activity.getPackageName())))return;}
        showDialog();
    }
    private boolean open(Intent intent){try{activity.startActivityForResult(intent,SETTINGS_REQUEST);return true;}catch(ActivityNotFoundException|SecurityException e){return false;}}
    private void openAppSettings(){if(!open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+activity.getPackageName())))){new AlertDialog.Builder(activity).setTitle("系统未提供设置入口").setMessage("请在系统设置中打开凌跑助手的应用详情，检查通知、后台活动及电池优化。").setPositiveButton("返回",(d,w)->showDialog()).show();}}
    boolean onPermissionsResult(int request){if(request!=NOTIFICATION_REQUEST)return false;requestBattery();return true;}
    boolean onActivityResult(int request){if(request!=SETTINGS_REQUEST)return false;showDialog();return true;}
}
