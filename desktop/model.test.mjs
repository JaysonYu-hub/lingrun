import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {endpoint,parse,remaining,changed,publicSample} from './model.mjs';
const phone=createRequire(import.meta.url)('../phone-test/parser.js');
const body=d=>({status:'PASS',amDel:d});
const sample=(extra={})=>parse(body({exercise_run_status:'1',distance:'200米',time:'80秒',running_countdown_time:90,...extra}),'amDel');
test('allowlist supports WebVPN paths, rejects other hosts',()=>{
 assert.equal(endpoint('https://webvpn.dlut.edu.cn/http-8081/abc/service/mobile/extExercise/findExtExercise'),'findExtExercise');
 assert.equal(endpoint('https://evil.test/service/mobile/extExercise/findExtExercise'),null);
});
test('waiting can have missing numeric fields; no fabricated zero countdown',()=>{const s=parse(body({exercise_run_status:'0'}),'amDel');assert.equal(s.remaining,null);assert.equal(s.distance,'无');});
test('invalid business and running payloads rejected',()=>{assert.throws(()=>parse({status:'FAIL'},'amDel'));assert.throws(()=>sample({running_countdown_time:true}));assert.throws(()=>sample({time:null}));});
test('fresh countdown expires after stale limit',()=>{assert.equal(remaining(sample(),1000,11000),80);assert.equal(remaining(sample(),1000,47000),null);});
test('normal countdown progression silent, checkpoint reset announces',()=>{assert.equal(changed(sample(),sample({running_countdown_time:60}),0,30000),false);assert.equal(changed(sample(),sample({running_countdown_time:120}),0,30000),true);});
test('checkpoint identifiers omitted from persisted sample',()=>{assert.equal('checkpoint' in publicSample(sample()),false);});
test('phone separates morning and evening and missing countdown',()=>{const t='早操考勤\n未起跑\n跑操距离：\n无\n锻炼时长：\n无\n跑操时间：无\n晚操考勤\n跑操距离：400米\n锻炼时长：200秒';assert.equal(phone.parse(t,'早操考勤').distance,'无');assert.equal(phone.parse(t,'晚操考勤').distance,'400米');assert.equal(phone.parse(t,'早操考勤').countdown,null);});
test('phone never mistakes 200m split for countdown; rejects expired login',()=>{const t='早操考勤\n跑操距离：200米\n锻炼时长：80秒\n200米计时：80秒';assert.equal(phone.parse(t,'早操考勤').countdown,null);assert.throws(()=>phone.parse('登录超时'+t,'早操考勤'));assert.equal(phone.parse(t+'\n倒计时：1分20秒','早操考勤').countdown,'1分20秒');});
