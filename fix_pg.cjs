const fs = require('fs');

const files = [
  'src/server/repositories/device.repository.ts',
  'src/server/repositories/telemetry.repository.ts',
  'src/server/repositories/notification.repository.ts',
  'src/server/repositories/user.repository.ts',
  'src/server/repositories/alarm.repository.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/([ \t]*)await this\.db\.postgresRepo\??\.([a-zA-Z0-9_]+)\((.*?)\);/g, (match, indent, method, args) => {
    return `${indent}if (this.db.postgresRepo?.isReady()) { await this.db.postgresRepo.${method}(${args}).catch((e) => console.warn('[PG Error]', e.message)); }`;
  });
  
  fs.writeFileSync(file, content);
});
console.log("Done");
