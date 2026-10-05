// Isolated synthetic responses. Does not use or modify real network, credentials or page state.
function selfCheck(install,core){
  var results=[];
  function check(name,fn){try{if(!fn())throw Error('assert');results.push({name:name,status:'PASS',source:'SIMULATED'});}catch(e){results.push({name:name,status:'FAIL',source:'SIMULATED'});}}
  function fixture(mode){
    var calls=[],last=null;
    var root={location:{protocol:'https:',hostname:'webvpn.dlut.edu.cn',origin:'https://webvpn.dlut.edu.cn',pathname:'/http-8081/test/mobilenew/',hash:'#/extExercise'},
      performance:{getEntriesByType:function(){return mode==='noendpoint'?[]:[{name:'https://webvpn.dlut.edu.cn/http-8081/test/service/mobile/extExercise/findExeRule'}];}},
      localStorage:{getItem:function(k){return mode==='nologin'?null:k==='userid'?'synthetic-user':'synthetic-token';}}};
    root.XMLHttpRequest=function(){last=this;};
    root.XMLHttpRequest.prototype={open:function(method,url){this.url=url;this.method=method;},setRequestHeader:function(){},abort:function(){this.aborted=true;},getResponseHeader:function(){return mode==='expired'?'TIMEOUT':null;},send:function(body){
      calls.push({method:this.method,url:this.url,body:JSON.parse(body)});if(mode==='pending')return;
      if(mode==='network'){this.onerror();return;}if(mode==='timeout'){this.ontimeout();return;}
      this.status=200;
      this.responseText=mode==='html'?'<html>login</html>':JSON.stringify(this.url.slice(-11)==='findExeRule'?{status:'PASS',isRun:mode==='waiting'?'0':'1',amId:'a',pmId:'b'}:{status:'PASS',amDel:{exercise_run_status:'1',distance:'200米',time:'80秒',running_countdown_time:mode==='invalid'?-1:90}});
      this.onload();
    }};
    var api=install(core,root);
    api.start('amDel');return {api:api,calls:calls,last:function(){return last;}};
  }
  check('规则到详情的签名查询',function(){var x=fixture('normal');return x.calls.length===2&&/^[A-F0-9]{40}$/.test(x.calls[0].body.sign)&&x.api.state.result.sample.remaining===90;});
  check('未开放详情时等待',function(){var x=fixture('waiting');return x.calls.length===1&&x.api.state.result.waiting&&!x.api.state.result.sample;});
  ['expired','network','timeout','html','invalid','nologin','noendpoint'].forEach(function(mode){
    var names={expired:'登录过期停止',network:'断网停止',timeout:'请求超时停止',html:'登录页不当数据',invalid:'拒绝异常倒计时',nologin:'无凭据不查询',noendpoint:'不猜测接口地址'};
    check(names[mode],function(){var x=fixture(mode);return x.api.state.result.ok===false&&!x.api.state.busy;});
  });
  check('无重叠请求且停止丢弃晚到结果',function(){var x=fixture('pending');x.api.start('amDel');if(x.calls.length!==1)return false;var request=x.last();x.api.stop();request.status=200;request.responseText='{}';request.onload();return request.aborted&&!x.api.state.busy&&x.api.state.result===null;});
  check('普通倒数静默，检查点重置播报',function(){var a={period:'amDel',distance:'200米',totalTime:'80秒',status:'1',checkpoint:'x',remaining:90};var b=Object.assign({},a,{remaining:60}),c=Object.assign({},b,{remaining:120});return !core.meaningful(a,b,0,30000)&&core.meaningful(a,c,0,30000);});
  return results;
}
module.exports=selfCheck;
