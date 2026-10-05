package cn.trackcheck.beta;
public class ScreenStateTest {
    static void check(boolean value,String label){if(!value)throw new AssertionError(label);}
    public static void main(String[] args){
        check(!ScreenState.offOrNonInteractive(true,2),"bright screen, including locked screen, must not count as off");
        check(ScreenState.offOrNonInteractive(true,1),"physical OFF counts even if interactive signal disagrees");
        check(ScreenState.offOrNonInteractive(false,2),"noninteractive transition retained");
        check(ScreenState.offOrNonInteractive(false,3),"noninteractive AOD distinguished in raw display field");
        check(!ScreenState.offOrNonInteractive(true,0),"unknown display must not fabricate off");
        check(!ScreenState.offOrNonInteractive(true,3),"interactive DOZE alone does not prove screen off");
        System.out.println("Screen classification: 6 cases passed; not an Android/OEM screen test.");
    }
}
