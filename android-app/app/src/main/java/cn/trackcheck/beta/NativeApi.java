package cn.trackcheck.beta;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

final class NativeApi {
    static final class Session {final String rule,detail,token,userId,period,origin,referer,userAgent;
        Session(JSONObject o){rule=o.optString("ruleUrl");detail=o.optString("detailUrl");token=o.optString("token");userId=o.optString("userId");period=o.optString("period");origin=o.optString("origin");referer=o.optString("referer","");userAgent=o.optString("userAgent","");
            if(!BrowserPolicy.endpoint(rule,origin)||!BrowserPolicy.endpoint(detail,origin)||!URI.create(rule).getPath().endsWith("findExeRule")||!URI.create(detail).getPath().endsWith("findExtExercise")||token.isEmpty()||userId.isEmpty()||!(period.equals("amDel")||period.equals("pmDel")))throw new IllegalArgumentException("invalid private session");}
    }
    static final class Result {RunPolicy.Input input=new RunPolicy.Input();JSONObject safe;String message;}
    interface Cookies {String get(String url);void set(String url,String value);}
    interface Connections {HttpURLConnection open(String url)throws Exception;}
    private final Cookies cookies;private final Connections connections;
    private final Session session;private volatile HttpURLConnection connection;private volatile boolean cancelled=false;
    NativeApi(Session s,Cookies cookies){this(s,cookies,url->(HttpURLConnection)new URL(url).openConnection());}
    NativeApi(Session s,Cookies cookies,Connections connections){session=s;this.cookies=cookies;this.connections=connections;}
    void cancel(){cancelled=true;HttpURLConnection c=connection;if(c!=null)c.disconnect();}
    // Only called after this query returned a validated PASS; never persisted or exported.
    JSONArray successfulAuthEvidence(Result result){
        JSONArray items=new JSONArray();long at=System.currentTimeMillis();String digest=RequestSigner.sha1(session.token).toLowerCase(Locale.ROOT);
        items.put(object("url",session.rule,"digest",digest,"at",at));
        if("DETAIL".equals(result.safe.optString("stage")))items.put(object("url",session.detail,"digest",digest,"at",at));
        return items;
    }
    private JSONObject post(String url,Map<String,String> fields)throws Exception{
        if(cancelled)throw new IOException("CANCELLED");HttpURLConnection c=connections.open(url);connection=c;
        try{c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json;charset=UTF-8");c.setRequestProperty("Authorization",session.token);c.setRequestProperty("Origin",session.origin);
            String cookie=cookies.get(url);if(cookie!=null)c.setRequestProperty("Cookie",cookie);if(BrowserPolicy.exercise(session.referer))c.setRequestProperty("Referer",session.referer.split("#",2)[0]);if(!session.userAgent.isEmpty())c.setRequestProperty("User-Agent",session.userAgent);
            JSONObject body=new JSONObject();for(Map.Entry<String,String> e:fields.entrySet())body.put(e.getKey(),e.getValue()==null?JSONObject.NULL:e.getValue());body.put("sign",RequestSigner.sign(fields));
            if(cancelled)throw new IOException("CANCELLED");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
            int code=c.getResponseCode();if(code!=200)throw new IOException("HTTP_"+code);String abnormal=c.getHeaderField("abnormal");if("TIMEOUT".equals(abnormal)||"NOFUN".equals(abnormal))throw new IOException("SESSION_EXPIRED");
            for(Map.Entry<String,List<String>> h:c.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(h.getKey()))for(String value:h.getValue())cookies.set(url,value);
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1){if(cancelled)throw new IOException("CANCELLED");if(out.size()+n>1024*1024)throw new IOException("RESPONSE_TOO_LARGE");out.write(bytes,0,n);}JSONObject result=new JSONObject(out.toString("UTF-8"));if(!"PASS".equals(result.optString("status")))throw new IOException("BUSINESS_ERROR");return result;}
        }finally{connection=null;c.disconnect();}
    }
    Result query()throws Exception{
        Map<String,String> fields=new HashMap<>();fields.put("userId",session.userId);JSONObject rule=post(session.rule,fields);
        if("0".equals(rule.optString("isRun")))return decode(rule,null,session.period);
        if(!rule.has("isRun"))throw new IOException("RULE_SCHEMA");fields.put("amId",rule.isNull("amId")?null:rule.optString("amId"));fields.put("pmId",rule.isNull("pmId")?null:rule.optString("pmId"));
        return decode(rule,post(session.detail,fields),session.period);
    }
    // The local test platform and real HTTP share this response decoder.
    static Result decode(JSONObject rule,JSONObject body,String period)throws Exception{
        if(!"PASS".equals(rule.optString("status")))throw new IOException("BUSINESS_ERROR");Result result=new Result();
        if("0".equals(rule.optString("isRun"))){result.input.hasSample=false;result.message="当前规则未开放跑步详情，等待可查询状态。";result.safe=object("ok",true,"stage","RULE","waiting",true,"message",result.message);return result;}
        if(!rule.has("isRun"))throw new IOException("RULE_SCHEMA");if(body==null||!"PASS".equals(body.optString("status")))throw new IOException("BUSINESS_ERROR");JSONObject d=body.optJSONObject(period);if(d==null||!d.has("exercise_run_status"))throw new IOException("DETAIL_SCHEMA");
        String status=d.optString("exercise_run_status"),distance=d.optString("distance","无"),time=d.optString("time","无");Integer remaining=null;
        if(status.equals("1")&&(d.isNull("distance")||d.isNull("time")||distance.isEmpty()||time.isEmpty()))throw new IOException("DETAIL_SCHEMA");
        if(status.equals("1")&&!d.isNull("running_countdown_time")&&!d.optString("running_countdown_time").isEmpty()){Object raw=d.get("running_countdown_time");double seconds=Double.parseDouble(raw.toString());if(raw instanceof Boolean||!Double.isFinite(seconds)||seconds<0||seconds!=Math.floor(seconds)||seconds>Integer.MAX_VALUE)throw new IOException("COUNTDOWN_SCHEMA");remaining=(int)seconds;}
        result.input.status=status;result.input.runKey=RequestSigner.sha1(period+"|"+rule.optString(period.equals("amDel")?"amId":"pmId"));JSONArray cards=d.optJSONArray("tag_path");
        if(cards!=null)for(int i=Math.max(0,cards.length()-256);i<cards.length();i++){JSONObject card=cards.optJSONObject(i);if(card==null||card.isNull("reader_id")||card.isNull("date_time"))continue;String reader=card.optString("reader_id"),text=card.optString("date_time");Long at=null;
            if(text.matches("\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:?\\d{2})?"))try{String iso=text.replace(' ','T').replaceAll("([+-]\\d{2})(\\d{2})$","$1:$2");at=iso.endsWith("Z")||iso.matches(".*[+-]\\d{2}:\\d{2}$")?OffsetDateTime.parse(iso).toInstant().toEpochMilli():LocalDateTime.parse(iso).atZone(ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli();}catch(Exception ignored){}
            result.input.cards.add(new RunPolicy.Card(RequestSigner.sha1(reader+"|"+text),RequestSigner.sha1(reader),at));}
        result.message=(period.equals("amDel")?"早操":"晚操")+"，路程"+distance+"，总用时"+time+"。"+(remaining==null?"当前无有效检查点倒计时。":"到下一个检查点还剩"+(remaining/60)+"分"+(remaining%60)+"秒。");
        result.safe=object("ok",true,"stage","DETAIL","waiting",!status.equals("1"),"sample",object("period",period,"status",status,"distance",distance,"totalTime",time,"remaining",remaining),"message",result.message,"transport","native-http");return result;
    }
    static JSONObject object(Object... values){JSONObject o=new JSONObject();try{for(int i=0;i<values.length;i+=2)o.put(String.valueOf(values[i]),values[i+1]==null?JSONObject.NULL:values[i+1]);}catch(Exception ignored){}return o;}
}
