import * as fs from 'fs';
let content = fs.readFileSync('CHANGELOG.md', 'utf-8');
const newLog = `## [1.23.4] - 2026-09-17
### Fixed
- Frontend: Sistem genelindeki tüm Checkbox (onay kutusu) ve Radio (seçenek düğmesi) bileşenleri için, özellikle karanlık temada ("dark mode") okunabilirliği ve zıtlığı bozan yerel tarayıcı görünümleri düzeltildi. Tailwind form eklentisi olmadan da çalışan, karanlık temada göz yormayan özel küresel (global) CSS yapılandırması (src/index.css) eklendi.

`;
content = content.replace('## [1.23.3]', newLog + '## [1.23.3]');
fs.writeFileSync('CHANGELOG.md', content);
