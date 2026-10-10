/* Allows plain http to the desktop on your Wi-Fi. Run after `cap add android` / `cap sync`. */
'use strict';
const fs = require('fs');
const f = 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(f)) { console.log('No ' + f + ' yet, skipping'); process.exit(0); }
let x = fs.readFileSync(f, 'utf8');
if (!/usesCleartextTraffic/.test(x)) {
  x = x.replace('<application', '<application android:usesCleartextTraffic="true"');
  fs.writeFileSync(f, x);
  console.log('Patched cleartext traffic');
} else console.log('Already patched');
