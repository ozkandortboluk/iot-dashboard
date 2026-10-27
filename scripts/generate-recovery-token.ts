import { setupService } from '../src/server/services/setup.service.js';

console.log('==================================================');
console.log(' NexusNode IoT - Admin Recovery Token Generator ');
console.log('==================================================');

const token = setupService.getOrInitRecoveryToken(true);

console.log('\nYeni Tek Kullanımlık Kurtarma Anahtarı (Recovery Token):\n');
console.log(`  \x1b[32m${token}\x1b[0m\n`);
console.log('Bu anahtar data/.recovery_token dosyasına yazılmıştır.');
console.log('Web arayüzündeki Kurtarma Ekranına yapıştırarak yeni yönetici oluşturabilirsiniz.\n');

process.exit(0);
