package cn.trackcheck.beta;
import org.json.*;
import java.time.Instant;

/** Local campus-shaped fixture source. No network, credentials, sensor or school writes. */
final class LabPlatform {
 final long startElapsed,startWall,duration,interval;final boolean gap;final String period;
 private final java.util.List<Long> updates=new java.util.ArrayList<>();private int automatic;private long unavailableUntil,endedAt=-1;
 LabPlatform(long elapsed,long wall,long duration,boolean gap,String period){this(elapsed,wall,duration,gap,period,60000);}
 LabPlatform(long elapsed,long wall,long duration,boolean gap,String period,long interval){if(interval<5000||interval>600000||duration<30000||duration>7200000||duration<2*interval)throw new IllegalArgumentException("模拟间隔须5至600秒；时长须30至7200秒且至少为间隔的两倍。");startElapsed=elapsed;startWall=wall;this.duration=duration;this.interval=interval;this.gap=gap;this.period=period;updates.add(0L);}
 private long elapsed(long now){return Math.min(Math.min(Math.max(0,now-startElapsed),duration),endedAt<0?duration:endedAt);}
 private void advance(long now){long elapsed=elapsed(now);while((automatic+1)*interval<=elapsed){automatic++;updates.add(automatic*interval);}}
 synchronized void publish(String action,long now){advance(now);if(endedAt>=0||now-startElapsed>=duration)return;if("ADD".equals(action))updates.add(elapsed(now));else if("GAP".equals(action))unavailableUntil=now+30000;else if("END".equals(action))endedAt=elapsed(now);}
 synchronized JSONObject state(long now){advance(now);long elapsed=elapsed(now);int count=updates.size()-1;boolean ended=endedAt>=0||now-startElapsed>=duration;boolean waiting=!ended&&(now<unavailableUntil||gap&&elapsed>=90000&&elapsed<120000);
  return NativeApi.object("simulated",true,"elapsedMs",elapsed,"durationMs",duration,"updateEveryMs",interval,"distanceMeters",2800+count*200,"publishedSegments",count,"automaticSegments",automatic,"ended",ended,"ruleUnavailable",waiting,"nextAutomaticUpdateSeconds",ended?0:(interval-elapsed%interval+999)/1000);
 }
 synchronized NativeApi.Result query(long now)throws Exception{JSONObject state=state(now);JSONObject rule=NativeApi.object("status","PASS","isRun",state.optBoolean("ruleUnavailable")?"0":"1","amId","SIMULATION","pmId","SIMULATION");
  JSONArray cards=new JSONArray();for(int i=0;i<updates.size();i++){cards.put(NativeApi.object("reader_id",i%2==0?"SIM-A":"SIM-B","date_time",Instant.ofEpochMilli(startWall+updates.get(i)).toString()));}
  long seconds=elapsed(now)/1000;JSONObject detail=NativeApi.object("exercise_run_status",state.optBoolean("ended")?"2":"1","distance",state.optInt("distanceMeters")+"米","time",String.format(java.util.Locale.ROOT,"%02d时%02d分%02d秒",seconds/3600,(seconds/60)%60,seconds%60),"running_countdown_time",Math.max(0,300-(elapsed(now)%interval)/1000),"tag_path",cards);
  NativeApi.Result r=NativeApi.decode(rule,NativeApi.object("status","PASS",period,detail),period);r.safe.put("transport","local-simulation").put("simulated",true);return r;
 }
}
