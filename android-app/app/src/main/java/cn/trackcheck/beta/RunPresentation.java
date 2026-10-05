package cn.trackcheck.beta;
import org.json.*;
import java.math.BigDecimal;
import java.util.regex.*;

/** Read-only user-facing projection. Full diagnostics stay in the report. */
final class RunPresentation {
    static final class Home {String laps="—",distance="—",time="—",remaining="—",prompt="开始监测后，将在这里显示打卡提示。";}
    private static String text(JSONObject o,String key){if(o==null||o.isNull(key))return "—";String v=o.optString(key,"").trim();return v.isEmpty()||v.equals("null")||v.equals("无")?"—":v;}
    static BigDecimal meters(String value){Matcher m=Pattern.compile("^([0-9]+(?:\\.[0-9]+)?)\\s*(米|m|公里|千米|km)$",Pattern.CASE_INSENSITIVE).matcher(value==null?"":value.trim());if(!m.matches())return null;BigDecimal n=new BigDecimal(m.group(1));return m.group(2).matches("(?i)公里|千米|km")?n.multiply(new BigDecimal("1000")):n;}
    static String number(BigDecimal n){return n.stripTrailingZeros().toPlainString();}
    static String lapText(JSONObject sample){BigDecimal n=meters(sample==null?null:sample.optString("distance"));return n==null?"圈数暂不可用。":"累计"+number(n)+"米，折合"+number(n.divide(new BigDecimal("400")))+"圈。";}
    static Home from(JSONObject report){Home h=new Home();if(report==null)return h;JSONObject sample=report.optJSONObject("lastSample"),d=report.optJSONObject("adaptive");JSONArray events=report.optJSONArray("events");
        if(!report.has("lastSample")&&events!=null)for(int i=events.length()-1;i>=0;i--){JSONObject e=events.optJSONObject(i);if(e!=null&&"api".equals(e.optString("type"))){JSONObject data=e.optJSONObject("data"),r=data==null?null:data.optJSONObject("result");sample=r==null?null:r.optJSONObject("sample");break;}}
        h.distance=text(sample,"distance");h.time=text(sample,"totalTime");
        BigDecimal meters=meters(h.distance);if(meters!=null){h.distance=number(meters)+"米";h.laps=number(meters.divide(new BigDecimal("400")))+" 圈";}
        if(sample!=null&&!report.optBoolean("sampleStale")&&"RUNNING".equals(report.optString("state"))&&"1".equals(sample.optString("status"))&&!sample.isNull("remaining")){int seconds=sample.optInt("remaining",-1);if(seconds>=0)h.remaining=seconds>=60?seconds/60+"分"+seconds%60+"秒":seconds+"秒";}
        if(events!=null)for(int i=events.length()-1;i>=0;i--){JSONObject e=events.optJSONObject(i),data=e==null?null:e.optJSONObject("data");if(e!=null&&"speech".equals(e.optString("type"))&&data!=null&&"RESULT".equals(data.optString("kind"))){h.prompt=text(data,"text");break;}}
        if(!"RUNNING".equals(report.optString("state"))&&!report.isNull("lastMessage"))h.prompt=text(report,"lastMessage");
        return h;
    }
}
