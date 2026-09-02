const fs = require('fs');
let content = fs.readFileSync('src/components/DevicesView.tsx', 'utf-8');

// Remove import
content = content.replace("import { DeviceOutputsSection } from './devices/DeviceOutputsSection';\n", '');

// Remove component usage
const componentRegex = /\{\/\* 3\.1 Device Outputs & Actuator Control Section \*\/\}\n\s*<DeviceOutputsSection[\s\S]*?\/>/g;
content = content.replace(componentRegex, '');

fs.writeFileSync('src/components/DevicesView.tsx', content);
