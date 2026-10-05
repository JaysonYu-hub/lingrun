package cn.trackcheck.beta;
import java.net.URI;
import java.util.Locale;
public final class BrowserPolicy {
    public static final String ENTRY="https://webvpn.dlut.edu.cn/http-8081/57787a7876706e323032336b657940242a485056ad52cb00fc19b469c2e3/mobilenew/#/index";
    public static boolean allowNavigation(String value) {
        try { URI u=URI.create(value); String host=u.getHost(); if(host==null||u.getUserInfo()!=null)return false;host=host.toLowerCase(Locale.ROOT);
            return "https".equals(u.getScheme())&&(u.getPort()==-1||u.getPort()==443)&&(host.equals("dlut.edu.cn")||host.endsWith(".dlut.edu.cn")) || "http".equals(u.getScheme())&&host.equals("202.118.65.138")&&u.getPort()==8081;
        }catch(Exception e){return false;}
    }
    public static String origin(String value) { try { URI u=URI.create(value);return u.getScheme()+"://"+u.getHost()+((u.getPort()==-1||u.getPort()==443&&"https".equals(u.getScheme()))?"":":"+u.getPort());}catch(Exception e){return "";} }
    public static boolean sports(String value) {if(!allowNavigation(value))return false;String o=origin(value);return o.equals("https://webvpn.dlut.edu.cn")||o.equals("http://202.118.65.138:8081");}
    public static boolean exercise(String value) {try {URI u=URI.create(value);String h=u.getFragment();return sports(value)&&u.getPath().contains("/mobilenew/")&&h!=null&&(h.equals("/extExercise")||h.startsWith("/extExercise?"));}catch(Exception e){return false;}}
    public static boolean endpoint(String value,String pageOrigin) {try {URI u=URI.create(value);return sports(value)&&origin(value).equals(pageOrigin)&&u.getPath().matches(".*/mobile/extExercise/(findExeRule|findExtExercise)/?");}catch(Exception e){return false;}}
    private BrowserPolicy() {}
}
