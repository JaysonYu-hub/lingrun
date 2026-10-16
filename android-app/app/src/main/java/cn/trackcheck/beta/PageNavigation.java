package cn.trackcheck.beta;
/** Serializes app-owned navigation; a stalled load never locks the native recovery controls. */
final class PageNavigation {
    private long deadline=-1,lastStart=-1000;
    boolean begin(long now){if(deadline>=0||now-lastStart<800)return false;lastStart=now;deadline=now+20000;return true;}
    void pageStarted(long now){if(deadline<0){lastStart=now;deadline=now+20000;}}
    void finished(){deadline=-1;}
    boolean timedOut(long now){if(deadline<0||now<deadline)return false;deadline=-1;return true;}
    void reset(){deadline=-1;lastStart=-1000;}
}
