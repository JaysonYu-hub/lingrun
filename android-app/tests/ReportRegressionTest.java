package cn.trackcheck.beta;
public class ReportRegressionTest {
 public static void main(String[] args){
  RunPolicy p=new RunPolicy();RunPolicy.Input active=new RunPolicy.Input();active.status="1";active.runKey="same";active.cards.add(new RunPolicy.Card("a","A",100000L));
  p.update(active,0,100000,new RunPolicy.Motion());
  RunPolicy.Input unavailable=new RunPolicy.Input();unavailable.hasSample=false;
  RunPolicy.Decision d=p.update(unavailable,107954,207954,new RunPolicy.Motion());
  if(d.stop)throw new AssertionError("2026-10-02 trace: RULE without detail must not mean RUN_ENDED");
  if(!d.stage.equals("WAIT_DATA"))throw new AssertionError("unavailable data must be visible");
  d=p.update(active,122954,222954,new RunPolicy.Motion());if(d.stop||"BASELINE".equals(d.type))throw new AssertionError("resume existing baseline");
  RunPolicy.Input ended=new RunPolicy.Input();ended.status="2";ended.runKey="same";
  if(!p.update(ended,130000,230000,new RunPolicy.Motion()).stop)throw new AssertionError("explicit ended detail must stop");
  RunPolicy timeout=new RunPolicy();timeout.update(unavailable,0,100000,new RunPolicy.Motion());RunPolicy.Decision expired=timeout.update(unavailable,300000,400000,new RunPolicy.Motion());if(!expired.stop||!expired.type.equals("DATA_UNAVAILABLE"))throw new AssertionError("missing detail needs a bounded distinct timeout");
  System.out.println("Report regression: missing detail waits, resumes same baseline, explicit end stops.");
 }
}
