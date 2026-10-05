// Usage: node android-app/bump-version.cjs 0.1.1-beta.1 2
const fs=require('node:fs'),path=require('node:path');
const [name,codeText]=process.argv.slice(2),code=Number(codeText),file=path.join(__dirname,'version.json');
const current=JSON.parse(fs.readFileSync(file,'utf8'));
if(!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(name||'')||!Number.isInteger(code)||code<=current.versionCode)throw Error('Use a valid version name and a strictly increasing integer versionCode');
const edits=[
 ['app/src/main/AndroidManifest.xml',s=>s.replace(/android:versionCode="\d+"/,`android:versionCode="${code}"`).replace(/android:versionName="[^"]+"/,`android:versionName="${name}"`)],
 ['app/src/main/java/cn/trackcheck/beta/MainActivity.java',s=>s.replace(/VERSION="[^"]+"/,`VERSION="${name}"`)],
 ['app/build.gradle',s=>s.replace(/versionCode \d+/,`versionCode ${code}`).replace(/versionName '[^']+'/,`versionName '${name}'`)]
];
for(const [relative,update] of edits){const target=path.join(__dirname,relative);fs.writeFileSync(target,update(fs.readFileSync(target,'utf8')));}
fs.writeFileSync(file,JSON.stringify({...current,versionName:name,versionCode:code,channel:name.includes('-beta.')?'beta':'stable'},null,2)+'\n');
console.log('Updated version metadata. Review CHANGELOG and real-device acceptance before distributing.');
