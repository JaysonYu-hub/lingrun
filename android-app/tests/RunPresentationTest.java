package cn.trackcheck.beta;
import org.json.*;
public final class RunPresentationTest {
    static void check(boolean b,String message){if(!b)throw new AssertionError(message);}
    public static void main(String[] args){
        JSONObject r=new JSONObject().put("state","RUNNING").put("backgroundQueries",6).put("screenOffQueries",3).put("motion",new JSONObject().put("acceptedFixes",518)).put("adaptive",new JSONObject().put("confirmedSegments",11)).put("lastSample",new JSONObject().put("distance","3000米").put("totalTime","00时35分50秒").put("status","1").put("remaining",80)).put("events",new JSONArray().put(new JSONObject().put("type","speech").put("data",new JSONObject().put("kind","RESULT").put("text","B点打卡成功。"))));
        String before=r.toString();RunPresentation.Home h=RunPresentation.from(r);
        check(h.laps.equals("7.5 圈"),"laps must use official distance even after restart");check(h.remaining.equals("1分20秒"),"checkpoint readout");check(h.distance.equals("3000米"),"official distance retained");check(h.prompt.equals("B点打卡成功。"),"last meaningful prompt retained");check(before.equals(r.toString()),"rendering does not remove exported diagnostics");
        r.put("state","STOPPED");check(RunPresentation.from(r).remaining.equals("—"),"stopped session cannot show live countdown");r.put("state","RUNNING");r.getJSONObject("lastSample").put("remaining",0);check(RunPresentation.from(r).remaining.equals("0秒"),"zero countdown is real data");r.put("lastSample",JSONObject.NULL);check(RunPresentation.from(r).distance.equals("—"),"no fabricated zero distance");check(RunPresentation.from(new JSONObject()).laps.equals("—"),"new report clears previous lap count");check(RunPresentation.from(null).prompt.contains("开始监测"),"initial state");
        System.out.println("Home presentation: 10 checks passed; diagnostic JSON retained unchanged.");
    }
}
