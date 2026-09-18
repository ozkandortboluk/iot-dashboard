import * as fs from 'fs';
let content = fs.readFileSync('CHANGELOG.md', 'utf-8');
const newLog = `## [1.23.3] - 2026-09-17
### Added
- Frontend: Cihaz listesinde (grid ve list görünümleri) ve gösterge panosu widget'ında cihazın güç kaynağını (pil/fiş) gösteren minimal \`DevicePowerIcon\` bileşeni eklendi.
- Backend: Telemetri metrikleri ayrıştırılırken cihazın pil seviyesinin otomatik olarak güncellenmesi sağlandı (battery, bat, pil vb.).

`;
content = content.replace('## [1.23.2]', newLog + '## [1.23.2]');
fs.writeFileSync('CHANGELOG.md', content);
