sed -i 's/const updated = db.setDeviceMaintenanceMode/const updated = await db.setDeviceMaintenanceMode/g' src/server/routes/devices.ts
sed -i 's/const result = db.replaceDeviceHardware/const result = await db.replaceDeviceHardware/g' src/server/routes/devices.ts

sed -i "s/router.post('\/:id\/maintenance', authenticateUser, (req/router.post('\/:id\/maintenance', authenticateUser, async (req/g" src/server/routes/devices.ts
sed -i "s/router.post('\/:id\/replace', authenticateUser, (req/router.post('\/:id\/replace', authenticateUser, async (req/g" src/server/routes/devices.ts

sed -i 's/db.processDeviceTelemetryArrival(/await db.processDeviceTelemetryArrival(/g' src/server/services/physicalTelemetry.service.ts
sed -i 's/this.db.processDeviceTelemetryArrival(/await this.db.processDeviceTelemetryArrival(/g' src/server/controllers/physicalTelemetry.controller.ts

