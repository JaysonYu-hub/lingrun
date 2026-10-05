package cn.trackcheck.beta;
import android.app.KeyguardManager;
import android.content.*;
import android.hardware.display.DisplayManager;
import android.os.*;
import android.view.Display;
import org.json.JSONObject;

/** Observes system state; never wakes the screen or treats Home as screen-off. */
final class ScreenMonitor {
    interface Listener{void changed(String source,JSONObject state);}
    private final Context context;private final PowerManager power;private final DisplayManager displays;private final KeyguardManager keyguard;private final Handler handler;private final Listener listener;
    private boolean registered,displayRegistered;private int lastDisplay=-1;
    ScreenMonitor(Context context,Handler handler,Listener listener){this.context=context;this.handler=handler;this.listener=listener;power=(PowerManager)context.getSystemService(Context.POWER_SERVICE);displays=(DisplayManager)context.getSystemService(Context.DISPLAY_SERVICE);keyguard=(KeyguardManager)context.getSystemService(Context.KEYGUARD_SERVICE);}
    JSONObject snapshot(){int state=0;try{Display d=displays==null?null:displays.getDisplay(Display.DEFAULT_DISPLAY);if(d!=null)state=d.getState();}catch(Exception ignored){}
        boolean interactive=power.isInteractive();return NativeApi.object("interactive",interactive,"displayState",state,"display",ScreenState.displayName(state),"keyguardLocked",keyguard!=null&&keyguard.isKeyguardLocked(),"offOrNonInteractive",ScreenState.offOrNonInteractive(interactive,state),"deviceIdle",power.isDeviceIdleMode(),"batteryOptimizationExempt",power.isIgnoringBatteryOptimizations(context.getPackageName()),"elapsedRealtimeMs",SystemClock.elapsedRealtime());
    }
    private final BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){listener.changed(i.getAction(),snapshot());}};
    private final DisplayManager.DisplayListener displayListener=new DisplayManager.DisplayListener(){public void onDisplayAdded(int id){}public void onDisplayRemoved(int id){}public void onDisplayChanged(int id){if(id==Display.DEFAULT_DISPLAY){JSONObject state=snapshot();int actual=state.optInt("displayState");if(actual!=lastDisplay){lastDisplay=actual;listener.changed("DISPLAY_CHANGED",state);}}}};
    void start(){IntentFilter f=new IntentFilter();f.addAction(Intent.ACTION_SCREEN_OFF);f.addAction(Intent.ACTION_SCREEN_ON);f.addAction(Intent.ACTION_USER_PRESENT);f.addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED);
        if(Build.VERSION.SDK_INT>=33)context.registerReceiver(receiver,f,null,handler,Context.RECEIVER_NOT_EXPORTED);else context.registerReceiver(receiver,f,null,handler);registered=true;
        if(displays!=null){displays.registerDisplayListener(displayListener,handler);displayRegistered=true;}
    }
    void stop(){if(registered){context.unregisterReceiver(receiver);registered=false;}if(displayRegistered){displays.unregisterDisplayListener(displayListener);displayRegistered=false;}}
}
