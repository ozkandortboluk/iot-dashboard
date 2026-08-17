const fs = require('fs');

let code = fs.readFileSync('src/server/db.ts', 'utf8');

const match = code.match(/  \/\/ Audit Logs(.*?)  \/\/ Device Downlink Commands/s);
if (match) {
  let repCode = fs.readFileSync('src/server/repositories/user.repository.ts', 'utf8');
  repCode = repCode.replace(/}$/, match[1].replace(/this\.data/g, 'this.db.data').replace(/this\.saveData/g, 'this.db.saveData').replace(/this\.postgresRepo/g, 'this.db.postgresRepo') + '\n}');
  fs.writeFileSync('src/server/repositories/user.repository.ts', repCode);
  
  const replacement = `  // Audit Logs
  public getAuditLogs(): AuditLog[] { return this.userRepository.getAuditLogs(); }
  public addAuditLog(userId: string, userName: string, action: string, severity?: AuditLog['severity']): void { return this.userRepository.addAuditLog(userId, userName, action, severity); }
  // Device Downlink Commands`;

  code = code.replace(/  \/\/ Audit Logs.*?  \/\/ Device Downlink Commands/s, replacement);
  fs.writeFileSync('src/server/db.ts', code);
}
