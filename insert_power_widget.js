import * as fs from 'fs';
let content = fs.readFileSync('src/components/widgets/DevicesWidget.tsx', 'utf-8');

if (!content.includes('DevicePowerIcon')) {
  // Add import
  content = content.replace(
    "import { DeviceStatusDot } from './DeviceStatusDot';",
    "import { DeviceStatusDot } from './DeviceStatusDot';\nimport { DevicePowerIcon } from '../devices/DevicePowerIcon';"
  );
  
  // Add icon
  const target = `                  <p className="font-semibold text-slate-900 dark:text-white truncate">{dev.name}</p>`;
  const replacement = `                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{dev.name}</p>
                    <DevicePowerIcon device={dev} />
                  </div>`;
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/widgets/DevicesWidget.tsx', content);
}
