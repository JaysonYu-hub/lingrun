package cn.trackcheck.beta;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.speech.tts.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public final class MainActivity extends Activity {
    private static final String VERSION="0.4.7-beta.1";
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Handler work=new Handler(Looper.getMainLooper());
    private LinearLayout root,monitorPanel,testPanel,webPanel;
    private ScrollView monitorScroll,testScroll;
    private WebView web;
    private FrameLayout content;
    private TextView webGuide,homeGuide;
    private TextView status,metrics,motionText,reportText,distanceValue,timeValue,countdownValue,promptText;
    private RadioGroup periods,trackLayout;
    private EditText tester;
    private Button startButton,stopButton;
    private MotionTracker motion;
    private TextToSpeech tts;
    private boolean voiceReady=false,active=false,auxiliaryBusy=false,ioFailed=false,locationWanted=false,stepsWanted=false,loaded=false;
    private int generation=0,round=0,voiceSerial=0;
    private String mode="",period="amDel",lastMessage="",pendingMessage=null;
    private boolean voiceBusy=false;
    private Runnable pendingVoiceDone;
    private final HashMap<String,Runnable> voiceDone=new HashMap<>();
    private final HashMap<String,JSONObject> voiceEntries=new HashMap<>();
    private JSONObject report;
    private File reportFile;
    private byte[] exportBytes;
    private String assetsBundle,policyBundle;
    private volatile String pageOrigin="";
    private boolean watchBackground=false,foregroundVisible=false;
    private String backgroundReportId="";
    private static LabPlatform localPlatform;
    private TextView simulationText;
    private BackgroundSetup backgroundSetup;
    private TextView backgroundStatus;
    private final ArrayList<String> observed=new ArrayList<>();
    private final ArrayList<JSONObject> observedAuth=new ArrayList<>();
    private final PageNavigation pageNavigation=new PageNavigation();
    private String permissionContinuation=null;
    private boolean permissionRequestInFlight=false;

    private static JSONObject obj(Object... fields){JSONObject o=new JSONObject();try{for(int i=0;i<fields.length;i+=2)o.put(String.valueOf(fields[i]),fields[i+1]==null?JSONObject.NULL:fields[i+1]);}catch(JSONException ignored){}return o;}
    private static String stamp(){return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.ROOT).format(new Date());}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);l.setPadding(dp(16),dp(12),dp(16),dp(12));return l;}
    private TextView label(LinearLayout p,String s,int size,int color){TextView v=new TextView(this);v.setText(s);v.setTextSize(size);v.setTextColor(color);v.setPadding(0,dp(6),0,dp(6));p.addView(v);return v;}
    private Button button(LinearLayout p,String s,Runnable r){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextSize(15);b.setMinHeight(dp(48));b.setTextColor(Color.rgb(16,78,81));b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(230,243,240)));b.setOnClickListener(v->r.run());LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(4);p.addView(b,lp);return b;}
    private void primary(Button b){b.setTextColor(Color.WHITE);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(8,112,109)));}
    private TextView metric(LinearLayout parent,String title){LinearLayout box=column();box.setPadding(dp(4),dp(8),dp(4),dp(8));parent.addView(box,new LinearLayout.LayoutParams(0,-2,1));label(box,title,12,Color.rgb(91,112,116));return label(box,"—",19,Color.rgb(16,48,55));}
    private void renderHome(){RunPresentation.Home h=RunPresentation.from(report);metrics.setText(h.distance);distanceValue.setText(h.laps);timeValue.setText(h.time);countdownValue.setText(h.remaining);promptText.setText((report!=null&&report.optBoolean("simulated")?"【模拟数据，不是学校成绩】\n":"")+(report!=null&&report.optBoolean("sampleStale")?"详情暂不可用，距离为最近记录。\n":"")+h.prompt);}
    private LinearLayout card(LinearLayout p){LinearLayout c=column();GradientDrawable bg=new GradientDrawable();bg.setColor(Color.WHITE);bg.setCornerRadius(dp(20));bg.setStroke(dp(1),Color.rgb(223,233,231));c.setBackground(bg);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(12);p.addView(c,lp);return c;}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    private void status(String s){status.setText(s);}
    private boolean idle(){if(active||auxiliaryBusy||voiceBusy||RunService.running()){toast("请先点停止或完成当前测试，再进行这项设置。");return false;}return true;}
    private void dialog(String title,String message){new AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("知道了",null).show();}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);WebView.setWebContentsDebuggingEnabled(false);motion=new MotionTracker(this);backgroundSetup=new BackgroundSetup(this);
        try{assetsBundle=asset("app-bundle.js");policyBundle=asset("offline-bundle.js");}catch(IOException e){dialog("安装文件异常","请重新安装完整测试包。");finish();return;}
        root=column();root.setPadding(0,0,0,0);root.setBackgroundColor(Color.rgb(241,246,247));
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        LinearLayout header=column();root.addView(header);label(header,"凌跑助手",24,Color.rgb(16,48,55));label(header,(ClientBuild.DEVELOPER_TOOLS?"本地开发测试 · ":"内测版 · ")+VERSION,12,Color.DKGRAY);status=label(header,"先登录学校账号，再进入“健身长跑”。",13,Color.rgb(8,127,140));status.setMaxLines(3);
        content=new FrameLayout(this);root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        monitorPanel=column();monitorScroll=new ScrollView(this);monitorScroll.addView(monitorPanel);content.addView(monitorScroll);
        testPanel=column();testScroll=new ScrollView(this);testScroll.addView(testPanel);content.addView(testScroll);testScroll.setVisibility(View.GONE);
        webPanel=new LinearLayout(this);webPanel.setOrientation(LinearLayout.VERTICAL);content.addView(webPanel);webPanel.setVisibility(View.GONE);
        LinearLayout webTools=column();webTools.setPadding(dp(12),dp(6),dp(12),dp(6));webPanel.addView(webTools);webGuide=label(webTools,"登录后，在学校首页点“健身长跑”。",13,Color.rgb(8,112,109));
        LinearLayout actions=new LinearLayout(this);webTools.addView(actions);Button returnButton=new Button(this);returnButton.setText("返回监测");returnButton.setTextSize(15);primary(returnButton);returnButton.setOnClickListener(v->show("监测"));actions.addView(returnButton,new LinearLayout.LayoutParams(0,-2,1));Button pageBack=new Button(this);pageBack.setText("学校首页");pageBack.setTextSize(14);pageBack.setOnClickListener(v->openSchoolHome());actions.addView(pageBack,new LinearLayout.LayoutParams(0,-2,1));
        button(webTools,"恢复网页",this::recoverSchoolWeb);
        web=new WebView(this);webPanel.addView(web,new LinearLayout.LayoutParams(-1,0,1));web.setVisibility(View.GONE);configureWeb();
        makeMonitor();if(ClientBuild.DEVELOPER_TOOLS)makeTests();else makeSettings();
        LinearLayout nav=new LinearLayout(this);for(String name:new String[]{"监测","学校网页","测试与报告"}){Button b=new Button(this);b.setText(name.equals("测试与报告")&&!ClientBuild.DEVELOPER_TOOLS?"设置":name);b.setTextSize(12);b.setTextColor(Color.rgb(8,112,109));b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.WHITE));b.setElevation(0);b.setOnClickListener(v->show(name));nav.addView(b,new LinearLayout.LayoutParams(0,-2,1));}root.addView(nav);setContentView(root);if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleAppBack);
        tts=new TextToSpeech(this,code->{main.post(()->{if(tts==null)return;voiceReady=code==TextToSpeech.SUCCESS&&tts.setLanguage(Locale.SIMPLIFIED_CHINESE)>=0;});});
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            public void onStart(String id){main.post(()->{JSONObject e=voiceEntries.get(id);if(e!=null){put(e,"started",stamp());put(e,"state","STARTED");save();}});}
            public void onDone(String id){main.post(()->voiceComplete(id,true));}
            public void onError(String id){main.post(()->voiceComplete(id,false));}
        });
        watchBackground=RunService.running();main.post(new Runnable(){public void run(){if(isFinishing())return;if(pageNavigation.timedOut(SystemClock.elapsedRealtime())){web.stopLoading();status("学校网页加载超时，可点“学校首页”重试，或点“恢复网页”。");}updateSchoolGuide();if(watchBackground)refreshBackground();else motionText.setText(motion.display());boolean running=active||auxiliaryBusy||voiceBusy||RunService.running();startButton.setEnabled(!running);stopButton.setEnabled(running);for(int i=0;i<periods.getChildCount();i++)periods.getChildAt(i).setEnabled(!running);for(int i=0;i<trackLayout.getChildCount();i++)trackLayout.getChildAt(i).setEnabled(!running);main.postDelayed(this,1500);}});
        if(!getPreferences(0).getBoolean("usageGuideV1",false))main.post(this::showUsageGuide);
    }
    private void showUsageGuide(){new AlertDialog.Builder(this).setTitle("第一次使用：按这4步操作")
        .setMessage("1  学校登录\n点“登录 / 查看学校网页”，在应用内完成学校账号和VPN登录。每人使用自己的账号。\n\n2  进入健身长跑\n看到体育平台首页后，还要点击“健身长跑”。看到早操/晚操考勤、跑操距离等内容，才到正确页面；不是“跑步记录”。\n\n3  返回监测\n点学校网页上方绿色的“返回监测”，或底部“监测”。这是切换应用页面，会保留刚才的学校网页。不要点学校的退出登录。\n\n4  开始监测\n选择早操/晚操及100米四点或200米两点布局，点“开始监测”。首次听到试听后确认，等监测开始即可使用。没开始跑步时没有距离变化是正常的。\n\n手机返回键/返回手势在学校网页内也会先回监测页。需要重新进入时，使用“学校首页”；网页无响应时点“恢复网页”，不需要退出整个应用。\n\n遇到问题，到设置中的问题反馈导出JSON；应用不会自动上传账号或报告。")
        .setPositiveButton("去学校网页登录",(d,w)->{getPreferences(0).edit().putBoolean("usageGuideV1",true).apply();show("学校网页");})
        .setNegativeButton("知道了",(d,w)->getPreferences(0).edit().putBoolean("usageGuideV1",true).apply()).show();}
    private void updateSchoolGuide(){if(webGuide==null||homeGuide==null||web==null)return;String url=web.getUrl();boolean exercise=BrowserPolicy.exercise(url);String hint=exercise?"第3步：已到健身长跑。点“返回监测”，再点“开始监测”。":BrowserPolicy.sports(url)?"第2步：在学校首页点击“健身长跑”，不是“跑步记录”。":"第1步：完成学校/VPN登录，再进入“健身长跑”。";webGuide.setText(hint);homeGuide.setText(exercise?"已到健身长跑页面 · 可以点击开始监测":"学校登录 → 健身长跑 → 返回监测");}
    private void makeMonitor(){
        LinearLayout help=card(monitorPanel);homeGuide=label(help,"学校登录 → 健身长跑 → 返回监测",14,Color.rgb(8,112,109));button(help,"首次使用？查看操作指南",this::showUsageGuide);
        backgroundStatus=label(help,backgroundSetup.summary(),12,Color.DKGRAY);button(help,"后台运行设置 · 系统授权",()->{if(idle())backgroundSetup.show();});
        button(help,"遇到问题？导出报告",()->show("测试与报告"));
        LinearLayout overview=card(monitorPanel);label(overview,"本次运动",19,Color.rgb(16,48,55));label(overview,"平台记录路程",12,Color.rgb(91,112,116));metrics=label(overview,"—",40,Color.rgb(8,112,109));
        LinearLayout stats=new LinearLayout(this);overview.addView(stats);distanceValue=metric(stats,"折合圈数 · 400米/圈");timeValue=metric(stats,"累计用时");
        label(overview,"下个点剩余时间",12,Color.rgb(91,112,116));countdownValue=label(overview,"—",25,Color.rgb(16,48,55));label(overview,"以最近一次学校记录为准；停止后不显示倒计时。",11,Color.rgb(91,112,116));
        LinearLayout controls=card(monitorPanel);label(controls,"开始运动",19,Color.rgb(16,48,55));
        periods=new RadioGroup(this);periods.setOrientation(LinearLayout.HORIZONTAL);for(int i=0;i<2;i++){RadioButton rb=new RadioButton(this);rb.setId(101+i);rb.setText(i==0?"早操":"晚操");periods.addView(rb,new RadioGroup.LayoutParams(0,-2,1));}periods.check(101);
        controls.addView(periods);
        label(controls,"跑道布局 · 400米一圈",14,Color.DKGRAY);
        trackLayout=new RadioGroup(this);trackLayout.setOrientation(LinearLayout.VERTICAL);
        for(int meters:new int[]{100,200}){RadioButton rb=new RadioButton(this);rb.setId(1000+meters);rb.setText(meters==100?"100米间距 · 每圈4个点":"200米间距 · 每圈2个点");trackLayout.addView(rb);}
        trackLayout.check(getSharedPreferences("track-layout",MODE_PRIVATE).getInt("checkpointMeters",200)==100?1100:1200);
        trackLayout.setOnCheckedChangeListener((group,id)->getSharedPreferences("track-layout",MODE_PRIVATE).edit().putInt("checkpointMeters",id==1100?100:200).apply());
        controls.addView(trackLayout);label(controls,"按现场布局选择；监测中不可修改。圈数始终按平台距离计算。",12,Color.DKGRAY);
        startButton=button(controls,"开始监测",()->begin("RUN"));primary(startButton);stopButton=button(controls,"停止监测",()->stop("USER_STOP","已停止监测。"));stopButton.setEnabled(false);button(controls,"登录 / 查看学校网页",()->show("学校网页"));
        LinearLayout note=card(monitorPanel);label(note,"最近提示",17,Color.rgb(16,48,55));promptText=label(note,"开始监测后，将在这里显示打卡提示。",15,Color.DKGRAY);button(note,"重播提示",()->{if(RunService.running()){RunService.replay();return;}if(lastMessage.isEmpty())toast("暂无可重播的提示。");else say(lastMessage,"REPLAY",null);});
        label(monitorPanel,"圈数 = 平台累计距离 ÷ 400米，重新开始监测不会将已有距离归零。定位与计步会随监测自动启用，首次需系统授权；未授权时继续按打卡间隔估算。",12,Color.rgb(91,112,116));
    }
    private void makeTests(){
        makeSimulationControls();
        LinearLayout identity=card(testPanel);label(identity,"内测与设置",19,Color.rgb(16,48,55));label(identity,"诊断信息仅在此页和导出报告中展示。",13,Color.DKGRAY);button(identity,"使用指南 · 登录与返回监测",this::showUsageGuide);tester=new EditText(this);tester.setSingleLine(true);tester.setHint("测试代号（可选，如 T01）");tester.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(24)});identity.addView(tester);
        LinearLayout auxiliary=card(testPanel);label(auxiliary,"定位与步频辅助",18,Color.rgb(16,48,55));motionText=label(auxiliary,"辅助默认关闭。",13,Color.DKGRAY);button(auxiliary,"开启定位辅助",this::enableLocation);button(auxiliary,"开启步频辅助",this::enableSteps);button(auxiliary,"关闭所有辅助",()->{locationWanted=stepsWanted=false;motion.stop();RunService.disableMotion();status("已关闭辅助，仍可按打卡间隔估算。");});
        LinearLayout a=card(testPanel);label(a,"分项测试",19,Color.BLACK);button(a,"离线模拟 · 不请求学校",this::offline);button(a,"单次接口诊断",()->begin("SINGLE"));button(a,"五轮自动验收",()->begin("FIVE"));button(a,"中文语音试听",()->{if(idle()){if(!voiceReady){toast("中文语音引擎未就绪，请先配置系统文字转语音。");return;}newReport("VOICE");if(ioFailed)return;auxiliaryBusy=true;say("这是凌跑助手中文试听，不是实际运动成绩。","TEST",()->askHeard("试听",()->stop("VOICE_DONE","试听完成。")));}});button(a,"语音引擎设置",()->{if(idle())try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));}catch(Exception e){toast("请到系统设置中查找文字转语音。");}});button(a,"权限与传感器诊断",()->{JSONObject running=RunService.snapshot();dialog("传感器状态",RunService.running()&&running!=null?String.valueOf(running.optJSONObject("motion")):motion.diagnostics().toString());});
        LinearLayout b=card(testPanel);label(b,"报告与反馈",19,Color.BLACK);label(b,"导出会先停止当前监测，记录保存在本机。",12,Color.DKGRAY);reportText=label(b,"报告包含版本、设备/WebView信息、查询和播报状态；不含账号、密码、Token、Cookie或经纬度。",13,Color.DKGRAY);button(b,"查看本次报告",()->dialog("测试报告",report==null?"尚无报告。":report.toString()));button(b,"导出本次 JSON 报告",()->exportReport(false));button(b,"导出最近一次保存的报告",()->exportReport(true));button(b,"标记：最近业务播报听到了",()->heardBusiness(true));button(b,"标记：最近业务播报没听到",()->heardBusiness(false));
        button(a,"刷新学校页并更新会话",()->{if(!idle())return;show("学校网页");if(BrowserPolicy.exercise(web.getUrl()))web.reload();else toast("请先在学校网页进入健身长跑。");});
        button(a,"90秒后台与熄屏检查",()->begin("BACKGROUND_CHECK"));
        button(a,"应用后台/电池设置",()->{try{startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}catch(Exception e){toast("请在系统应用管理里打开凌跑助手设置。");}});
        button(a,"后台权限与系统授权",()->{if(idle())backgroundSetup.show();});
        button(b,"填写问题反馈 · 附测试 JSON",this::feedback);
        button(b,"反馈记录 · 查看回执 / 重试",()->new FeedbackUi(this).history());
        button(b,"反馈服务器设置",()->new FeedbackUi(this).settings());
        LinearLayout c=card(testPanel);label(c,"版本与会话",19,Color.BLACK);button(c,"测试说明与更新方式",()->dialog("内测版 "+VERSION,"1. 单次诊断只验证查询。\n2. 五轮验收含试听、真实查询、结果听感确认和自动停止。\n3. 实跑需核对A→B→A、半圈与一圈。\n4. 定位/计步诊断可在走路时观察，不必开始跑步。\n5. 先做90秒后台检查；实跑服务启动后可切后台、锁屏。单次和五轮测试仍需前台。\n6. 导出报告后自行发送给维护者；应用不自动上传。\n7. 后续安装同一签名且版本号更高的APK可覆盖升级，不要先卸载。\n8. 无自动更新服务器；应用不下载或执行远程脚本。"));button(c,"清除本机学校登录",()->{if(idle())new AlertDialog.Builder(this).setTitle("清除登录").setMessage("将清除此应用的学校Cookie和网页存储，需要重新登录；本地测试报告保留。").setPositiveButton("清除",(d,w)->{CookieManager.getInstance().removeAllCookies(null);WebStorage.getInstance().deleteAllData();web.clearCache(true);web.clearHistory();observedClear();web.loadUrl("about:blank");loaded=false;status("已清除本机登录。");}).setNegativeButton("取消",null).show();});
    }
    private void makeSettings(){
        // Keep internal report sinks without displaying diagnostics or test-only controls.
        tester=new EditText(this);motionText=new TextView(this);reportText=new TextView(this);
        LinearLayout speech=card(testPanel);label(speech,"语音设置",20,Color.rgb(16,48,55));
        TextView rateLabel=label(speech,String.format(Locale.ROOT,"语速：%.1f 倍",VoiceSettings.rate(this)),16,Color.DKGRAY);
        SeekBar rate=new SeekBar(this);rate.setMax(15);rate.setProgress(Math.round((VoiceSettings.rate(this)-.5f)*10));speech.addView(rate);
        rate.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar bar,int progress,boolean user){if(user){float value=.5f+progress/10f;VoiceSettings.save(MainActivity.this,value);rateLabel.setText(String.format(Locale.ROOT,"语速：%.1f 倍",value));}}
            public void onStartTrackingTouch(SeekBar bar){}public void onStopTrackingTouch(SeekBar bar){}
        });
        label(speech,"0.5—2.0 倍，下一条播报生效，后台播报使用同一设置。",12,Color.DKGRAY);
        button(speech,"中文语音试听",()->{if(idle())say("凌跑助手语音试听。新的打卡信息会按照这个语速播报。","TEST",null);});
        button(speech,"恢复默认语速",()->{VoiceSettings.save(this,1f);rate.setProgress(5);rateLabel.setText("语速：1.0 倍");});
        button(speech,"系统语音引擎设置",()->{if(idle())try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));}catch(Exception e){toast("请在系统设置中查找文字转语音。");}});
        LinearLayout basic=card(testPanel);label(basic,"使用与权限",19,Color.rgb(16,48,55));
        button(basic,"使用指南",this::showUsageGuide);button(basic,"后台运行设置",()->{if(idle())backgroundSetup.show();});
        label(basic,"开始实跑监测会自动启用已授权的定位与计步；首次请求系统权限。拒绝、GPS关闭或缺少传感器时，仍可按打卡间隔估算。停止监测后停止采样。",13,Color.DKGRAY);
        button(basic,"定位 / 身体活动权限设置",()->{if(idle())try{startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}catch(Exception e){toast("请到系统应用管理中设置权限。");}});
        LinearLayout help=card(testPanel);label(help,"问题反馈",19,Color.rgb(16,48,55));
        label(help,"遇到问题可导出本机报告，私下发给维护者。导出会停止监测；不会自动上传。",13,Color.DKGRAY);
        button(help,"导出本次问题报告",()->exportReport(false));button(help,"导出最近保存的报告",()->exportReport(true));
        label(help,"版本 "+VERSION+" · 测试版",12,Color.DKGRAY);
    }
    private boolean prepareMotionPermissions(String selected){
        if(permissionRequestInFlight)return true;
        SharedPreferences prefs=getSharedPreferences("motion-permissions",MODE_PRIVATE);
        ArrayList<String> permissions=new ArrayList<>();
        boolean askLocation=MotionPermissionPlan.location(motion.locationPermission(),prefs.getBoolean("locationAsked",false));
        boolean askSteps=MotionPermissionPlan.steps(Build.VERSION.SDK_INT,motion.stepPermission(),prefs.getBoolean("stepsAsked",false));
        if(askLocation){permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);}
        if(askSteps)permissions.add(Manifest.permission.ACTIVITY_RECOGNITION);
        locationWanted=true;stepsWanted=true;
        if(permissions.isEmpty())return false;
        permissionContinuation=selected;permissionRequestInFlight=true;
        status("开始监测会使用定位与计步辅助。未授权时仍可按打卡间隔估算。");
        try{requestPermissions(permissions.toArray(new String[0]),404);
            SharedPreferences.Editor edit=prefs.edit();if(askLocation)edit.putBoolean("locationAsked",true);if(askSteps)edit.putBoolean("stepsAsked",true);edit.apply();
        }catch(Exception e){permissionRequestInFlight=false;permissionContinuation=null;toast("系统权限请求不可用，将按已获得的权限继续监测。");return false;}
        return true;
    }
    private void openSchoolHome(){
        if(!idle())return;
        if(!pageNavigation.begin(SystemClock.elapsedRealtime())){toast("网页正在加载，请稍候；长时间无响应可点“恢复网页”。");return;}
        loaded=true;web.stopLoading();observedClear();web.loadUrl(BrowserPolicy.ENTRY);status("正在打开学校首页……");
    }
    private void recoverSchoolWeb(){
        if(!idle())return;
        new AlertDialog.Builder(this).setTitle("恢复学校网页").setMessage("重新建立网页窗口，不清除学校登录Cookie或本地报告；会话是否仍有效由学校判断。")
            .setPositiveButton("恢复",(d,w)->{rebuildWeb();show("学校网页");})
            .setNegativeButton("取消",null).show();
    }
    private void rebuildWeb(){
        WebView old=web;web=null;
        if(old!=null){webPanel.removeView(old);old.setWebViewClient(new WebViewClient());try{old.stopLoading();}catch(Exception ignored){}old.destroy();}
        pageNavigation.reset();observedClear();pageOrigin="";loaded=false;
        web=new WebView(this);webPanel.addView(web,new LinearLayout.LayoutParams(-1,0,1));web.setVisibility(View.GONE);configureWeb();
    }
    private void makeSimulationControls(){
        LinearLayout lab=card(testPanel);label(lab,"模拟校园平台 · 原地专项测试",20,Color.rgb(148,72,0));label(lab,"本机模拟数据，不登录、不连接学校。经过同一个后台监测、判断和语音流程；不能替代真实芯片与学校网络验收。",13,Color.DKGRAY);
        simulationText=label(lab,"初始2800米（7圈），每60秒自动发布下一段200米。",14,Color.DKGRAY);
        button(lab,"自定义更新间隔与测试时长",this::configureSimulation);
        button(lab,"开始5分钟自动测试（含详情暂不可用）",()->startSimulation(300000,true,false));
        button(lab,"开始20分钟熄屏播报测试",()->startSimulation(1200000,false,false));
        button(lab,"停止后重新接入同一模拟记录",()->startSimulation(0,false,true));
        button(lab,"模拟发布：新增200米打卡",()->publishSimulation("ADD"));
        button(lab,"模拟发布：详情暂不可用30秒",()->publishSimulation("GAP"));
        button(lab,"模拟发布：明确结束跑步",()->publishSimulation("END"));
        button(lab,"停止模拟 / 当前监测",()->stop("USER_STOP","用户停止监测。"));
        button(lab,"查看模拟平台当前数据",()->dialog("模拟平台发布数据",localPlatform==null?"请先开始模拟测试。":localPlatform.state(SystemClock.elapsedRealtime()).toString()));
    }
    private void publishSimulation(String action){if(!ClientBuild.DEVELOPER_TOOLS)return;if(!RunService.running()||report==null||!report.optBoolean("simulated")){toast("请先启动模拟测试；不会向学校发布数据。");return;}RunService.labPublish(action);toast("已提交模拟更新，下一次轮询读取。连续手动打卡过快时仅更新距离，不用于速度估算。");}
    private void startSimulation(long duration,boolean gap,boolean reuse){
        startSimulation(duration,gap,reuse,60000);
    }
    private void configureSimulation(){
        if(!idle())return;LinearLayout form=column();android.content.SharedPreferences prefs=getSharedPreferences("simulation-settings",MODE_PRIVATE);
        label(form,"每次发布新增200米；设置只对新建模拟生效。",14,Color.DKGRAY);
        label(form,"更新间隔（秒，5—600）",14,Color.BLACK);EditText intervalInput=new EditText(this);intervalInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);intervalInput.setSingleLine(true);intervalInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4)});intervalInput.setText(prefs.getString("intervalSeconds","20"));form.addView(intervalInput);
        label(form,"总测试时长（秒，30—7200）",14,Color.BLACK);EditText durationInput=new EditText(this);durationInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);durationInput.setSingleLine(true);durationInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(5)});durationInput.setText(prefs.getString("durationSeconds","120"));form.addView(durationInput);
        label(form,"建议20秒/120秒。总时长至少为间隔的两倍。5—10秒适合快速看数据；长语音可能合并中间提示，不保证每条都播完。",13,Color.DKGRAY);
        CheckBox gapInput=new CheckBox(this);gapInput.setText("加入第90—120秒的详情中断");gapInput.setChecked(prefs.getBoolean("gap",false));form.addView(gapInput);
        ScrollView scroll=new ScrollView(this);scroll.addView(form);AlertDialog dialog=new AlertDialog.Builder(this).setTitle("自定义模拟测试").setView(scroll).setPositiveButton("保存并开始",null).setNegativeButton("取消",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{long intervalSeconds,durationSeconds;try{intervalSeconds=Long.parseLong(intervalInput.getText().toString().trim());durationSeconds=Long.parseLong(durationInput.getText().toString().trim());}catch(NumberFormatException e){toast("请输入整数秒数。");return;}
            if(intervalSeconds<5||intervalSeconds>600){intervalInput.setError("请输入5至600秒");return;}if(durationSeconds<30||durationSeconds>7200||durationSeconds<2*intervalSeconds){durationInput.setError("须30至7200秒，且至少为间隔的两倍");return;}if(gapInput.isChecked()&&durationSeconds<150){durationInput.setError("含中断场景需至少150秒，以便检查恢复");return;}
            prefs.edit().putString("intervalSeconds",String.valueOf(intervalSeconds)).putString("durationSeconds",String.valueOf(durationSeconds)).putBoolean("gap",gapInput.isChecked()).apply();dialog.dismiss();startSimulation(durationSeconds*1000,gapInput.isChecked(),false,intervalSeconds*1000);
        }));dialog.show();
    }
    private void startSimulation(long duration,boolean gap,boolean reuse,long interval){if(!ClientBuild.DEVELOPER_TOOLS)return;
        if(!idle())return;if(backgroundSetup.beforeStart(()->startSimulation(duration,gap,reuse,interval)))return;
        if(reuse&&localPlatform==null){toast("请先运行一次模拟测试。");return;}if(reuse&&localPlatform.state(SystemClock.elapsedRealtime()).optBoolean("ended")){toast("这条模拟记录已结束，请开始一轮新的5分钟或20分钟测试。");return;}period=reuse?localPlatform.period:periods.getCheckedRadioButtonId()==101?"amDel":"pmDel";
        if(!reuse)localPlatform=new LabPlatform(SystemClock.elapsedRealtime(),System.currentTimeMillis(),duration,gap,period,interval);
        newReport("SIMULATION_BACKGROUND");if(ioFailed)return;put(report,"simulated",true);put(report,"simulationPlan",obj("durationMs",localPlatform.duration,"gapScenario",localPlatform.gap,"initialMeters",2800,"updateEveryMs",localPlatform.interval,"reused",reuse));
        cancelVoice();motion.stop();RunService.Start start=new RunService.Start();start.simulation=localPlatform;start.report=report;start.file=reportFile;
        try{backgroundReportId=report.optString("reportId");RunService.launch(this,start);watchBackground=true;reportFile=null;show("监测");renderHome();status("模拟测试启动中，请等首次提示后切后台或熄屏。");}catch(Exception e){stop("SIMULATION_START_FAILED","模拟服务启动失败，请导出报告。");}
    }
    private void show(String name){boolean fromSchool=webPanel.getVisibility()==View.VISIBLE;if(name.equals("学校网页")&&RunService.running()){toast("后台监测中；请先停止再操作登录网页。");return;}monitorScroll.setVisibility(name.equals("监测")?View.VISIBLE:View.GONE);testScroll.setVisibility(name.equals("测试与报告")?View.VISIBLE:View.GONE);webPanel.setVisibility(name.equals("学校网页")?View.VISIBLE:View.GONE);web.setVisibility(name.equals("学校网页")?View.VISIBLE:View.GONE);updateSchoolGuide();if(name.equals("学校网页")&&!loaded){loaded=true;web.loadUrl(BrowserPolicy.ENTRY);}if(fromSchool&&name.equals("监测")&&!active&&!RunService.running())status(BrowserPolicy.exercise(web.getUrl())?"请选择早操/晚操，然后点“开始监测”。":"还未进入健身长跑，可按使用指南继续准备。");}
    @SuppressWarnings("deprecation") private void configureWeb(){
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setGeolocationEnabled(false);CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){if(!r.isForMainFrame())return false;boolean allow=BrowserPolicy.allowNavigation(r.getUrl().toString());if(!allow)toast("此测试版只打开学校域名网页。");return !allow;}
            @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){if(v!=web)return;pageNavigation.pageStarted(SystemClock.elapsedRealtime());pageOrigin=BrowserPolicy.origin(url);observedClear();if(active)stop("NAVIGATION","网页已跳转，监测停止。");}
            @Override public void onPageFinished(WebView v,String url){if(v!=web)return;if(Objects.equals(url,v.getUrl()))pageNavigation.finished();updateSchoolGuide();if(!active&&!RunService.running())status(BrowserPolicy.exercise(url)?"已到健身长跑，点上方“返回监测”。":"登录后，还需在学校首页点“健身长跑”。");}
            @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();if(active)stop("TLS_ERROR","证书校验失败，已停止。");else status("学校连接证书校验失败。");}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){observe(request);return null;}
            @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail d){if(!RunService.running())stop("WEBVIEW_EXIT","网页进程已退出；已重建登录窗口，请重新进入学校网页。");if(v==web){rebuildWeb();show("监测");}return true;}
        });
    }
    private synchronized void observedClear(){observed.clear();observedAuth.clear();RunService.clearAuthEvidence();}
    private synchronized void observe(WebResourceRequest r){
        String url=r.getUrl().toString();if(!"POST".equals(r.getMethod())||!BrowserPolicy.endpoint(url,pageOrigin))return;
        if(!observed.contains(url)){observed.add(url);if(observed.size()>16)observed.remove(0);}
        for(Map.Entry<String,String> h:r.getRequestHeaders().entrySet())if(h.getKey().equalsIgnoreCase("Authorization"))try{byte[] digest=MessageDigest.getInstance("SHA-1").digest(h.getValue().getBytes(StandardCharsets.UTF_8));StringBuilder hex=new StringBuilder();for(byte b:digest)hex.append(String.format(Locale.ROOT,"%02x",b&255));observedAuth.add(obj("url",url,"digest",hex.toString(),"at",System.currentTimeMillis()));if(observedAuth.size()>16)observedAuth.remove(0);}catch(Exception ignored){}
    }
    private synchronized String evidence(){ArrayList<JSONObject> all=new ArrayList<>(observedAuth);JSONArray nativeItems=RunService.authEvidence();for(int i=0;i<nativeItems.length();i++)all.add(nativeItems.optJSONObject(i));all.sort(Comparator.comparingLong(o->o.optLong("at")));return "window.__exerciseObservedRequests="+new JSONArray(observed)+";window.__exerciseObservedAuth="+new JSONArray(all)+";";}
    private String asset(String name)throws IOException{try(InputStream in=getAssets().open(name);ByteArrayOutputStream b=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)b.write(buf,0,n);return b.toString("UTF-8");}}
    private interface Result {void accept(JSONObject o);}
    private void eval(String script,Result callback){
        final int gen=generation;if(!active||!BrowserPolicy.exercise(web.getUrl())){if(active)stop("PAGE","请先进入已登录的健身长跑页面。");return;}
        final boolean[] answered={false};work.postDelayed(()->{if(gen==generation&&active&&!answered[0]){answered[0]=true;stop("WEBVIEW_TIMEOUT","网页脚本未响应，已停止。");}},8000);
        try{web.evaluateJavascript("(function(){try{return JSON.stringify((function(){"+script+"})());}catch(e){return JSON.stringify({bridgeError:true});}})()",value->{
            if(gen!=generation||!active||answered[0])return;answered[0]=true;if(!BrowserPolicy.exercise(web.getUrl())){stop("PAGE","页面已离开健身长跑。");return;}
            try{Object decoded=new JSONTokener(value).nextValue();JSONObject o=new JSONObject(String.valueOf(decoded));if(o.optBoolean("bridgeError"))throw new Exception();callback.accept(o);}catch(Exception e){stop("SCRIPT_ERROR","网页兼容或字段处理异常，已停止，请导出报告。");}
        });}catch(Exception e){stop("WEBVIEW_ERROR","当前WebView无法执行脚本。");}
    }
    private void begin(String selected){
        if(!ClientBuild.DEVELOPER_TOOLS&&!selected.equals("RUN"))return;
        if(!idle())return;if(!BrowserPolicy.exercise(web.getUrl())){toast("还差一步：登录后请点学校首页的“健身长跑”，再点上方“返回监测”。");show("学校网页");return;}if(!selected.equals("SINGLE")&&!voiceReady){toast("中文语音引擎未就绪，请先进行中文试听或配置系统语音。");return;}
        if((selected.equals("RUN")||selected.equals("BACKGROUND_CHECK"))&&backgroundSetup.beforeStart(()->begin(selected)))return;
        if(selected.equals("RUN")&&prepareMotionPermissions(selected))return;
        cancelVoice();generation++;work.removeCallbacksAndMessages(null);mode=selected;period=periods.getCheckedRadioButtonId()==102?"pmDel":"amDel";round=0;lastMessage="";newReport(mode);if(ioFailed)return;put(report,"checkpointMeters",trackLayout.getCheckedRadioButtonId()==1100?100:200);active=true;for(int i=0;i<trackLayout.getChildCount();i++)trackLayout.getChildAt(i).setEnabled(false);periods.setEnabled(false);tester.setEnabled(false);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        motion.stop();if(!selected.equals("RUN")){if(locationWanted)motion.enableGps();if(stepsWanted)motion.enableSteps();}show(selected.equals("RUN")?"监测":"测试与报告");status("正在准备，请稍候……");
        eval(assetsBundle+";window.__appPolicy=window.__trackPolicy.create();window.__appPrevious=null;window.__appPreviousAt=0;return {checks:window.__exerciseApiSelfCheck()};",data->{
            JSONArray checks=data.optJSONArray("checks");boolean ok=checks!=null&&checks.length()>0;for(int i=0;ok&&i<checks.length();i++)ok="PASS".equals(checks.optJSONObject(i).optString("status"));event("preflight",obj("passed",ok,"source","SIMULATED"));if(!ok){stop("SELF_CHECK","离线自检未通过。");return;}
            if(mode.equals("SINGLE")||!VoiceSettings.needsAudition(this,mode)){query();return;}say("这是凌跑助手中文试听。当前是测试版本，请确认能听清。","TEST",()->askHeard("试听",()->{if(active)query();}));
        });
    }
    private void query(){
        if(active&&(mode.equals("RUN")||mode.equals("BACKGROUND_CHECK"))){handoffNative();return;}
        if(!active)return;final int gen=generation;round++;long started=SystemClock.elapsedRealtime();status("第 "+round+" 次查询中……");
        eval(evidence()+"window.__exerciseApiTest.start("+JSONObject.quote(period)+");return {started:true};",o->poll(gen,started));
    }
    private void handoffNative(){
        eval(evidence()+"return window.__exerciseApiTest.takeNativeSession("+JSONObject.quote(period)+");",result->{
            if(!foregroundVisible){stop("START_NOT_VISIBLE","请在应用前台开始后台监测。");return;}
            if(!result.optBoolean("ok")||result.optJSONObject("privateSession")==null){event("sessionHandoff",obj("ok",false,"diagnostics",result.optJSONObject("diagnostics")));stop("NATIVE_SESSION","本轮尚未开始：会话识别依据不足。请点学校网页的“学校首页”，重新进入健身长跑，网页加载完成后再开始；不必反复退出登录。");return;}
            try{RunService.Start s=new RunService.Start();s.session=new NativeApi.Session(result.getJSONObject("privateSession"));s.report=report;s.file=reportFile;s.checkpointMeters=report.optInt("checkpointMeters",200);s.gps=locationWanted;s.steps=stepsWanted;s.check=mode.equals("BACKGROUND_CHECK");
                backgroundReportId=report.optString("reportId");active=false;generation++;work.removeCallbacksAndMessages(null);cancelVoice();motion.stop();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);periods.setEnabled(true);tester.setEnabled(true);
                RunService.launch(this,s);watchBackground=true;reportFile=null;status("正在启动常驻通知与后台查询，请等提示后再切后台。");
            }catch(Exception e){active=true;stop("NATIVE_START","后台查询会话或服务启动失败；未输出登录凭据，请导出诊断报告。");}
        });
    }
    private void refreshBackground(){
        JSONObject snapshot=RunService.snapshot();if(snapshot==null||!backgroundReportId.isEmpty()&&!backgroundReportId.equals(snapshot.optString("reportId")))return;report=snapshot;reportFile=null;renderHome();
        JSONObject m=report.optJSONObject("motion");if(m!=null)motionText.setText("定位注册："+m.optBoolean("gpsRegistered")+"；合格采样 "+m.optInt("acceptedFixes")+"\n计步注册："+m.optBoolean("stepRegistered")+"；回调 "+m.optInt("stepCallbacks")+" 次");
        reportText.setText("本轮开始："+report.optString("started")+"\n状态："+report.optString("state")+"；原因："+report.optString("reason","—")+"\n成功查询 "+report.optInt("successfulQueries")+" / "+report.optInt("queries")+"\n后台 "+report.optInt("backgroundQueries")+"；熄屏/非交互 "+report.optInt("screenOffQueries")+"\n锁定查询 "+report.optInt("lockedQueries")+"；休眠事件 "+report.optInt("screenOffEvents")+"\n完整诊断数据保存在 JSON 中。");
        long due=report.optLong("nextQueryElapsedMs"),now=SystemClock.elapsedRealtime();String next=due>0?(Math.max(0,(due-now+999)/1000)+"秒后更新"):"正在更新";
        if(RunService.running())status((report.optBoolean("simulated")?"模拟测试 · ":"监测中 · ")+next+(report.optBoolean("sampleStale")?" · 等待详情恢复":"")+("ERROR".equals(report.optString("lastSpeechState"))?" · 最近播报失败":""));else status("监测已停止 · 详情见最近提示");
        if(report.optBoolean("simulated")&&localPlatform!=null)simulationText.setText("【本机模拟】\n"+localPlatform.state(SystemClock.elapsedRealtime()).toString());
        String spoken=RunPresentation.from(report).prompt;if(!spoken.equals("—"))lastMessage=spoken;
    }
    private void poll(int gen,long started){
        if(gen!=generation||!active)return;if(SystemClock.elapsedRealtime()-started>35000){stop("QUERY_TIMEOUT","接口超过35秒未完成，已停止。");return;}
        eval("return window.__exerciseApiTest.state;",state->{if(state.optBoolean("busy")){work.postDelayed(()->poll(gen,started),500);return;}JSONObject result=state.optJSONObject("result");if(result==null){stop("NO_RESULT","未取得查询结果。");return;}handle(result);});
    }
    private void handle(JSONObject result){
        if(!active)return;JSONObject sample=result.optJSONObject("sample");JSONObject stored;try{stored=new JSONObject(result.toString());if(stored.optJSONObject("sample")!=null){stored.optJSONObject("sample").remove("checkpointEvents");stored.optJSONObject("sample").remove("runKey");}}catch(Exception e){stop("RESULT_ERROR","结果无法处理。");return;}
        event("api",obj("round",round,"result",stored));put(report,"queries",round);if(!result.optBoolean("ok")){stop("API_ERROR",result.optString("message","查询失败。"));return;}put(report,"successfulQueries",report.optInt("successfulQueries")+1);save();
        renderHome();
        if(mode.equals("SINGLE")){stop("SINGLE_DONE","单次查询通过；未验证循环、运动数据和实际声音。");return;}
        long now=SystemClock.elapsedRealtime();
        if(mode.equals("RUN"))eval("return window.__appPolicy.update("+result+","+now+","+motion.snapshot()+","+System.currentTimeMillis()+");",decision->{
            put(report,"adaptive",decision);event("decision",decision);String msg=decision.optString("message","");if("null".equals(msg))msg="";if(decision.optString("type").equals("CARD_CONFIRMED"))msg+=" "+result.optString("message","");
            metrics.append("\n监测后确认区间："+decision.optInt("confirmedSegments")+"；完成 "+decision.optInt("completedLaps")+" 圈\n阶段："+decision.optString("stage")+"\n"+(msg.isEmpty()?"没有新增打卡确认，本轮静默。":msg));
            if(decision.optBoolean("stop")){final String end=msg;if(end.isEmpty())stop("RUN_ENDED","监测结束。");else say(end,"RESULT",()->stop("RUN_ENDED",end));return;}
            int delay=Math.max(5000,decision.optInt("nextMs",20000));status((delay/1000)+"秒后再次查询；预测不等于打卡确认。");int gen=generation;work.postDelayed(()->{if(active&&gen==generation)query();},delay);if(!msg.isEmpty())say(msg,"RESULT",null);
        });
        else eval("var r="+result+";var changed=window.__trackWorkflow.meaningful(window.__appPrevious,r,window.__appPreviousAt,"+now+");window.__appPrevious=r;window.__appPreviousAt="+now+";return {speak:changed};",o->{Runnable next=()->{if(!active)return;if(round>=5)finishFive();else{status("本轮完成，30秒后继续；相同数据静默。");int gen=generation;work.postDelayed(()->{if(active&&gen==generation)query();},30000);}};if(o.optBoolean("speak"))say(result.optString("message"),"RESULT",next);else next.run();});
    }
    private void finishFive(){
        eval("window.__exerciseApiTest.stop();return {stopped:!window.__exerciseApiTest.state.busy};",o->{event("autoStop",obj("passed",o.optBoolean("stopped"),"queries",round));if(!o.optBoolean("stopped")){stop("STOP_ERROR","停止检查未通过。");return;}askHeard("真实结果",()->stop("FIVE_DONE","五轮验收完成，请查看报告；运动中的准确性仍待核验。"));});
    }
    private void askHeard(String kind,Runnable done){int gen=generation;new AlertDialog.Builder(this).setTitle("是否听到"+kind+"？").setMessage(kind.equals("试听")?"请根据实际声音确认，系统播放完成回调不代表人耳听到。":"包括等待起跑等结果提示；没有变化时后续轮次可以静默。").setCancelable(false).setPositiveButton("听到了",(d,w)->{if(gen!=generation)return;event("hearing",obj("kind",kind,"heard",true,"source","USER"));if(kind.equals("试听"))VoiceSettings.confirmAudition(this);done.run();}).setNegativeButton("没听到",(d,w)->{if(gen!=generation)return;event("hearing",obj("kind",kind,"heard",false,"source","USER"));stop("VOICE_NOT_HEARD","实际听感未通过，请检查音量、输出设备和语音引擎。");}).show();}
    private void say(String message,String kind,Runnable done){
        if(!voiceReady){if(active)stop("TTS_NOT_READY","中文语音引擎未就绪。");else toast("中文语音引擎未就绪。");return;}
        if(message==null||message.isEmpty()){if(done!=null)done.run();return;}if(kind.equals("RESULT"))lastMessage=message;
        if(voiceBusy){pendingMessage=message;pendingVoiceDone=done;return;}voiceBusy=true;String id="voice-"+(++voiceSerial);int gen=generation;JSONObject e=obj("kind",kind,"text",message,"state","REQUESTED","requested",stamp());voiceEntries.put(id,e);event("speech",e);
        voiceDone.put(id,()->{if(gen!=generation)return;voiceBusy=false;if(done!=null)done.run();if(pendingMessage!=null){String next=pendingMessage;Runnable cb=pendingVoiceDone;pendingMessage=null;pendingVoiceDone=null;say(next,"QUEUED",cb);}});
        tts.setSpeechRate(VoiceSettings.rate(this));int code=tts.speak(message,TextToSpeech.QUEUE_FLUSH,null,id);if(code!=TextToSpeech.SUCCESS){voiceComplete(id,false);return;}main.postDelayed(()->{if(gen==generation&&voiceDone.containsKey(id))voiceComplete(id,false);},RatePolicy.timeout(VoiceSettings.rate(this)));
    }
    private void voiceComplete(String id,boolean ok){JSONObject e=voiceEntries.remove(id);Runnable cb=voiceDone.remove(id);if(e==null||cb==null)return;put(e,"state",ok?"DONE":"ERROR");put(e,"finished",stamp());save();if(!ok){voiceBusy=false;stop("TTS_ERROR","语音播放失败或超时，已停止。");return;}cb.run();}
    private void cancelVoice(){if(tts!=null)tts.stop();for(JSONObject e:voiceEntries.values())put(e,"state","CANCELLED");voiceEntries.clear();voiceDone.clear();voiceBusy=false;pendingMessage=null;pendingVoiceDone=null;}
    private void heardBusiness(boolean heard){if(watchBackground){RunService.hearing(heard);refreshBackground();toast("已记录实际听感。");return;}if(report==null){toast("暂无报告。");return;}event("hearing",obj("kind","最近业务提示","heard",heard,"source","USER"));toast("已记录实际听感。");}
    private void newReport(String kind){
        watchBackground=false;backgroundReportId="";metrics.setText("—");lastMessage="";ioFailed=false;mode=kind;String id=UUID.randomUUID().toString();String webVersion="unknown";try{PackageInfo info=WebView.getCurrentWebViewPackage();if(info!=null)webVersion=info.packageName+" "+info.versionName;}catch(Exception ignored){}
        report=obj("schema",1,"appVersion",VERSION,"reportId",id,"testerCode",tester.getText().toString().trim(),"mode",kind,"started",stamp(),"state","RUNNING","period",period,"queries",0,"successfulQueries",0,"device",obj("manufacturer",Build.MANUFACTURER,"model",Build.MODEL,"androidApi",Build.VERSION.SDK_INT,"webView",webVersion),"events",new JSONArray(),"limitations",new JSONArray(Arrays.asList("仅前台","当前模式的实时运动与听感需分别验证","语音完成回调不代表听感通过")));
        renderHome();File folder=new File(getFilesDir(),"reports");folder.mkdirs();reportFile=new File(folder,"report-"+System.currentTimeMillis()+".json");save();
    }
    private static void put(JSONObject o,String key,Object value){if(o!=null)try{o.put(key,value==null?JSONObject.NULL:value);}catch(JSONException ignored){}}
    private void event(String type,JSONObject data){if(report==null)return;JSONArray events=report.optJSONArray("events");events.put(obj("at",stamp(),"type",type,"data",data));while(events.length()>500)events.remove(0);save();}
    private void save(){if(report==null||reportFile==null)return;android.util.AtomicFile file=new android.util.AtomicFile(reportFile);FileOutputStream out=null;try{put(report,"motion",motion.diagnostics());out=file.startWrite();out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));file.finishWrite(out);out=null;reportText.setText("报告："+report.optString("mode")+" · "+report.optString("state")+"\n成功查询 "+report.optInt("successfulQueries")+" / "+report.optInt("queries")+"。文件仅保存在本机，可手动导出。");}catch(Exception e){if(out!=null)file.failWrite(out);ioFailed=true;if(active||auxiliaryBusy){active=auxiliaryBusy=false;generation++;work.removeCallbacksAndMessages(null);cancelVoice();motion.stop();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}status("报告写入失败，已停止任务。");}}
    private void stop(String reason,String message){
        if(RunService.running()){status("正在停止并保存报告……");RunService.stopRun(reason,this::refreshBackground);return;}
        if(!active&&!auxiliaryBusy&&!voiceBusy&&reason.equals("USER_STOP")){status("当前已停止；保留首次停止原因。");return;}
        boolean running=active;active=auxiliaryBusy=false;generation++;work.removeCallbacksAndMessages(null);cancelVoice();motion.stop();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);periods.setEnabled(true);tester.setEnabled(true);
        if(running&&BrowserPolicy.exercise(web.getUrl()))try{web.evaluateJavascript("if(window.__exerciseApiTest)window.__exerciseApiTest.stop();",null);}catch(Exception ignored){}
        if(report!=null){put(report,"finished",stamp());put(report,"reason",reason);put(report,"state",reason.equals("FIVE_DONE")?"BASIC_TEST_COMPLETE":reason.equals("SINGLE_DONE")?"QUERY_PASS":reason.equals("VOICE_DONE")?"VOICE_CHECKED":"STOPPED");put(report,"lastMessage",message);save();renderHome();}status(message);
    }
    private void enableLocation(){if(!idle())return;if(!motion.locationPermission()){requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},401);return;}locationWanted=true;status(motion.enableGps());}
    private void enableSteps(){if(!idle())return;if(!motion.stepPermission()){requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION},402);return;}stepsWanted=true;status(motion.enableSteps());}
    @Override public void onRequestPermissionsResult(int request,String[] names,int[] granted){super.onRequestPermissionsResult(request,names,granted);if(request==404){permissionRequestInFlight=false;String selected=permissionContinuation;permissionContinuation=null;if(selected!=null)main.post(()->{if(!isFinishing()&&!isDestroyed())begin(selected);});return;}if(backgroundSetup.onPermissionsResult(request)){backgroundStatus.setText(backgroundSetup.summary());return;}if(request==401){locationWanted=motion.locationPermission();status(locationWanted?motion.enableGps():"未获精确定位权限；可不启用定位继续测试。");}else if(request==402){stepsWanted=motion.stepPermission();status(stepsWanted?motion.enableSteps():"身体活动权限未获准；按打卡间隔估算仍可用。");}else if(request==403)status("通知权限设置完成，请再次点击开始；通知被拒绝时需回到应用停止任务。");}
    private void offline(){
        if(!idle())return;newReport("OFFLINE_SIMULATION");if(ioFailed)return;auxiliaryBusy=true;status("离线模拟中，不请求学校……");final int gen=++generation;WebView isolated=new WebView(this);isolated.getSettings().setJavaScriptEnabled(true);isolated.getSettings().setBlockNetworkLoads(true);isolated.getSettings().setAllowFileAccess(false);isolated.getSettings().setAllowContentAccess(false);
        final boolean[] complete={false};main.postDelayed(()->{if(!complete[0]){complete[0]=true;isolated.destroy();if(gen==generation)stop("OFFLINE_TIMEOUT","离线模拟未响应。");}},10000);
        isolated.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView v,String u){if(complete[0])return;isolated.evaluateJavascript(policyBundle+";JSON.stringify(window.__runOfflineTests())",raw->{if(complete[0])return;complete[0]=true;isolated.destroy();if(gen!=generation)return;try{JSONObject result=new JSONObject(String.valueOf(new JSONTokener(raw).nextValue()));event("offline",result);stop("OFFLINE_DONE",result.optBoolean("passed")?"离线模拟通过；不代表真实跑步、传感器或声音通过。":"离线模拟失败，请导出报告。");dialog("离线模拟",result.toString());}catch(Exception e){stop("OFFLINE_ERROR","离线模拟格式异常。");}});}});isolated.loadDataWithBaseURL(null,"<html><body>Offline</body></html>","text/html","UTF-8",null);
    }
    private void feedback(){
        new AlertDialog.Builder(this).setTitle("选择附加报告").setMessage("提交前可填写并确认问题文字。当前监测继续运行，附加的是此刻的报告快照。服务器需要由维护者先部署并配置。")
            .setPositiveButton("本次报告",(d,w)->{JSONObject r=RunService.running()?RunService.snapshot():report;openFeedback(r);})
            .setNeutralButton("最近保存的报告",(d,w)->{try{File[] fs=new File(getFilesDir(),"reports").listFiles((dir,n)->n.endsWith(".json"));if(fs==null||fs.length==0){toast("暂无保存报告，可以选择不附报告。");return;}Arrays.sort(fs,Comparator.comparingLong(File::lastModified));try(InputStream in=new android.util.AtomicFile(fs[fs.length-1]).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>FeedbackPayload.MAX_BYTES)throw new IOException();}openFeedback(new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8)));}}catch(Exception e){toast("报告读取失败或超过 4 MB，请使用原有导出功能。");}})
            .setNegativeButton("不附报告",(d,w)->openFeedback(null)).show();
    }
    private void openFeedback(JSONObject r){try{new FeedbackUi(this).compose(VERSION,r==null?null:new JSONObject(r.toString()));}catch(Exception e){toast("报告快照创建失败。");}}
    private void exportReport(boolean latest){
        if(RunService.running()){status("正在停止并保存报告……");RunService.stopRun("EXPORT",()->{refreshBackground();exportReport(latest);});return;}
        if(active||auxiliaryBusy||voiceBusy)stop("EXPORT","为导出报告已停止任务。");try{if(latest){File[] files=new File(getFilesDir(),"reports").listFiles((d,n)->n.endsWith(".json"));if(files==null||files.length==0){toast("没有已保存报告。");return;}Arrays.sort(files,Comparator.comparingLong(File::lastModified));try(InputStream in=new android.util.AtomicFile(files[files.length-1]).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);exportBytes=out.toByteArray();}}else{if(report==null){toast("请先运行一项测试。");return;}exportBytes=report.toString(2).getBytes(StandardCharsets.UTF_8);}
            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"trackcheck-"+System.currentTimeMillis()+".json");startActivityForResult(intent,501);
        }catch(Exception e){toast("无法启动报告导出。");}
    }
    @Override public void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(backgroundSetup.onActivityResult(request)){backgroundStatus.setText(backgroundSetup.summary());return;}if(request==501&&result==RESULT_OK&&data!=null&&data.getData()!=null&&exportBytes!=null)try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IOException();out.write(exportBytes);toast("报告已导出；请自行选择是否分享给维护者。");}catch(Exception e){toast("导出失败，请重试。");}exportBytes=null;}
    private boolean returnToMonitorIfNeeded(){if(webPanel.getVisibility()==View.VISIBLE||testScroll.getVisibility()==View.VISIBLE){show("监测");return true;}return false;}
    private void handleAppBack(){if(returnToMonitorIfNeeded())return;if(active||auxiliaryBusy)new AlertDialog.Builder(this).setTitle("离开当前测试？").setMessage("当前前台测试会停止。学校网页仍保留在应用中。").setPositiveButton("停止并返回桌面",(d,w)->{stop("EXIT","用户离开前台测试。");moveTaskToBack(true);}).setNegativeButton("继续测试",null).show();else moveTaskToBack(true);}
    @Override public void onBackPressed(){handleAppBack();}

    @Override protected void onResume(){super.onResume();foregroundVisible=true;RunService.visibility(true);if(backgroundStatus!=null)backgroundStatus.setText(backgroundSetup.summary());if(RunService.running())watchBackground=true;}
    @Override protected void onPause(){super.onPause();foregroundVisible=false;RunService.visibility(false);if(active||auxiliaryBusy)stop("BACKGROUND","前台测试或准备过程进入后台，任务已停止。实跑服务启动后可继续后台运行。");else{motion.stop();if(!watchBackground){cancelVoice();save();}}}
    @Override protected void onDestroy(){generation++;work.removeCallbacksAndMessages(null);main.removeCallbacksAndMessages(null);motion.stop();if(tts!=null){tts.stop();tts.shutdown();}if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}
