const fs=require('node:fs');
const path=require('node:path');
const core=require('../quark-api/core.cjs');
const install=require('./session.js');
const selfCheck=require('./self-check.cjs');
fs.writeFileSync(path.join(__dirname,'phone-diagnose.js'),fs.readFileSync(path.join(__dirname,'phone-main.js'),'utf8').replace('var DIAGNOSTIC_ONLY=false;','var DIAGNOSTIC_ONLY=true;'));
fs.writeFileSync(path.join(__dirname,'phone-run.js'),fs.readFileSync(path.join(__dirname,'phone-main.js'),'utf8').replace('var RUN_MODE=false;','var RUN_MODE=true;'));
fs.writeFileSync(path.join(__dirname,'page-bundle.js'),'(function(){var core=('+core.toString()+')();var install=('+install.toString()+');install(core);window.__exerciseApiSelfCheck=function(){return ('+selfCheck.toString()+')(install,core);};})();');
