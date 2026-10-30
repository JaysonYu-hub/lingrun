// Local-only build. No downloads, uploads or credential input.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(root, '../android-app/runtime');
const core = require(path.join(runtime, 'core.cjs'));
const install = require(path.join(runtime, 'session.js'));
const observer = fs.readFileSync(path.join(root, 'scripts/observer.js'), 'utf8');
fs.mkdirSync(path.join(root, 'Resources'), { recursive: true });
fs.writeFileSync(path.join(root, 'Resources/school-session.js'),
  `// Generated locally by scripts/prepare-resources.cjs.\n(function(){\n` +
  `if(location.protocol!=='https:'||location.hostname!=='webvpn.dlut.edu.cn')return;\n` +
  `var core=(${core.toString()})();\n(${install.toString()})(core,window);\n${observer}\n})();\n`);
console.log('Prepared iOS school-session.js (local sources only).');
