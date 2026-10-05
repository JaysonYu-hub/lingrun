package cn.trackcheck.beta;
public final class BrowserPolicyTest {
    private static int count=0;
    private static void check(boolean b){count++;if(!b)throw new AssertionError("check "+count);}
    public static void main(String[] args){
        check(BrowserPolicy.allowNavigation(BrowserPolicy.ENTRY));
        check(BrowserPolicy.allowNavigation("https://sso.dlut.edu.cn/cas/login"));
        check(!BrowserPolicy.allowNavigation("https://dlut.edu.cn.evil.example/"));
        check(!BrowserPolicy.allowNavigation("https://user:password@webvpn.dlut.edu.cn/"));
        check(!BrowserPolicy.allowNavigation("https://webvpn.dlut.edu.cn:444/"));
        check(!BrowserPolicy.allowNavigation("javascript:alert(1)"));
        check(!BrowserPolicy.allowNavigation("file:///sdcard/test.html"));
        check(!BrowserPolicy.exercise(BrowserPolicy.ENTRY));
        check(BrowserPolicy.exercise(BrowserPolicy.ENTRY.replace("#/index","#/extExercise?title=test")));
        check(!BrowserPolicy.exercise(BrowserPolicy.ENTRY.replace("#/index","#/extExerciseOther")));
        check(!BrowserPolicy.exercise("https://sso.dlut.edu.cn/mobilenew/#/extExercise"));
        check(BrowserPolicy.exercise("http://202.118.65.138:8081/mobilenew/#/extExercise"));
        check(BrowserPolicy.endpoint("https://webvpn.dlut.edu.cn/http-8081/test/service/mobile/extExercise/findExeRule","https://webvpn.dlut.edu.cn"));
        check(!BrowserPolicy.endpoint("http://202.118.65.138:8081/service/mobile/extExercise/findExeRule","https://webvpn.dlut.edu.cn"));
        check(!BrowserPolicy.endpoint("https://webvpn.dlut.edu.cn/service/mobile/extExercise/writeResult","https://webvpn.dlut.edu.cn"));
        System.out.println("Browser origin/navigation policy: "+count+" checks passed");
    }
}
