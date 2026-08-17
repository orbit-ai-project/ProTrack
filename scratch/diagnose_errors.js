const fs = require('fs');
const html = fs.readFileSync('/Users/yugalgarg/Desktop/FINAL/index.html', 'utf8');
const lines = html.split('\n');

console.log("Total lines in index.html:", lines.length);

// Extract inline scripts
const scriptRegex = /<script[\s\S]*?>([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 0;
const vm = require('vm');

while ((match = scriptRegex.exec(html)) !== null) {
  scriptIndex++;
  const content = match[1];
  if (!content.trim()) continue;

  try {
    new vm.Script(content, { filename: `script_${scriptIndex}.js` });
    console.log(`✅ Script block #${scriptIndex} compiled 100% CLEAN (${content.length} chars)`);
  } catch (err) {
    console.error(`❌ CRITICAL SYNTAX ERROR in Script block #${scriptIndex}:`, err.message);
  }
}
