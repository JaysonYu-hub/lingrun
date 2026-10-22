package cn.trackcheck.beta;
import android.content.Context;
final class VoiceSettings {
    static boolean needsAudition(Context context,String mode){return !"RUN".equals(mode)||!context.getSharedPreferences("voice-settings",Context.MODE_PRIVATE).getBoolean("audition-confirmed",false);}
    static void confirmAudition(Context context){context.getSharedPreferences("voice-settings",Context.MODE_PRIVATE).edit().putBoolean("audition-confirmed",true).apply();}
    static float rate(Context context){return RatePolicy.clamp(context.getSharedPreferences("voice-settings",Context.MODE_PRIVATE).getFloat("rate",1f));}
    static void save(Context context,float value){context.getSharedPreferences("voice-settings",Context.MODE_PRIVATE).edit().putFloat("rate",RatePolicy.clamp(value)).apply();}
}
