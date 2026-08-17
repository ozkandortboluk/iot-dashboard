const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const replacement = `  public getTimescaleStats(): import('../types.js').TimescaleDBStats { return this.timescaleManager.getTimescaleStats(); }
  public async compressTimescaleChunksNow(): Promise<any> { return this.timescaleManager.compressTimescaleChunksNow(); }
  public updateTimescalePolicies(config: any): any { return this.timescaleManager.updateTimescalePolicies(config); }`;

code = code.replace(/  public getTimescaleStats[\s\S]*?stats,\n    \};\n  \}/, replacement);
fs.writeFileSync('src/server/db.ts', code);
