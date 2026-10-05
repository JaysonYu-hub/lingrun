// Browser UI only. Uses API JSON, not page text; no Android/AutoJs6 dependencies.
function chromePanel(workflow){
  if(window.__exerciseChromePanel){window.__exerciseChromePanel.show();return;}
  if(!['webvpn.dlut.edu.cn','202.118.65.138'].includes(location.hostname)||!location.hash.startsWith('#/extExercise'))throw Error('请在已登录的学校健身长跑页面加载此脚本');
  const host=document.createElement('div');host.id='exercise-chrome-test';
  Object.assign(host.style,{position:'fixed',bottom:'8px',left:'8px',right:'8px',zIndex:'2147483647'});
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=':host{font:14px system-ui;color:#172535}section{background:#fff;border:2px solid #147c7a;border-radius:12px;padding:12px;box-shadow:0 6px 24px #0003}h2{font-size:17px;margin:0 0 8px}button,select{font:inherit;min-height:40px;margin:3px;padding:6px 10px;border:1px solid #a9bdc5;border-radius:6px;background:#eef6f6;color:#172535}button:disabled{opacity:.5}pre{white-space:pre-wrap;max-height:160px;overflow:auto;font:13px system-ui;margin:8px 0}small{color:#466}';shadow.appendChild(style);
  const box=document.createElement('section');shadow.appendChild(box);
  const title=document.createElement('h2');title.textContent='Chrome · API 语音测试';box.appendChild(title);
  const select=document.createElement('select');select.setAttribute('aria-label','考勤');[['amDel','早操'],['pmDel','晚操']].forEach(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);});box.appendChild(select);
  function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;box.appendChild(b);return b;}
  let report=null,active=false,gen=0,timers=[],previous=null,at=0,round=0,confirmAction=null;
  const start=button('开始全面测试',begin);
  button('停止',()=>finish('USER_STOP'));
  button('导出报告',download);
  button('移除面板',()=>{if(active)finish('USER_STOP');document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leaving);window.removeEventListener('hashchange',leaving);host.remove();delete window.__exerciseChromePanel;});
  const status=document.createElement('pre');status.setAttribute('role','status');status.textContent='点击开始前保持学校页面已加载。5轮查询，无需刷新或无障碍。';box.appendChild(status);
  const yes=button('听到了',()=>answer(true)),no=button('未听到',()=>answer(false));yes.hidden=no.hidden=true;
  const hint=document.createElement('small');hint.textContent='前台测试约2–4分钟；后台暂停，刷新后需重新加载面板。';box.appendChild(hint);document.body.appendChild(host);
  function after(fn,ms){const id=gen;const t=setTimeout(()=>{if(id===gen)fn();},ms);timers.push(t);return t;}
  function check(name,result,message,source='BROWSER'){report.checks.push({name,status:result,message,source});}
  function cancel(){gen++;timers.forEach(clearTimeout);timers=[];window.__exerciseApiTest.stop();window.speechSynthesis?.cancel();confirmAction=null;yes.hidden=no.hidden=true;}
  function finish(reason){if(!active)return;active=false;cancel();workflow.finish(report,reason);start.disabled=select.disabled=false;status.textContent=workflow.text(report)+'\n点击“导出报告”保存本次结果。';}
  function fail(name,message){check(name,'BLOCKED',message);finish('FAILED');}
  function say(text,kind,next){
    const id=gen,utterance=new SpeechSynthesisUtterance(text),entry={kind,status:'REQUESTED'};report.speech.push(entry);utterance.lang='zh-CN';
    const voice=speechSynthesis.getVoices().find(v=>/^zh[-_]?CN$/i.test(v.lang))||speechSynthesis.getVoices().find(v=>/^zh/i.test(v.lang));if(voice)utterance.voice=voice;
    let settled=false;const timeout=after(()=>complete(false,'播放超时'),25000);
    function complete(ok,reason){if(settled||id!==gen)return;settled=true;clearTimeout(timeout);entry.status=ok?'DONE':'ERROR';if(!ok)fail('浏览器语音',reason||'播放失败，请检查中文语音支持');else next();}
    utterance.onend=()=>complete(true);utterance.onerror=()=>complete(false,'浏览器未能完成中文播报，请检查媒体音量与语音支持');
    try{speechSynthesis.speak(utterance);}catch(e){complete(false,'无法调用浏览器语音');}
  }
  function ask(text,fn){status.textContent=text;confirmAction=fn;yes.hidden=no.hidden=false;}
  function answer(heard){if(!active||!confirmAction)return;const fn=confirmAction;confirmAction=null;yes.hidden=no.hidden=true;fn(heard);}
  function begin(){
    if(active)return;cancel();report=workflow.create(select.value);report.platform='CHROME_PAGE';report.persistence='需点击导出；刷新或关闭会丢失内存报告';active=true;round=0;previous=null;start.disabled=select.disabled=true;
    const checks=window.__exerciseApiSelfCheck();report.simulated=checks;const pass=checks.every(c=>c.status==='PASS');check('模拟自检',pass?'PASS':'FAIL',checks.length+'项隔离模拟检查','SIMULATED');if(!pass){finish('FAILED');return;}
    if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){fail('中文语音引擎','本浏览器没有提供网页TTS接口');return;}
    status.textContent='正在播放中文试听……';
    // Invoked directly by the user's Start click, so browser user activation is preserved.
    say('这是Chrome接口测试的中文试听，不是实际跑步成绩。','TEST',()=>{
      check('中文语音引擎','PASS','浏览器返回播放完成，实际声音需人工确认');
      ask('刚才是否清楚听到了中文试听？',heard=>{check('中文试听确认',heard?'PASS':'FAIL','用户试听确认','USER');if(!heard){finish('FAILED');return;}query();});
    });
  }
  function query(){
    if(!active)return;round++;status.textContent='正在进行真实API查询，第'+round+'/5轮……';
    const deadline=performance.now()+35000;window.__exerciseApiTest.start(report.period);
    function poll(){
      if(!active)return;
      const state=window.__exerciseApiTest.state;
      if(state.busy){if(performance.now()>deadline){fail('真实接口','查询超时');return;}after(poll,300);return;}
      const result=state.result;if(!result){fail('真实接口','页面查询被取消');return;}
      report.samples.push({round,time:new Date().toISOString(),result});if(!result.ok){fail('真实接口第'+round+'轮',result.message);return;}
      check('真实API第'+round+'轮','PASS',result.stage==='DETAIL'?'详情查询成功':'规则查询成功，等待详情开放','LIVE');
      const now=performance.now(),changed=workflow.meaningful(previous,result,at,now);previous=result;at=now;
      status.textContent='第'+round+'/5轮：'+result.message;
      function advance(){
        if(round<5){status.textContent+='\n30秒后自动查询；当前显示的是最近一次读数。';after(query,30000);return;}
        window.__exerciseApiTest.stop();check('自动停止','PASS','已完成5轮，停止调度和接口查询');
        ask('5轮查询已完成。是否听到真实查询结果？等待起跑的提示也算。',heard=>{check('真实结果播报确认',heard?'PASS':'FAIL','用户听感确认','USER');finish('COMPLETE');});
      }
      if(changed)say(result.message,'LIVE',advance);else advance();
    }
    poll();
  }
  function download(){
    if(!report){status.textContent='暂无报告，请先运行测试。';return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='chrome-api-'+Date.now()+'.json';shadow.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function hidden(){if(document.hidden&&active)finish('BACKGROUND');}
  function leaving(){if(active)finish('NAVIGATION');}
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leaving);window.addEventListener('hashchange',leaving);
  window.__exerciseChromePanel={show:()=>{host.hidden=false;},getReport:()=>report};
}
module.exports=chromePanel;
