package cn.trackcheck.beta;
import org.json.*;
public class LabPlatformTest {
 static int checks;static void check(boolean ok,String text){checks++;if(!ok)throw new AssertionError(text);}
 public static void main(String[] args)throws Exception{
  long wall=1790928000000L;LabPlatform lab=new LabPlatform(0,wall,300000,true,"pmDel");RunPolicy policy=new RunPolicy();
  NativeApi.Result first=lab.query(0);check(first.safe.optBoolean("simulated"),"simulation label");check(first.safe.getJSONObject("sample").getString("distance").equals("2800米"),"official baseline");policy.update(first.input,0,wall,new RunPolicy.Motion());
  NativeApi.Result next=lab.query(60000);RunPolicy.Decision d=policy.update(next.input,60000,wall+60000,new RunPolicy.Motion());check("CARD_CONFIRMED".equals(d.type),"same decoder and policy detects background update");
  check(policy.update(lab.query(65000).input,65000,wall+65000,new RunPolicy.Motion()).message==null,"unchanged poll stays silent");
  check(!policy.update(lab.query(95000).input,95000,wall+95000,new RunPolicy.Motion()).stop,"temporary RULE does not stop");
  check("CARD_CONFIRMED".equals(policy.update(lab.query(120000).input,120000,wall+120000,new RunPolicy.Motion()).type),"restored detail updates");
  RunPolicy restarted=new RunPolicy();NativeApi.Result resume=lab.query(125000);restarted.update(resume.input,0,wall+125000,new RunPolicy.Motion());JSONObject report=new JSONObject().put("lastSample",resume.safe.getJSONObject("sample")).put("adaptive",new JSONObject().put("confirmedSegments",0));check(RunPresentation.from(report).laps.equals("8 圈"),"restart uses 3200m, not zero events");
  check(policy.update(lab.query(300000).input,300000,wall+300000,new RunPolicy.Motion()).stop,"explicit simulation end stops");
  LabPlatform manual=new LabPlatform(0,wall,1200000,false,"amDel");manual.publish("ADD",35000);String id=manual.query(35000).input.cards.get(1).id;check(id.equals(manual.query(40000).input.cards.get(1).id),"manual publication identity remains stable across polls");check(id.equals(manual.query(65000).input.cards.get(1).id),"automatic arrival preserves manual history");manual.publish("END",70000);check(manual.state(500000).getInt("distanceMeters")==3200,"ended platform freezes distance");
  LabPlatform longRun=new LabPlatform(0,wall,1200000,false,"pmDel");RunPolicy longPolicy=new RunPolicy();int updates=0;for(int t=0;t<=1200000;t+=5000){d=longPolicy.update(longRun.query(t).input,t,wall+t,new RunPolicy.Motion());if("CARD_CONFIRMED".equals(d.type))updates++;if(t<1200000)check(!d.stop,"20 minute trace premature stop");}check(updates==19,"19 updates before final end");check(longRun.state(1200000).getInt("distanceMeters")==6800,"20 automatic publications");
  JSONObject stale=new JSONObject().put("state","RUNNING").put("sampleStale",true).put("lastSample",first.safe.getJSONObject("sample"));check(RunPresentation.from(stale).remaining.equals("—"),"no stale countdown");
  for(String raw:new String[]{"无","NaN米","-200米","1e3米",""})check(RunPresentation.meters(raw)==null,"reject ambiguous distance");check(RunPresentation.lapText(new JSONObject().put("distance","2.8公里")).contains("7圈"),"km normalization");
  LabPlatform fast=new LabPlatform(0,wall,120000,false,"pmDel",20000);
  check(fast.state(19999).getInt("distanceMeters")==2800,"custom interval must not publish early");
  check(fast.state(20000).getInt("distanceMeters")==3000,"custom 20 second publication");
  check(fast.state(20001).getInt("distanceMeters")==3000,"same interval cannot publish twice");
  check(fast.state(119999).getInt("distanceMeters")==3800,"custom duration still running before boundary");
  check(fast.state(120000).getInt("distanceMeters")==4000&&fast.state(120000).getBoolean("ended"),"120 second custom end retains final distance");
  LabPlatform rapid=new LabPlatform(0,wall,30000,false,"pmDel",5000);check(rapid.state(5000).getInt("distanceMeters")==3000,"5 second minimum supported");check(rapid.state(5001).getInt("nextAutomaticUpdateSeconds")==5,"next update rounds up");
  check(rapid.query(5000).safe.getJSONObject("sample").getInt("remaining")==300,"countdown follows custom publication");
  for(long[] settings:new long[][]{{4999,120000},{600001,1200000},{20000,29999},{20000,7200001},{20000,30000}}){boolean rejected=false;try{new LabPlatform(0,wall,settings[1],false,"pmDel",settings[0]);}catch(IllegalArgumentException e){rejected=true;}check(rejected,"invalid custom limits rejected");}
  check(fast.interval==20000&&fast.state(120000).getLong("updateEveryMs")==20000,"settings retained in platform report");
  System.out.println("Simulation/decoder/policy/presentation: "+checks+" assertions. No real network or Android audio tested.");
 }
}
