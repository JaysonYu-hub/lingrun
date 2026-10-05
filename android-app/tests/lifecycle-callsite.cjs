// Host harness: compile the actual Activity method bodies, replacing Android UI/storage
// dependencies only. This does not simulate an Android service, screen or OEM scheduler.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const app=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(app,'app/src/main/java/cn/trackcheck/beta/MainActivity.java'),'utf8');
function method(name){const start=source.indexOf('    private '+name);if(start<0)throw Error(name+' missing');let end=source.indexOf('\n    }',start);if((name.startsWith('synchronized String evidence')||name.startsWith('void renderHome(')||name.startsWith('boolean returnToMonitorIfNeeded(')))end=source.indexOf('\n',start)-1;else end+=5;return source.slice(start,end+1);}
const body=method('void newReport(')+'\n'+method('synchronized String evidence(')+'\n'+method('void renderHome(')+'\n'+method('boolean returnToMonitorIfNeeded(');
const out=path.join(app,'build/lifecycle-callsite');fs.mkdirSync(out,{recursive:true});
const code=`package cn.trackcheck.beta;
import org.json.*;import java.util.*;import java.io.*;
public class LifecycleCallsiteTest {
 static final String VERSION="TEST";boolean watchBackground=true,ioFailed;String mode,period="pmDel",backgroundReportId="old";JSONObject report;File reportFile;
 static class View {static final int VISIBLE=0,GONE=8;} static class Panel {int visibility=View.GONE;int getVisibility(){return visibility;}}
 Panel webPanel=new Panel(),testScroll=new Panel();String shown="";void show(String page){shown=page;}
 static class Text {String value="成功查询 17 / 17";String getText(){return "T";}void setText(String s){value=s;}}
 Text tester=new Text(),metrics=new Text(),reportText=new Text(),distanceValue=new Text(),timeValue=new Text(),countdownValue=new Text(),promptText=new Text();String lastMessage="old";
 static class Build{static final String MANUFACTURER="test",MODEL="test";static class VERSION{static final int SDK_INT=31;}}
 static class PackageInfo{String packageName="test",versionName="test";}
 static class WebView{static PackageInfo getCurrentWebViewPackage(){return new PackageInfo();}}
 static class RunService{static JSONArray authEvidence(){return new JSONArray().put(new JSONObject().put("url","https://webvpn.dlut.edu.cn/mobile/extExercise/findExeRule").put("digest","fresh-native-fingerprint").put("at",System.currentTimeMillis()));}}
 final ArrayList<String> observed=new ArrayList<>();final ArrayList<JSONObject> observedAuth=new ArrayList<>();
 static JSONObject obj(Object... v){JSONObject o=new JSONObject();for(int i=0;i<v.length;i+=2)o.put(v[i].toString(),v[i+1]);return o;}
 String stamp(){return "NOW";}File getFilesDir(){return new File(System.getProperty("java.io.tmpdir"),"trackcheck-host-fixture");}void save(){}
 ${body}
 public static void main(String[] args){LifecycleCallsiteTest a=new LifecycleCallsiteTest();int failed=0;
 a.newReport("RUN");if(a.metrics.value.contains("17")){System.out.println("FAIL: restarting leaves previous 17/17 on screen");failed++;}else System.out.println("PASS: new attempt clears old results");
 if(!a.evidence().contains("fresh-native-fingerprint")){System.out.println("FAIL: restart omits latest successful native-request authorization evidence");failed++;}else System.out.println("PASS: restart includes native-request evidence");
 a.webPanel.visibility=View.VISIBLE;if(!a.returnToMonitorIfNeeded()||!a.shown.equals("监测"))throw new AssertionError("school back must return to monitor");a.webPanel.visibility=View.GONE;a.testScroll.visibility=View.VISIBLE;if(!a.returnToMonitorIfNeeded())throw new AssertionError("test page back");a.testScroll.visibility=View.GONE;a.shown="";if(a.returnToMonitorIfNeeded()||!a.shown.isEmpty())throw new AssertionError("home handled separately");System.out.println("PASS: school/test back goes to monitor; home handled separately");
 if(failed>0)throw new AssertionError(failed+" lifecycle call-site regressions");
 }
}`;
fs.writeFileSync(path.join(out,'LifecycleCallsiteTest.java'),code);
const jdk=process.env.TRACKCHECK_TEST_JDK||'C:/Program Files/Microsoft/jdk-17.0.12.7-hotspot',jar=path.join(app,'.tools/json-test.jar');
for(const [exe,args] of [['javac',['-encoding','UTF-8','-cp',jar,'-d',out,path.join(out,'LifecycleCallsiteTest.java'),path.join(app,'app/src/main/java/cn/trackcheck/beta/RunPresentation.java')]],['java',['-cp',out+';'+jar,'cn.trackcheck.beta.LifecycleCallsiteTest']]]){const result=cp.spawnSync(path.join(jdk,'bin',exe+'.exe'),args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
