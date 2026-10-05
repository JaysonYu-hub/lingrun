package cn.trackcheck.beta;
import org.json.*;
public final class FeedbackPayloadTest {
    private static int checks;
    private static void check(boolean b){checks++;if(!b)throw new AssertionError("check "+checks);}
    public static void main(String[] args)throws Exception{
        JSONObject report=new JSONObject("{\"querySuccess\":5,\"simulated\":true,\"nested\":[{\"Cookie\":\"secret\",\"access_token\":\"secret\",\"latitude\":12,\"longitude\":13,\"status\":\"ok\"}]}");
        JSONObject p=FeedbackPayload.create("锁屏后没有及时播报，回到界面才播报。","test",report);
        check(p.getJSONObject("report").getInt("querySuccess")==5);
        check(!p.toString().contains("secret"));check(!p.toString().contains("latitude"));
        check(p.getJSONObject("report").getJSONArray("nested").getJSONObject(0).getString("status").equals("ok"));
        check(report.toString().contains("secret")); // no mutation of live report
        check(FeedbackPayload.create("登录页面无法打开。","test",null).isNull("report"));
        for(String bad:new String[]{"http://example.com/x","https://user:pass@example.com/x","https://example.com/x?token=x","https://example.com/x#hash","file:///test"}){boolean failed=false;try{FeedbackPayload.endpoint(bad);}catch(Exception e){failed=true;}check(failed);}
        check(FeedbackPayload.endpoint(" https://example.com/v1/feedback ").equals("https://example.com/v1/feedback"));
        String id=p.getString("feedbackId");check(FeedbackPayload.receipt(new JSONObject().put("ok",true).put("feedbackId",id).toString(),id).equals(id));
        boolean failed=false;try{FeedbackPayload.receipt("{\"ok\":true,\"feedbackId\":\"other\"}",id);}catch(Exception e){failed=true;}check(failed);
        failed=false;try{FeedbackPayload.create("短","test",null);}catch(Exception e){failed=true;}check(failed);
        System.out.println("Feedback payload: "+checks+" checks passed");
    }
}
