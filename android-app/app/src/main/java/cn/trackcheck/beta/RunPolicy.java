package cn.trackcheck.beta;
import java.util.*;

/** Pure native R4 policy; no Activity, WebView, timers or Android dependencies. */
public final class RunPolicy {
    public static final class Card {public final String id,station;public final Long at;public Card(String id,String station,Long at){this.id=id;this.station=station;this.at=at;}}
    public static final class Input {public String status="0",runKey="";public boolean hasSample=true;public List<Card> cards=new ArrayList<>();}
    public static final class Motion {public Double gpsMeters,steps,cadence;public boolean gpsFresh,stepsFresh,stationary;}
    public static final class Decision {public String stage="STARTUP",type,message,scope,source;public int nextMs=5000,segments,laps;public boolean stop,warning;public Double seconds,speed;public int meters;public Double cadence;}
    public final int checkpointMeters,pointsPerLap;
    public RunPolicy(){this(200);}
    public RunPolicy(int meters){if(meters!=100&&meters!=200)throw new IllegalArgumentException("checkpoint spacing");checkpointMeters=meters;pointsPerLap=400/meters;}
    private long began=-1,last=-1,anchorAt,receivedAt,paused=0,lateAt=-1,missingAt=-1;
    private final Set<String> seen=new HashSet<>();private final List<String> stations=new ArrayList<>();
    private Card anchor;private int segments=0,lateCount=0;private Double mean,deviation=0.0,stride,baseGps,baseSteps;
    private String key="";private boolean initialized=false,wasActive=false,aligned=false,warned=false,lastPaused=false,unsupported=false;
    private String point(String station){if(!stations.contains(station))stations.add(station);if(stations.size()>pointsPerLap)unsupported=true;int index=stations.indexOf(station);return String.valueOf((char)('A'+index))+"点";}
    private String laps(){if(checkpointMeters==100)return "累计圈数以平台距离为准。";int n=segments/2;return segments%2==1?"监测后第"+(n+1)+"圈，半圈已确认。":"监测后第"+n+"圈已完成。";}
    private void anchor(Card c,long now,long wall,Motion m){long lag=c.at==null?0:wall-c.at;anchor=c;anchorAt=now-(lag>=0&&lag<=300000?lag:0);receivedAt=now;paused=0;lateAt=-1;lateCount=0;warned=false;baseGps=m.gpsMeters;baseSteps=m.steps;}
    private Decision stopped(String type,String msg){Decision d=new Decision();d.type=d.stage=type;d.message=msg;d.stop=true;d.nextMs=0;d.segments=segments;d.laps=segments/pointsPerLap;return d;}
    public Decision update(Input in,long now,long wall,Motion m){
        if(now<last)throw new IllegalArgumentException("monotonic time");if(began<0)began=now;if(last>=0&&lastPaused)paused+=now-last;last=now;lastPaused=m.stationary;
        if(now-began>=7200000)return stopped("LIMIT","已达到两小时监测上限。");
        if(!in.hasSample){boolean first=missingAt<0;if(first)missingAt=now;if(now-missingAt>=300000)return stopped("DATA_UNAVAILABLE","详情持续五分钟不可用，已停止；这不代表跑步结束。请检查平台或重新开始。");Decision waiting=new Decision();waiting.stage="WAIT_DATA";waiting.nextMs=15000;waiting.segments=segments;waiting.laps=segments/pointsPerLap;waiting.scope="since-monitor-baseline";waiting.type=first?"DATA_UNAVAILABLE":null;waiting.message=first?"暂未取得跑步详情，正在重试；保留最近距离，暂不判断结束或漏卡。":null;return waiting;}missingAt=-1;
        if(!key.isEmpty()&&!in.runKey.isEmpty()&&!key.equals(in.runKey))return stopped("RECORD_CHANGED","后台记录切换，请重新开始监测。");if(!in.runKey.isEmpty())key=in.runKey;
        boolean active=in.hasSample&&"1".equals(in.status);Decision d=new Decision();List<Card> fresh=new ArrayList<>();for(Card c:in.cards)if(c!=null&&!seen.contains(c.id))fresh.add(c);
        boolean dated=true;for(Card c:fresh)if(c.at==null)dated=false;
        if(fresh.size()>1&&!dated&&initialized)return stopped("ORDER_UNKNOWN","多条记录无法确认时间顺序，请核对后重新开始。");
        if(dated)Collections.sort(fresh,(a,b)->Long.compare(a.at,b.at));
        if(!initialized){initialized=true;aligned=!active;for(Card c:fresh){seen.add(c.id);if(checkpointMeters==100&&active)point(c.station);}if(active&&!fresh.isEmpty()&&(fresh.size()==1||dated)){Card c=fresh.get(fresh.size()-1);point(c.station);anchor(c,now,wall,m);}fresh.clear();d.type="BASELINE";d.message=active?"已接入跑步，已有记录用于预测下一点；累计圈数以平台距离为准。":"等待起跑打卡，正在查询后台确认。";}
        int confirmed=0;boolean same=false;
        for(Card c:fresh){seen.add(c.id);if(!active&&!wasActive)continue;
            if(anchor==null){point(c.station);anchor(c,now,wall,m);d.type="START";d.message=aligned?"起跑打卡已确认，累计圈数以平台距离为准。":"新打卡已确认，以此点作为监测起点。";continue;}
            if(c.at!=null&&anchor.at!=null&&c.at<=anchor.at)continue;
            double seconds=c.at!=null&&anchor.at!=null?(c.at-anchor.at)/1000.0:(now-receivedAt)/1000.0;
            if(c.station.equals(anchor.station)){if(seconds>=30){same=true;anchor(c,now,wall,m);}continue;}
            point(c.station);if(unsupported)continue;
            // In four-point mode, a known skipped station is not a 100 m calibration sample.
            if(checkpointMeters==100&&stations.size()==pointsPerLap&&
                (stations.indexOf(c.station)-stations.indexOf(anchor.station)+pointsPerLap)%pointsPerLap!=1){
                anchor(c,now,wall,m);mean=null;deviation=0.0;stride=null;
                d.type="CARD_CONFIRMED";d.message="新点位打卡已确认，点位顺序不连续，暂不估算本段速度。";continue;
            }
            if(seconds<checkpointMeters/10.0){d.type="UNCERTAIN";d.message="点位变化间隔过短，不用于本段速度估算。";if(checkpointMeters==100){anchor(c,now,wall,m);mean=null;deviation=0.0;stride=null;d.type="CARD_CONFIRMED";}continue;}
            if(seconds>600){anchor(c,now,wall,m);mean=null;deviation=0.0;stride=null;d.type="UNCERTAIN";d.message="新打卡间隔过长，重新估算用时；累计距离以平台为准。";continue;}
            Double old=mean;mean=old==null?seconds:.65*old+.35*seconds;deviation=old==null?0:.65*deviation+.35*Math.abs(seconds-old);
            double steps=m.steps!=null&&baseSteps!=null?m.steps-baseSteps:0;if(fresh.size()==1&&steps>=checkpointMeters*.56&&steps<=checkpointMeters*2.85)stride=stride==null?checkpointMeters/steps:.7*stride+.3*checkpointMeters/steps;
            segments++;confirmed++;anchor(c,now,wall,m);
        }
        if(unsupported)return stopped("UNSUPPORTED_POINTS","点位数量超过所选布局，请停止后核对100米四点或200米两点设置。");
        if(confirmed>0){d.type="CARD_CONFIRMED";d.message=(confirmed>1?"后台补回"+confirmed+"段打卡记录。":point(anchor.station)+"打卡成功。")+laps();}
        else if(same){d.type="SAME_POINT";d.message="新增同一点位记录，未确认中间点。请核对是否漏卡，确认且现场安全时再返回补卡。";}
        if(wasActive&&!active){d.stop=true;d.type="ENDED";d.message=(confirmed>0?"最后的打卡更新已确认。"+laps():"")+"后台跑步状态已结束或暂停，监测停止。";}
        else if(active&&!wasActive&&d.message==null){d.type="START_PENDING";d.message="后台显示已起跑，等待点位记录确认。";}wasActive=active;
        double elapsed=anchor==null?0:Math.max(0,(now-anchorAt-paused)/1000.0);
        Double gps=baseGps!=null&&m.gpsFresh&&m.gpsMeters!=null?Math.max(0,m.gpsMeters-baseGps):null;
        Double steps=stride!=null&&baseSteps!=null&&m.stepsFresh&&m.steps!=null?Math.max(0,(m.steps-baseSteps)*stride):null;
        double auxiliary=Math.max(gps==null?0:gps,steps==null?0:steps);d.source=gps!=null&&(steps==null||gps>=steps)?"gps-path":steps!=null?"calibrated-steps":"time-estimate";
        double lead=mean==null?0:Math.max(15,Math.max(mean*.25,2*deviation+10));boolean near=anchor!=null&&(auxiliary>=checkpointMeters*.8||mean!=null&&elapsed>=Math.max(0,mean-lead));
        if(!active){d.stage="WAIT_START";d.nextMs=now-began<120000?5000:15000;}
        else if(m.stationary){d.stage="PAUSED_MOVEMENT";d.nextMs=20000;}
        else if(anchor!=null&&mean!=null&&!near){d.stage="CRUISE";d.nextMs=(int)Math.round(Math.min(20000,Math.max(5000,(mean-lead-elapsed)*1000)));}
        else if(near){d.stage="NEAR_POINT";d.nextMs=5000;}
        else if(anchor!=null&&elapsed>120){d.stage="LEARNING_SLOW";d.nextMs=10000;}
        else if(anchor==null&&now-began>=120000){d.stage="WAIT_FIRST_CARD";d.nextMs=15000;}
        boolean overdue=active&&anchor!=null&&!m.stationary&&(mean!=null&&elapsed>mean+Math.max(20,Math.max(mean*.35,2*deviation))||auxiliary>=checkpointMeters*1.15);
        if(overdue){lateCount++;if(lateAt<0)lateAt=now;d.stage="AWAIT_CONFIRMATION";d.nextMs=now-lateAt<=30000?5000:15000;if(!warned&&lateCount>=2&&now-lateAt>=10000&&d.message==null){warned=true;d.type="POSSIBLE_MISS";d.message="尚未收到下一点打卡确认，可能延迟或漏卡。若已过点位，请先核对；确认且现场安全时，再返回补卡。";}}else{lateCount=0;lateAt=-1;}
        d.segments=segments;d.laps=segments/pointsPerLap;d.scope=aligned?"from-start-confirmation":"since-monitor-baseline";d.seconds=mean;d.speed=mean==null?null:checkpointMeters/mean;d.meters=(int)Math.round(d.source.equals("time-estimate")?(mean==null?0:checkpointMeters*elapsed/mean):auxiliary);d.cadence=m.stepsFresh?m.cadence:null;d.warning=warned;if(d.stop){d.stage=d.type;d.nextMs=0;}return d;
    }
}
