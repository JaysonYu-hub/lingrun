// 可在 HTTP 网页中使用，无 Web Crypto / 外部依赖。
function createCore() {
  const origin = 'http://202.118.65.138:8081';
  function sha1(text) {
    const bytes = new TextEncoder().encode(text);
    const size = Math.ceil((bytes.length + 9) / 64) * 64;
    const buffer = new Uint8Array(size); buffer.set(bytes); buffer[bytes.length] = 128;
    const view = new DataView(buffer.buffer);
    view.setUint32(size - 8, Math.floor(bytes.length / 0x20000000));
    view.setUint32(size - 4, (bytes.length * 8) >>> 0);
    let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const rotate = (n, bits) => (n << bits) | (n >>> (32 - bits));
    for (let offset = 0; offset < size; offset += 64) {
      const w = new Int32Array(80);
      for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
      for (let i = 16; i < 80; i++) w[i] = rotate(w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16], 1);
      let [a,b,c,d,e] = h;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const next = (rotate(a,5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = rotate(b,30); b = a; a = next;
      }
      h = h.map((v,i) => (v + [a,b,c,d,e][i]) | 0);
    }
    return h.map(n => (n >>> 0).toString(16).padStart(8,'0')).join('').toUpperCase();
  }
  function sign(fields) {
    const pairs = Object.keys(fields).sort().filter(key => {
      if (!['userId','amId','pmId'].includes(key)) throw Error('未知查询字段');
      if (fields[key] != null && typeof fields[key] !== 'string') throw Error('ID必须为字符串');
      return fields[key] != null && fields[key] !== '';
    }).map(key => key + '=' + fields[key]);
    pairs.push('key=8d6c5b73a50d4707bd71c93882ddbc8b');
    return {...fields, sign: sha1(pairs.join('&'))};
  }
  function parse(body, period) {
    if (!['amDel','pmDel'].includes(period) || body?.status !== 'PASS') throw Error('接口未返回成功状态');
    const d = body[period];
    const scalar = x => (typeof x === 'string' && x.trim() !== '') || (typeof x === 'number' && Number.isFinite(x));
    if (!d || !scalar(d.distance) || !scalar(d.time) || !scalar(d.exercise_run_status)) throw Error('接口字段不完整');
    const raw = d.running_countdown_time;
    const seconds = raw == null || raw === '' ? null : Number(raw);
    if (seconds !== null && (!Number.isInteger(seconds) || seconds < 0 || typeof raw === 'boolean')) throw Error('倒计时格式无法确认');
    return {
      period, distance: String(d.distance), totalTime: String(d.time), status: String(d.exercise_run_status),
      remaining: seconds,
      // 只保存变化标识，不导出全部踩点信息。
      checkpoint: JSON.stringify(Array.isArray(d.tag_path) ? d.tag_path.map(p => [p.reader_id,p.date_time]) : []),
    };
  }
  function secondsText(seconds) {
    const n = Math.max(0, Math.floor(seconds));
    return (n >= 60 ? Math.floor(n/60) + '分' : '') + n % 60 + '秒';
  }
  function remaining(sample, receivedAt, now, staleMs) {
    if (!sample || now - receivedAt > staleMs || now < receivedAt || sample.status !== '1' || sample.remaining == null) return null;
    return Math.max(0, sample.remaining - Math.floor((now-receivedAt)/1000));
  }
  function meaningful(before, after, beforeAt, now) {
    if (!before) return true;
    if (['period','distance','totalTime','status','checkpoint'].some(k => before[k] !== after[k])) return true;
    if ((before.remaining == null) !== (after.remaining == null)) return true;
    if (after.remaining == null) return false;
    const expected = Math.max(0, before.remaining - Math.floor((now-beforeAt)/1000));
    // 正常倒数不是新成绩；服务器校时或踩点重置超过3秒才作为新变化。
    return Math.abs(after.remaining - expected) > 3;
  }
  function summary(sample, seconds) {
    const label = sample.period === 'amDel' ? '早操' : '晚操';
    const duration = sample.totalTime.replace(/:/g,'比');
    return label + '，路程' + sample.distance + '，总用时' + duration + '。' +
      (seconds === null ? '当前无有效检查点倒计时。' : '到下一个检查点还剩' + secondsText(seconds) + '。');
  }
  function threshold(previous, current, already) {
    if (previous == null || current == null) return null;
    const crossed = [60,30,10,0].filter(n => previous > n && current <= n && !already.has(n));
    crossed.forEach(n => already.add(n));
    return crossed.length ? Math.min(...crossed) : null;
  }
  return {origin,sha1,sign,parse,remaining,meaningful,summary,threshold,secondsText};
}
module.exports = createCore;
