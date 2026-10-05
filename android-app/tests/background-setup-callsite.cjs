// Run the real permission-routing methods with a host Activity/Intent substitute.
// A platform dialog and OEM setting still require device acceptance.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const app=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(app,'app/src/main/java/cn/trackcheck/beta/BackgroundSetup.java'),'utf8');
function between(a,b){return source.slice(source.indexOf(a),source.indexOf(b));}
const methods=between('    boolean beforeStart(', '    void show()')+between('    private void requestSystem()', '    private void openAppSettings()')+between('    boolean onPermissionsResult(', '\n}');
const out=path.join(app,'build/background-setup-callsite');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'BackgroundSetupCallsiteTest.java'),`import java.util.*;
public class BackgroundSetupCallsiteTest {
 static final int NOTIFICATION_REQUEST=610,SETTINGS_REQUEST=611;boolean exempt,notified,limited,skipNextPrompt;Runnable continuation;int shown;Preferences preferences=new Preferences();FakeActivity activity=new FakeActivity();
 static class Build {static class VERSION {static int SDK_INT=33;}}static class Manifest {static class permission {static String POST_NOTIFICATIONS="notify";}}static class PackageManager {static int PERMISSION_GRANTED=0;}
 static class Settings {static String ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS="request-exemption",ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS="battery-list",ACTION_APP_NOTIFICATION_SETTINGS="notification-settings",EXTRA_APP_PACKAGE="package";}
 static class Uri {static String parse(String s){return s;}}static class Intent {String action,data;Intent(String a){action=a;}Intent(String a,String d){action=a;data=d;}Intent putExtra(String k,String v){data=v;return this;}}
 static class ActivityNotFoundException extends RuntimeException {}static class Preferences {boolean introduced;boolean getBoolean(String k,boolean d){return introduced;}}
 static class FakeActivity {boolean notifyGranted;int permissionRequests;List<Intent> opened=new ArrayList<>();Set<String> unsupported=new HashSet<>();String getPackageName(){return "cn.trackcheck.beta";}int checkSelfPermission(String p){return notifyGranted?0:-1;}void requestPermissions(String[] p,int code){permissionRequests++;}void startActivityForResult(Intent i,int code){if(unsupported.contains(i.action))throw new ActivityNotFoundException();opened.add(i);}}
 boolean batteryExempt(){return exempt;}boolean notificationsEnabled(){return notified;}boolean restricted(){return limited;}void showDialog(){shown++;}void openAppSettings(){activity.opened.add(new Intent("app-details"));}
 ${methods}
 static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
 public static void main(String[] args){BackgroundSetupCallsiteTest t=new BackgroundSetupCallsiteTest();boolean[] started={false};check(t.beforeStart(()->started[0]=true),"first start needs explanation");check(!started[0]&&t.activity.opened.isEmpty(),"no hidden grant or automatic launch");t.requestSystem();check(t.activity.permissionRequests==1&&t.activity.opened.isEmpty(),"notification first");t.activity.notifyGranted=true;t.onPermissionsResult(610);check(t.activity.opened.get(0).action.equals("request-exemption")&&t.activity.opened.get(0).data.equals("package:cn.trackcheck.beta"),"request applies only to own package");t.onActivityResult(611);check(!t.exempt&&!started[0],"returning from settings never fabricates grant or starts monitoring");
 t.exempt=true;t.notified=true;check(!t.beforeStart(()->{}),"already ready skips explanation");t.limited=true;check(t.beforeStart(()->{}),"platform restriction is not falsely ready");t.preferences.introduced=true;check(!t.beforeStart(()->{}),"no repeat nag after prior explanation");
 BackgroundSetupCallsiteTest fallback=new BackgroundSetupCallsiteTest();fallback.activity.notifyGranted=true;fallback.activity.unsupported.add("request-exemption");fallback.requestSystem();check(fallback.activity.opened.get(0).action.equals("battery-list"),"missing direct request falls back to list");fallback.activity.opened.clear();fallback.activity.unsupported.add("battery-list");fallback.requestSystem();check(fallback.activity.opened.get(0).action.equals("app-details"),"unsupported vendor falls back to app details");
 Build.VERSION.SDK_INT=31;BackgroundSetupCallsiteTest older=new BackgroundSetupCallsiteTest();older.requestSystem();check(older.activity.permissionRequests==0&&older.activity.opened.size()==1,"Android 12 does not ask Android 13 notification permission");
 System.out.println("Background setup actual routing: 11 checks passed; system dialogs are not emulated.");}
}`);
const jdk=path.join(process.env.TRACKCHECK_TEST_JDK||'C:/Program Files/Microsoft/jdk-17.0.12.7-hotspot','bin');
for(const [tool,args] of [['javac',['-encoding','UTF-8','-d',out,path.join(out,'BackgroundSetupCallsiteTest.java')]],['java',['-cp',out,'BackgroundSetupCallsiteTest']]]){const r=cp.spawnSync(path.join(jdk,tool+'.exe'),args,{stdio:'inherit'});if(r.status)process.exit(r.status);}
