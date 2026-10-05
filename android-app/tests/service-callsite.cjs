// Exercise the real service result handler and speech-completion handler on a host JVM.
// Android audio, lifecycle and OEM scheduling remain device acceptance tests.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const app=path.resolve(__dirname,'..'),src=path.join(app,'app/src/main/java/cn/trackcheck/beta'),s=fs.readFileSync(path.join(src,'RunService.java'),'utf8');
const handle=s.slice(s.indexOf('    private void handleResult('),s.indexOf('    private void speak('));
const end=s.slice(s.indexOf('    private void voiceEnd('),s.indexOf('    static void labPublish('));
const out=path.join(app,'build/service-callsite');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'ServiceCallsiteTest.java'),`package cn.trackcheck.beta;
import org.json.*;import java.util.*;
class ServiceCallsiteTest {
 static class SystemClock {static long now;static long elapsedRealtime(){return now;}}
 static class Motion {JSONObject snapshot(){return new JSONObject();}}
 static class Tts {void stop(){}}static class Audio {void abandonAudioFocusRequest(Object f){}}
 Motion motion=new Motion();RunPolicy policy=new RunPolicy();JSONObject report=new JSONObject().put("events",new JSONArray());boolean live=true,check,voiceBusy;int round;long scheduled=-1;String spoken,speakingId,queued;Runnable queuedDone;LabPlatform simulation;Tts tts=new Tts();Audio audio=new Audio();Object focus;
 Map<String,JSONObject> utterances=new HashMap<>();Map<String,Runnable> callbacks=new HashMap<>();
 static void put(JSONObject o,String k,Object v){o.put(k,v==null?JSONObject.NULL:v);}static String stamp(){return "test";}JSONObject audioContext(){return new JSONObject().put("uiVisible",false);}void save(){}void notice(String text){}void event(String type,JSONObject e){}void scheduleQuery(long delay){scheduled=delay;}void speak(String text,Runnable done){spoken=text;if(done!=null)done.run();}void finish(String reason,String text){live=false;}void assertTrue(boolean b,String msg){if(!b)throw new AssertionError(msg);}
 ${handle}
 ${end}
 public static void main(String[] args)throws Exception {
  ServiceCallsiteTest t=new ServiceCallsiteTest();LabPlatform lab=new LabPlatform(0,System.currentTimeMillis(),300000,true,"pmDel");t.handleResult(lab.query(0));t.assertTrue(t.spoken.contains("2800米")&&t.spoken.contains("7圈")&&!t.spoken.contains("本次监测后"),"baseline speech uses official distance");
  t.spoken=null;SystemClock.now=5000;t.handleResult(lab.query(5000));t.assertTrue(t.spoken==null,"unchanged sample must not speak");
  SystemClock.now=60000;t.handleResult(lab.query(60000));t.assertTrue(t.spoken.contains("7.5圈"),"new card announces official laps");
  SystemClock.now=95000;t.handleResult(lab.query(95000));t.assertTrue(t.live&&t.report.optBoolean("sampleStale")&&t.report.getJSONObject("lastSample").getString("distance").equals("3000米"),"unavailable detail keeps last sample without stopping");
  SystemClock.now=120000;t.handleResult(lab.query(120000));t.assertTrue(t.live&&!t.report.optBoolean("sampleStale")&&t.spoken.contains("8圈"),"resume updates distance and speech");
  t.voiceBusy=true;t.utterances.put("failed",new JSONObject());t.callbacks.put("failed",()->{});t.voiceEnd("failed",false);t.assertTrue(t.live&&!t.voiceBusy&&t.report.getString("lastSpeechState").equals("ERROR"),"TTS failure must not stop monitoring");
  SystemClock.now=300000;t.handleResult(lab.query(300000));t.assertTrue(!t.live&&t.spoken.contains("9.5圈"),"explicit end speaks final distance then stops");
  ServiceCallsiteTest quick=new ServiceCallsiteTest();quick.simulation=new LabPlatform(0,System.currentTimeMillis(),30000,false,"pmDel",5000);SystemClock.now=0;quick.handleResult(quick.simulation.query(0));SystemClock.now=5000;quick.handleResult(quick.simulation.query(5000));quick.assertTrue(quick.scheduled==5000&&quick.spoken.contains("7.5圈"),"fast simulated updates use actual handler and official distance despite short card interval");
  System.out.println("Actual service call sites: 8 checks passed; audio and system scheduling are stubbed.");
 }
}`);
const jdk=path.join(process.env.TRACKCHECK_TEST_JDK||'C:/Program Files/Microsoft/jdk-17.0.12.7-hotspot','bin'),jar=path.join(app,'.tools/json-test.jar');
for(const [exe,args] of [['javac',['-encoding','UTF-8','-cp',jar,'-d',out,path.join(out,'ServiceCallsiteTest.java'),...['BrowserPolicy','RequestSigner','NativeApi','RunPolicy','RunPresentation','LabPlatform'].map(n=>path.join(src,n+'.java'))]],['java',['-cp',out+';'+jar,'cn.trackcheck.beta.ServiceCallsiteTest']]]){const r=cp.spawnSync(path.join(jdk,exe+'.exe'),args,{stdio:'inherit'});if(r.status)process.exit(r.status);}
