'use strict';
function finite(n){return typeof n==='number'&&isFinite(n);}
function meters(a,b){var r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r,v=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)*Math.sin(y/2);return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));}
function create(){
 var gps=null,gpsMeters=0,lastGood=null,stillAt=null,steps=null,stepAt=null,history=[];
 function location(fix,now){
  if(!fix||!finite(fix.lat)||!finite(fix.lon)||Math.abs(fix.lat)>90||Math.abs(fix.lon)>180||!finite(fix.accuracy)||fix.accuracy>15||fix.accuracy<0||!finite(fix.at)||now-fix.at>10000||now<fix.at)return false;
  if(gps&&fix.at<=gps.at)return false;
  if(gps){var dt=(fix.at-gps.at)/1000,d=meters(gps,fix);if(lastGood!==null&&fix.at-lastGood>20000){gps=fix;stillAt=null;lastGood=fix.at;return true;}if(d/dt>9)return false;
   if(d>=Math.max(3,fix.accuracy*0.5,gps.accuracy*0.5)){gpsMeters+=d;gps=fix;stillAt=null;}else if(stillAt===null)stillAt=fix.at;
  }else gps=fix;
  lastGood=fix.at;return true;
 }
 function step(total,at){
  if(!finite(total)||total<0||Math.floor(total)!==total||!finite(at)||stepAt!==null&&at<=stepAt)return false;
  if(steps!==null&&total<steps)history=[];
  steps=total;stepAt=at;history.push({total:total,at:at});history=history.filter(function(h){return at-h.at<=30000;});return true;
 }
 function snapshot(now){
  var gpsFresh=lastGood!==null&&now-lastGood<=10000,stepsFresh=stepAt!==null&&now-stepAt<=15000;
  var first=history[0],last=history[history.length-1],cadence=null;
  if(stepsFresh&&first&&last&&last.at-first.at>=5000)cadence=(last.total-first.total)*60000/(last.at-first.at);
  return {gpsMeters:gpsMeters,gpsFresh:gpsFresh,steps:steps,stepsFresh:stepsFresh,cadence:cadence,stationary:gpsFresh&&stillAt!==null&&now-stillAt>=30000};
 }
 return {location:location,step:step,snapshot:snapshot};
}
module.exports={create:create,meters:meters};
