/**
 * Postinstall: фикс совместимости Capacitor-плагинов с AGP 9+.
 * AGP 9 запретил proguard-android.txt — нужен proguard-android-optimize.txt.
 */
const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'node_modules/@capacitor-community/keep-awake/android/build.gradle',
];

for (const relPath of filesToPatch) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes("proguard-android.txt")) {
    content = content.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Patched: ${relPath}`);
  }
}
