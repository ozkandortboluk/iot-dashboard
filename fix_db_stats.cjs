const fs = require('fs');

// 1. Modify src/server/routes/system.ts
let systemRouteCode = fs.readFileSync('src/server/routes/system.ts', 'utf8');
systemRouteCode = systemRouteCode.replace(
  /adminRouter\.get\('\/database-stats', authenticateUser, requireAdmin, \(req, res\) => \{/g,
  "adminRouter.get('/database-stats', authenticateUser, requireAdmin, async (req, res) => {"
);
systemRouteCode = systemRouteCode.replace(
  /res\.json\(db\.getDatabaseStats\(\)\);/g,
  "res.json(await db.getDatabaseStats());"
);
fs.writeFileSync('src/server/routes/system.ts', systemRouteCode);

// 2. Modify src/server/db.ts
let dbCode = fs.readFileSync('src/server/db.ts', 'utf8');

const oldDbStats = `  public getDatabaseStats() {
    this.recordReadOp(1);
    let fileSizeKB = 0;
    try {
      if (fs.existsSync(DB_FILE)) {
        const stats = fs.statSync(DB_FILE);
        fileSizeKB = Math.round((stats.size / 1024) * 10) / 10;
      }
    } catch {
      // ignore
    }

    // Simulated GCP Daily Offset (deterministic per day) so it looks like real background project usage
    const todayStr = new Date().toISOString().split('T')[0];
    const hash = todayStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dailyReadOffset = this.firestoreQuotaExceeded ? 50000 + (hash * 13) : 14200 + (hash * 47);
    const dailyWriteOffset = this.firestoreQuotaExceeded ? 20000 + (hash * 7) : 4800 + (hash * 19);
    const dailyDeleteOffset = this.firestoreQuotaExceeded ? 150 + (hash * 2) : 25 + (hash * 3);

    const usersWithStats = this.data.users.map((u) => {
      const userDevs = this.data.devices.filter((d) => d.tenantId === u.id);
      const onlineDevs = userDevs.filter((d) => d.status === 'online');
      const userTelemetry = this.telemetryRepository.getTelemetry(undefined, undefined, 50, u.id);
      return {
        ...u,
        assignedDevicesCount: userDevs.length,
        activeDevicesCount: onlineDevs.length,
        telemetryCount: userTelemetry.length,
        devicesList: userDevs.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          status: d.status,
          apiKey: d.apiKey,
          location: d.location,
        })),
      };
    });`;

const newDbStats = `  public async getDatabaseStats() {
    this.recordReadOp(1);
    let fileSizeKB = 0;
    try {
      if (fs.existsSync(DB_FILE)) {
        const stats = fs.statSync(DB_FILE);
        fileSizeKB = Math.round((stats.size / 1024) * 10) / 10;
      }
    } catch {
      // ignore
    }

    // Simulated GCP Daily Offset (deterministic per day) so it looks like real background project usage
    const todayStr = new Date().toISOString().split('T')[0];
    const hash = todayStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dailyReadOffset = this.firestoreQuotaExceeded ? 50000 + (hash * 13) : 14200 + (hash * 47);
    const dailyWriteOffset = this.firestoreQuotaExceeded ? 20000 + (hash * 7) : 4800 + (hash * 19);
    const dailyDeleteOffset = this.firestoreQuotaExceeded ? 150 + (hash * 2) : 25 + (hash * 3);

    let pgTelemetryStats = {};
    if (this.isPostgresProductionMode()) {
       try {
           const res = await this.postgresRepo.query('SELECT tenant_id, COUNT(*) AS count FROM telemetry_readings GROUP BY tenant_id');
           if (res?.rows) {
               res.rows.forEach(r => {
                  pgTelemetryStats[r.tenant_id] = parseInt(r.count, 10) || 0;
               });
           }
       } catch (err) {
           console.error("PG Stats fetch error:", err);
       }
    }

    const usersWithStats = this.data.users.map((u) => {
      const userDevs = this.data.devices.filter((d) => d.tenantId === u.id);
      const onlineDevs = userDevs.filter((d) => d.status === 'online');
      
      let telemetryCount = 0;
      if (this.isPostgresProductionMode()) {
         telemetryCount = pgTelemetryStats[u.id] || 0;
      } else {
         const userTelemetry = this.telemetryRepository.getTelemetry(undefined, undefined, 50, u.id);
         telemetryCount = userTelemetry.length;
      }
      
      return {
        ...u,
        assignedDevicesCount: userDevs.length,
        activeDevicesCount: onlineDevs.length,
        telemetryCount,
        devicesList: userDevs.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          status: d.status,
          apiKey: d.apiKey,
          location: d.location,
        })),
      };
    });`;

dbCode = dbCode.replace(oldDbStats, newDbStats);
fs.writeFileSync('src/server/db.ts', dbCode);
