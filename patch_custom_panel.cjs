const fs = require('fs');
let code = fs.readFileSync('src/components/widgets/CustomPanelWidget.tsx', 'utf8');

code = code.replace("import { apiFetch } from '../../lib/apiFetch';", "");
code = code.replace(
  "const { latestTelemetry, devices } = useRealtime();",
  "const { latestTelemetry, devices, sendControlCommand } = useRealtime();"
);

// We need to fix handleControl
const originalHandleControl = `  const handleControl = async (item: CustomPanelItem, value: any) => {
    setLoadingItems(prev => ({ ...prev, [item.id]: true }));
    try {
      await apiFetch(\`/api/devices/\${item.deviceId}/control\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: item.metricKey,
          payload: value
        })
      });
    } catch (err) {
      console.error('Failed to control device', err);
    } finally {
      setLoadingItems(prev => ({ ...prev, [item.id]: false }));
    }
  };`;

const newHandleControl = `  const handleControl = async (item: CustomPanelItem, value: any) => {
    setLoadingItems(prev => ({ ...prev, [item.id]: true }));
    try {
      // Find the specific device to send control command to
      const device = devices.find(d => d.id === item.deviceId);
      if (device && sendControlCommand) {
        await sendControlCommand(device.apiKey || device.id, { [item.metricKey]: value });
      }
    } catch (err) {
      console.error('Failed to control device', err);
    } finally {
      setTimeout(() => {
        setLoadingItems(prev => ({ ...prev, [item.id]: false }));
      }, 500); // Give it a small feedback delay
    }
  };`;

if (code.includes(originalHandleControl)) {
  code = code.replace(originalHandleControl, newHandleControl);
} else {
  console.log("Original handleControl not found. Manual patch might be needed.");
}

fs.writeFileSync('src/components/widgets/CustomPanelWidget.tsx', code);
