'use strict';
function parse(text, label) {
  if (/登录超时|登录失效/.test(text)) throw Error('登录失效');
  var start=text.indexOf(label);
  if(start<0)throw Error('未看到所选考勤标题，请让标题和数据同时可见');
  var part=text.slice(start+label.length).split(/早操考勤|晚操考勤/)[0];
  function field(name){var m=new RegExp(name+'\\s*[:：]\\s*([^\\n]+)').exec(part);if(!m)throw Error('无法读取'+name);return m[1].split(/锻炼时长|跑操时间|跑操过程/)[0].trim();}
  var distance=field('跑操距离'),duration=field('锻炼时长');
  if(!distance||!duration)throw Error('字段值为空');
  // Only explicitly labelled countdown text. Never interpret a 200m split as remaining time.
  var m=/(?:到(?:下一个|下一|下个)(?:检查点|计时点)(?:还)?剩余?(?:时间)?|倒计时)\s*[:：]?\s*(\d+分\s*\d+秒|\d+秒|\d+:\d{2})/.exec(part);
  return {period:label,waiting:part.indexOf('未起跑')>=0,distance:distance,totalTime:duration,countdown:m?m[1]:null};
}
module.exports={parse:parse};
