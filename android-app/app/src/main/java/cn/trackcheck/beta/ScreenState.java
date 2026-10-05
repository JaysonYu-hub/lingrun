package cn.trackcheck.beta;

/** Classification only. A locked or background app is not evidence of screen-off. */
final class ScreenState {
    static boolean offOrNonInteractive(boolean interactive,int displayState){return !interactive||displayState==1;}
    static String displayName(int state){switch(state){case 1:return "OFF";case 2:return "ON";case 3:return "DOZE";case 4:return "DOZE_SUSPEND";case 6:return "ON_SUSPEND";default:return "UNKNOWN";}}
}
