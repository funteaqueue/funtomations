// Parse-only ES module syntax check. `node --check` parses .js files as CommonJS
// scripts and silently misses ESM-only syntax errors (e.g. `a ?? b && c`), which
// then crash in Foundry's browser loader. This parses each file as a real module
// without executing it, so Foundry globals are never touched.
//
// Usage: node --experimental-vm-modules check_esm.mjs <files...>
import vm from 'node:vm';
import fs from 'node:fs';

if (typeof vm.SourceTextModule !== 'function') {
    console.error('vm.SourceTextModule unavailable — run with --experimental-vm-modules');
    process.exit(2);
}

let fails = 0;
const files = process.argv.slice(2);
for (const file of files) {
    try {
        new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), {identifier: file});
    } catch (error) {
        fails++;
        console.error(`PARSE FAIL: ${file} -> ${error.message}`);
    }
}
console.log(fails ? `${fails} of ${files.length} file(s) FAILED ESM parse` : `ALL ${files.length} file(s) parse as ESM`);
process.exitCode = fails ? 1 : 0;
