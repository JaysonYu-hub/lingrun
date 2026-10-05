export const ENTRY = 'https://webvpn.dlut.edu.cn/http-8081/57787a7876706e323032336b657940242a485056ad52cb00fc19b469c2e3/mobilenew/#/index';
export function endpoint(raw) {
  const u = new URL(raw);
  if (!['webvpn.dlut.edu.cn','202.118.65.138'].includes(u.hostname)) return null;
  return /\/mobile\/extExercise\/(findExeRule|findExtExercise)$/.exec(u.pathname)?.[1] ?? null;
}
export function parse(body, period) {
  if (body?.status !== 'PASS') throw Error('业务响应未成功');
  const d = body[period];
  if (!d || d.exercise_run_status == null) throw Error('所选考勤缺少状态字段');
  const active = String(d.exercise_run_status) === '1';
  const scalar = v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
  if (active && (!scalar(d.distance) || !scalar(d.time))) throw Error('跑步数据字段不完整');
  const raw = d.running_countdown_time;
  const seconds = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (seconds !== null && (!scalar(raw) || !Number.isInteger(seconds) || seconds < 0)) throw Error('倒计时格式异常');
  return {period, active, status: String(d.exercise_run_status), distance: scalar(d.distance) ? String(d.distance) : '无', totalTime: scalar(d.time) ? String(d.time) : '无', remaining: active ? seconds : null,
    checkpoint: JSON.stringify((Array.isArray(d.tag_path) ? d.tag_path : []).map(x => [x.reader_id,x.date_time]))};
}
export function publicSample(s) { const {checkpoint, ...safe} = s; return safe; }
export function remaining(s, at, now) {
  if (!s?.active || s.remaining === null || now < at || now-at > 45000) return null;
  return Math.max(0, s.remaining - Math.floor((now-at)/1000));
}
export function changed(a,b,at,now) {
  if (!a) return true;
  if (['period','status','distance','totalTime','checkpoint'].some(k=>a[k]!==b[k])) return true;
  const expected=remaining(a,at,now);
  return (expected===null)!==(b.remaining===null) || (expected!==null && b.remaining!==null && Math.abs(expected-b.remaining)>3);
}
export function summary(s) {
  const label=s.period==='amDel'?'早操':'晚操';
  if (!s.active) return label+'，当前没有进行中的跑步，等待起跑或新的记录。';
  return label+'，路程'+s.distance+'，总用时'+s.totalTime+'。'+(s.remaining===null?'尚无有效检查点倒计时。':'到下一检查点还剩'+Math.floor(s.remaining/60)+'分'+s.remaining%60+'秒。');
}
