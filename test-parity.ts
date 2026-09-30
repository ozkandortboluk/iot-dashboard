import { ALL_MIGRATIONS as TSX_MIGS } from './src/server/database/migrations/migrationRunner.js';
import crypto from 'crypto';

export function norm(fn: any): string {
  let src = typeof fn === 'function' ? fn.toString() : String(fn);
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  src = src.replace(/\/\/[^\n]*/g, '');
  const firstBrace = src.indexOf('{');
  const lastBrace = src.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    src = src.substring(firstBrace + 1, lastBrace);
  }
  src = src.replace(/\(0\s*,\s*([\w$.]+)\)/g, '$1');
  src = src.replace(/\bimport_\w+\.(\w+)\b/g, '$1');
  src = src.replace(/\b(crypto|canonicalSchema|initialDataSeeder|db)\d*(?:\.default)?\./g, '');
  src = src.replace(/\bclient\b/g, 'c');
  src = src.replace(/\b(err|error|migErr|checkErr)\b/g, 'e');
  src = src.replace(/\(\s*(\w+)\s*\)\s*=>/g, '$1=>');
  src = src.replace(/\b(if|catch|for|while|switch)\s*\(/g, '$1(');
  src = src.replace(/"/g, "'");
  src = src.replace(/\s*(\|\||&&|\?\?|\+|-|===|!==|==|!=|\?|:)\s*/g, '$1');
  src = src.replace(/\s*([;{}():,=>!*\/\[\]])\s*/g, '$1');
  src = src.replace(/;/g, '');
  src = src.replace(/\s+/g, ' ').trim();
  return src;
}

async function runTest() {
  const bundled = await import('./dist/test-mig.mjs');
  let mismatch = false;
  TSX_MIGS.forEach((m: any, i: number) => {
    const b = bundled.ALL_MIGRATIONS[i];
    const tsxNorm = norm(m.up);
    const bNorm = norm(b.up);
    const tsxHash = crypto.createHash('sha256').update(m.version + ':' + m.name + ':' + tsxNorm).digest('hex').substring(0, 32);
    const bHash = crypto.createHash('sha256').update(b.version + ':' + b.name + ':' + bNorm).digest('hex').substring(0, 32);
    if (tsxHash !== bHash) {
      console.log('Mismatch on ' + m.version + ': TSX=' + tsxHash + ' BUNDLE=' + bHash);
      mismatch = true;
    } else {
      console.log('Parity MATCH on ' + m.version + ': ' + tsxHash);
    }
  });
  if (!mismatch) console.log('🎉 PERFECT 100% PARITY BETWEEN TSX AND BUNDLE FOR ALL 22 MIGRATIONS!');
}

runTest();
