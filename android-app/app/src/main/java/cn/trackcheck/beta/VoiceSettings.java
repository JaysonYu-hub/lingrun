package cn.trackcheck.beta;
import android.content.Context;
final class VoiceSettings {
    static float rate(Context context){return RatePolicy.clamp(context.getSharedPreferences("voice-settings",Context.MODE_PRIVATE).getFloat("rate",1f));}
    static void save(Context context,float value){context.getSharedPreferences("voice-settings",Context.MODE_PRIVATE).edit().putFloat("rate",RatePolicy.clamp(value)).apply();}
}
