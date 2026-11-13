'use strict';
// Runs tsc on readme-example.ts and prints PASS or FAIL.
const { execFileSync } = require('child_process');
const path = require('path');
const tsc = path.join(__dirname, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
let out = '';
let code = 0;
try {
  out = execFileSync(process.execPath, [tsc, '-p', path.join(__dirname, 'tsconfig.repro.json')], { encoding: 'utf8', timeout: 60000 });
} catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status || 1; }
const errs = out.split('\n').filter((l) => /error TS/.test(l)).map((l) => l.replace(/^.*readme-example\.ts/, 'readme-example.ts'));
console.log(`${code === 0 ? 'PASS' : 'FAIL'} 10 README example and subscriptionCount typecheck under strict`);
console.log(`  actual:   tsc exit=${code}; ${errs.join(' | ') || 'no errors'}`);
console.log('  expected: tsc exit=0 (README says transport defaults to ajax; subscriptionCount holds a number at run time)');
process.exit(code === 0 ? 0 : 1);
