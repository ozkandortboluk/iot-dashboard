sed -i 's/public addTelemetryReading(/public async addTelemetryReading(/g' src/server/db.ts
sed -i 's/return this.telemetryRepository.addTelemetryReading/return await this.telemetryRepository.addTelemetryReading/g' src/server/db.ts
sed -i 's/const reading = db.addTelemetryReading/const reading = await db.addTelemetryReading/g' src/server/routes/system.ts
sed -i 's/const reading = db.addTelemetryReading/const reading = await db.addTelemetryReading/g' src/server/controllers/command.controller.ts
