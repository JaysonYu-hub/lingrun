package cn.trackcheck.beta;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
public final class RequestSigner {
    public static String sha1(String value){try{byte[] bytes=MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte v:bytes)b.append(String.format(Locale.ROOT,"%02X",v&255));return b.toString();}catch(Exception e){throw new IllegalStateException("SHA-1 unavailable");}}
    public static String sign(Map<String,String> fields){StringBuilder b=new StringBuilder();for(Map.Entry<String,String> e:new TreeMap<>(fields).entrySet()){if(!Arrays.asList("userId","amId","pmId").contains(e.getKey()))throw new IllegalArgumentException("field");if(e.getValue()!=null&&!e.getValue().isEmpty())b.append(e.getKey()).append('=').append(e.getValue()).append('&');}return sha1(b+"key=8d6c5b73a50d4707bd71c93882ddbc8b");}
    private RequestSigner(){}
}
