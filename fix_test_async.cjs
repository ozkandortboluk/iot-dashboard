const fs = require('fs');

let code = fs.readFileSync('src/tests/alarm-engine.test.ts', 'utf8');

// The error is TS1308, which means there are `await` keywords inside non-async functions. Let's make all `it(` tests async.
code = code.replace(/it\('([^']+)', \(\) => \{/g, "it('$1', async () => {");
code = code.replace(/describe\('([^']+)', \(\) => \{/g, "describe('$1', () => {"); // just to be sure describe is unchanged
// maybe it was test(...) ?
code = code.replace(/test\('([^']+)', \(\) => \{/g, "test('$1', async () => {");

fs.writeFileSync('src/tests/alarm-engine.test.ts', code);
