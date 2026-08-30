const fs = require('fs');
let code = fs.readFileSync('src/server/routes/alarms.ts', 'utf8');

// fix alarms route (getAlarms)
code = code.replace(/router\.get\('\/', authenticateUser, \(req, res\) => \{/, "router.get('/', authenticateUser, async (req, res) => {");
code = code.replace(/const result = db\.getAlarms\(/, "const result = await db.getAlarms(");

// fix alarm_events route
const oldAlarmEvents = `router.get('/events', authenticateUser, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  
  const incidentId = req.query.incidentId as string | undefined;
  const alarmId = req.query.alarmId as string | undefined;
  const deviceId = req.query.deviceId as string | undefined;
  
  let events = db.data.alarmEvents || [];

  if (currentUser.role !== 'admin') {
    events = events.filter((e) => e.tenantId === currentUser.id);
  }

  if (incidentId) {
    events = events.filter((e) => e.incidentId === incidentId);
  }
  if (alarmId) {
    events = events.filter((e) => e.alarmId === alarmId);
  }
  if (deviceId) {
    events = events.filter((e) => e.deviceId === deviceId);
  }

  // Sort descending by creation date
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(events);
});`;

const newAlarmEvents = `router.get('/events', authenticateUser, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const currentUser = authReq.user!;
  
  const incidentId = req.query.incidentId as string | undefined;
  const alarmId = req.query.alarmId as string | undefined;
  const deviceId = req.query.deviceId as string | undefined;
  
  const events = await db.getAlarmEvents(currentUser.id, currentUser.role === 'admin' ? undefined : currentUser.id, incidentId, alarmId, deviceId);
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(events);
});`;

code = code.replace(oldAlarmEvents, newAlarmEvents);

// fix notifications route
code = code.replace(/const notificationsRouter = Router\(\);\nnotificationsRouter\.get\('\/', authenticateUser, \(req, res\) => \{/, "const notificationsRouter = Router();\nnotificationsRouter.get('/', authenticateUser, async (req, res) => {");
code = code.replace(/res\.json\(db\.getNotifications\(/, "res.json(await db.getNotifications(");

// fix dispatch logs route
code = code.replace(/dispatchLogsRouter\.get\('\/', authenticateUser, \(req, res\) => \{/, "dispatchLogsRouter.get('/', authenticateUser, async (req, res) => {");
code = code.replace(/const logs = db\.getDispatchLogs\(/, "const logs = await db.getDispatchLogs(");

fs.writeFileSync('src/server/routes/alarms.ts', code);
