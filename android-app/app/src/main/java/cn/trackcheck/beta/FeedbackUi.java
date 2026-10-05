package cn.trackcheck.beta;

import android.app.*;
import android.content.*;
import android.text.InputType;
import android.widget.*;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Explicit foreground submissions; durable local outbox, no school session access. */
final class FeedbackUi {
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    private static final Set<String> IN_FLIGHT=Collections.synchronizedSet(new HashSet<String>());
    private final Activity a;
    private final File dir;
    private final SharedPreferences prefs;
    FeedbackUi(Activity activity){a=activity;dir=new File(a.getFilesDir(),"feedback");dir.mkdirs();prefs=a.getSharedPreferences("feedback",0);}
    private LinearLayout column(){LinearLayout l=new LinearLayout(a);l.setOrientation(1);int p=(int)(20*a.getResources().getDisplayMetrics().density);l.setPadding(p,p,p,p);return l;}
    private void text(LinearLayout l,String s){TextView v=new TextView(a);v.setText(s);l.addView(v);}
    private EditText input(LinearLayout l,String hint,String value){EditText e=new EditText(a);e.setHint(hint);e.setText(value);l.addView(e);return e;}
    private void tell(String s){if(!a.isDestroyed())new AlertDialog.Builder(a).setTitle("问题反馈").setMessage(s).setPositiveButton("知道了",null).show();}
    private File file(String id){return new File(dir,id+".json");}
    private JSONObject read(File f)throws Exception{try(InputStream in=new AtomicFile(f).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>FeedbackPayload.MAX_BYTES+65536)throw new IOException();}return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));}}
    private void save(File f,JSONObject o)throws Exception{AtomicFile af=new AtomicFile(f);FileOutputStream out=null;try{out=af.startWrite();out.write(o.toString().getBytes(StandardCharsets.UTF_8));af.finishWrite(out);}catch(Exception e){if(out!=null)af.failWrite(out);throw e;}}
    void settings(){LinearLayout l=column();text(l,"由维护者提供接收地址和测试提交码。未配置时仍可保存反馈到本机。提交码只用于上传，不是学校账号密码。");
        EditText url=input(l,"https://你的域名/v1/feedback",prefs.getString("endpoint",""));url.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);
        EditText code=input(l,"测试提交码",prefs.getString("code",""));code.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        AlertDialog d=new AlertDialog.Builder(a).setTitle("反馈服务器设置").setView(l).setPositiveButton("保存",null).setNegativeButton("取消",null).create();
        d.setOnShowListener(x->d.getButton(-1).setOnClickListener(v->{try{String u=url.getText().toString().trim();if(!u.isEmpty())u=FeedbackPayload.endpoint(u);String c=code.getText().toString().trim();if(c.contains("\n")||c.contains("\r"))throw new Exception();prefs.edit().putString("endpoint",u).putString("code",c).apply();d.dismiss();tell("设置已保存。更换服务器不会自动转发以前的反馈。");}catch(Exception e){url.setError("地址须为 HTTPS；提交码不能换行。");}}));d.show();
    }
    void compose(String version,JSONObject report){LinearLayout l=column();text(l,"填写操作步骤、实际问题和预期结果。附加报告："+(report==null?"无（仍可反馈登录或使用问题）":report.optString("reportId","本次报告")+(report.optBoolean("simulated")?" · 模拟测试":""))+"\n反馈保存在本机，只有点击提交才上传。请勿填写密码或验证码。");
        EditText desc=input(l,"例如：息屏 3 分钟后停止播报，打开 App 后恢复……",prefs.getString("draft",""));desc.setMinLines(4);desc.setGravity(48);desc.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE);desc.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(10000)});
        desc.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int af){}public void onTextChanged(CharSequence s,int st,int b,int c){prefs.edit().putString("draft",s.toString()).apply();}public void afterTextChanged(android.text.Editable e){}});
        ScrollView scroll=new ScrollView(a);scroll.addView(l);
        AlertDialog d=new AlertDialog.Builder(a).setTitle("填写问题反馈").setView(scroll).setPositiveButton("保存并准备提交",null).setNegativeButton("稍后再写",null).create();
        d.setOnShowListener(x->d.getButton(-1).setOnClickListener(v->{try{JSONObject body=FeedbackPayload.create(desc.getText().toString(),version,report);JSONObject record=new JSONObject().put("payload",body).put("endpoint",prefs.getString("endpoint","")).put("state","PENDING");save(file(body.getString("feedbackId")),record);prefs.edit().remove("draft").apply();d.dismiss();confirm(record);}catch(Exception e){desc.setError(e.getMessage()==null?"保存失败，请检查存储空间。":e.getMessage());}}));d.show();
    }
    void history(){File[] fs=dir.listFiles((d,n)->n.endsWith(".json"));if(fs==null||fs.length==0){tell("暂无反馈。请先填写问题反馈。");return;}Arrays.sort(fs,Comparator.comparingLong(File::lastModified).reversed());ArrayList<JSONObject> rows=new ArrayList<>();ArrayList<String> titles=new ArrayList<>();for(File f:fs)try{JSONObject r=read(f),p=r.getJSONObject("payload");rows.add(r);titles.add(("SENT".equals(r.optString("state"))?"已收到":"待提交")+" · "+p.optString("createdAt")+"\n"+p.optString("description").substring(0,Math.min(48,p.optString("description").length())));}catch(Exception ignored){}
        new AlertDialog.Builder(a).setTitle("反馈记录 · 点击查看或重试").setItems(titles.toArray(new String[0]),(d,i)->confirm(rows.get(i))).setNegativeButton("关闭",null).show();
    }
    private void confirm(JSONObject r){try{JSONObject p=r.getJSONObject("payload");String id=p.getString("feedbackId");if(IN_FLIGHT.contains(id)){tell("该反馈正在提交，请稍候再查看记录。");return;}if("SENT".equals(r.optString("state"))){tell("服务器已收到\n反馈编号："+id+"\n"+p.getString("description"));return;}
        String target=r.optString("endpoint");if(target.isEmpty()){target=prefs.getString("endpoint","");if(target.isEmpty()){tell("反馈已保存。请在“反馈服务器设置”填写维护者提供的地址和提交码，再从“反馈记录”重试。");return;}r.put("endpoint",FeedbackPayload.endpoint(target));save(file(id),r);}
        new AlertDialog.Builder(a).setTitle("确认提交反馈").setMessage("接收地址：\n"+target+"\n\n"+p.getString("description")+"\n\n附加："+(p.isNull("report")?"无报告":"测试 JSON（含设备、版本和运行诊断）")+"\n"+r.optString("lastError","")).setPositiveButton("提交",(d,w)->upload(r)).setNegativeButton("保留待提交",null).setNeutralButton("删除本条",(d,w)->new AlertDialog.Builder(a).setMessage("删除本机这条待提交反馈？").setPositiveButton("删除",(dd,ww)->new AtomicFile(file(id)).delete()).setNegativeButton("取消",null).show()).show();
    }catch(Exception e){tell("反馈记录无法读取。");}}
    private void upload(JSONObject record){if(!record.optString("endpoint").equals(prefs.getString("endpoint",""))){tell("这条反馈属于以前的服务器。请恢复原接收地址和对应提交码再重试；不会把新服务器的提交码发送到旧地址。");return;}String id=record.optJSONObject("payload").optString("feedbackId");if(!IN_FLIGHT.add(id)){tell("该反馈正在提交，请稍候。");return;}final String code=prefs.getString("code","");Toast.makeText(a,"正在提交；结果会保存在反馈记录中。",Toast.LENGTH_LONG).show();
        IO.execute(()->{String result;HttpURLConnection c=null;try{
            String endpoint=FeedbackPayload.endpoint(record.getString("endpoint"));c=(HttpURLConnection)new URL(endpoint).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.setRequestProperty("Authorization","Bearer "+code);
            byte[] body=record.getJSONObject("payload").toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(body.length);try(OutputStream out=c.getOutputStream()){out.write(body);}int status=c.getResponseCode();if(status!=200&&status!=201)throw new IOException("HTTP "+status+((status==401||status==403)?"：请检查测试提交码。":status==409?"：反馈编号冲突，请联系维护者。":"：未确认接收，可稍后重试。"));
            String response;try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>16384)throw new IOException("服务器回执过大。");}response=new String(out.toByteArray(),StandardCharsets.UTF_8);}
            FeedbackPayload.receipt(response,id);record.put("state","SENT");record.remove("lastError");save(file(id),record);result="提交成功，服务器已收到。\n反馈编号："+id;
        }catch(Exception e){String error=e instanceof IOException&&e.getMessage()!=null&&e.getMessage().startsWith("HTTP ")?e.getMessage():"连接或回执验证失败，请检查网络及接收地址。";result=error+"\n反馈保留在本机，可从“反馈记录”重试。";try{record.put("state","PENDING");record.put("lastError",error);save(file(id),record);}catch(Exception ignored){result+="\n保存状态失败，请检查存储空间。";}}
        finally{if(c!=null)c.disconnect();IN_FLIGHT.remove(id);}final String message=result;a.runOnUiThread(()->tell(message));});
    }
}
