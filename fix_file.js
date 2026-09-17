import * as fs from 'fs';
let content = fs.readFileSync('src/components/DevicesView.tsx', 'utf-8');
content = content.replace(/<\/div>\n                            <DevicePowerIcon device={dev} \/>/g, '</div>');
fs.writeFileSync('src/components/DevicesView.tsx', content);
