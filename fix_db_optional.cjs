const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

code = code.replace(/  unregisteredDevices\?: DiscoveredNetworkDevice\[\];\n  commands\?: DeviceCommand\[\];\n/, '  unregisteredDevices?: DiscoveredNetworkDevice[];\n  commands?: DeviceCommand[];\n  telemetry?: TelemetryReading[]; // Optional transport array\n');

// Then in hydrate, process it
code = code.replace(/          if \(hydrated\.history && Object\.keys\(hydrated\.history\)\.length > 0\) \{/g, '          if (hydrated.telemetry && hydrated.telemetry.length > 0) {\n            this.telemetryRepository.addTelemetryBatchAsync(hydrated.telemetry).catch(() => {});\n          }\n          if (hydrated.history && Object.keys(hydrated.history).length > 0) {');

fs.writeFileSync('src/server/db.ts', code);
