import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log('==================================================');
console.log(' NexusNode IoT - Admin Recovery Token Generator ');
console.log('==================================================');

const tokenFile = path.join(process.cwd(), 'data', '.recovery_token');
const newToken = 'rec_token_' + crypto.randomBytes(32).toString('hex');

try {
  const dataDir = path.dirname(tokenFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(tokenFile, newToken, { encoding: 'utf8', mode: 0o600 });

  console.log('\nYeni Tek Kullanımlık Kurtarma Anahtarı (Recovery Token):\n');
  console.log(`  \x1b[32m${newToken}\x1b[0m\n`);
  console.log('Bu anahtar data/.recovery_token dosyasına başarıyla yazılmıştır.');
  console.log('Web arayüzündeki Kurtarma Ekranına yapıştırarak yeni yönetici hesabı oluşturabilirsiniz.\n');
} catch (err: any) {
  console.error('\nHATA: Kurtarma anahtarı dosyaya yazılamadı:', err?.message || err);
  process.exit(1);
}
