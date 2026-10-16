package cn.trackcheck.beta;
/** Ask once for each missing capability; denial must not prevent the monitoring continuation. */
final class MotionPermissionPlan {
    static boolean location(boolean granted,boolean asked){return !granted&&!asked;}
    static boolean steps(int api,boolean granted,boolean asked){return api>=29&&!granted&&!asked;}
    private MotionPermissionPlan(){}
}
