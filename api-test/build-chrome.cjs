const fs=require('node:fs'),path=require('node:path');
require('./build.cjs');
const api=fs.readFileSync(path.join(__dirname,'page-bundle.js'),'utf8');
const workflow=fs.readFileSync(path.join(__dirname,'phone-workflow.js'),'utf8');
const panel=require('./chrome-panel.cjs');
const guard="if(!['webvpn.dlut.edu.cn','202.118.65.138'].includes(location.hostname)||!location.hash.startsWith('#/extExercise'))throw Error('请在已登录的学校健身长跑页面运行');";
fs.writeFileSync(path.join(__dirname,'chrome-test-snippet.js'),'(function(){'+guard+api+'\nvar module={exports:{}};'+workflow+'\n('+panel.toString()+')(module.exports);})();');
