package cn.trackcheck.beta;
final class RatePolicy {
    static float clamp(float value){return Float.isNaN(value)||Float.isInfinite(value)?1f:Math.max(.5f,Math.min(2f,value));}
    static long timeout(float value){return Math.round(25000f/Math.min(1f,clamp(value)));}
    private RatePolicy(){}
}
