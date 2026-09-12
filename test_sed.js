const fs = require('fs');
const glob = require('glob');

const files = [
  'src/server/repositories/device.repository.ts',
  'src/server/repositories/telemetry.repository.ts',
  'src/server/repositories/notification.repository.ts',
  'src/server/repositories/user.repository.ts',
  'src/server/repositories/alarm.repository.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // We want to replace: await this.db.postgresRepo?.someMethod(args);
  // and: await this.db.postgresRepo.someMethod(args);
  // with: if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.someMethod(args); }
  
  content = content.replace(/await this\.db\.postgresRepo\??\.([a-zA-Z0-9_]+)\(([\s\S]*?)\);/g, (match, p1, p2) => {
    // If it's part of an assignment like `const txRes = await ...`, we need to handle it.
    return match; // just testing matching
  });
  
});
