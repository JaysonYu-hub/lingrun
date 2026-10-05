package cn.trackcheck.beta;

import org.json.*;
import java.net.URI;
import java.util.*;

/** Feedback has its own identity: retries must send exactly the saved body. */
public final class FeedbackPayload {
    public static final int MAX_BYTES=4*1024*1024;
    public static String endpoint(String value) throws Exception {
        URI u=new URI(value.trim());
        if(!"https".equalsIgnoreCase(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getFragment()!=null||u.getQuery()!=null)
            throw new IllegalArgumentException("请填写 HTTPS 接收地址，不含账号、查询参数或 #。");
        return u.toASCIIString();
    }
    public static JSONObject create(String description,String version,JSONObject report) throws Exception {
        description=description.trim();
        if(description.length()<5||description.length()>10000)throw new IllegalArgumentException("问题描述请填写 5 至 10000 个字符。");
        JSONObject o=new JSONObject();o.put("schema",1);o.put("feedbackId",UUID.randomUUID().toString());
        o.put("createdAt",new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.ROOT).format(new Date()));
        o.put("appVersion",version);o.put("description",description);
        o.put("report",report==null?JSONObject.NULL:clean(report));
        if(o.toString().getBytes("UTF-8").length>MAX_BYTES)throw new IllegalArgumentException("反馈超过 4 MB，请单独导出报告联系维护者。");
        return o;
    }
    static Object clean(Object value) throws Exception {
        if(value instanceof JSONObject){JSONObject r=new JSONObject();JSONObject src=(JSONObject)value;
            Iterator<String> keys=src.keys();while(keys.hasNext()){String k=keys.next();String n=k.toLowerCase(Locale.ROOT).replaceAll("[^a-z]","");
                if(n.contains("password")||n.contains("cookie")||n.contains("token")||n.equals("authorization")||n.equals("latitude")||n.equals("longitude"))continue;
                r.put(k,clean(src.get(k)));}return r;
        }
        if(value instanceof JSONArray){JSONArray a=new JSONArray();JSONArray src=(JSONArray)value;for(int i=0;i<src.length();i++)a.put(clean(src.get(i)));return a;}
        return value;
    }
    public static String receipt(String body,String expectedId) throws Exception {
        JSONObject r=new JSONObject(body);
        if(!r.optBoolean("ok")||!expectedId.equals(r.optString("feedbackId")))throw new IllegalArgumentException("接收回执不匹配，保留原反馈供重试。");
        return r.getString("feedbackId");
    }
}
