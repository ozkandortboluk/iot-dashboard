sed -i "s/router.post('\/', authenticateUser, (req/router.post('\/', authenticateUser, async (req/g" src/server/routes/alarms.ts
sed -i "s/const rule = db.createRule/const rule = await db.createRule/g" src/server/routes/alarms.ts

sed -i "s/router.put('\/:id', authenticateUser, (req/router.put('\/:id', authenticateUser, async (req/g" src/server/routes/alarms.ts
sed -i "s/const rule = db.updateRule/const rule = await db.updateRule/g" src/server/routes/alarms.ts

sed -i "s/router.delete('\/:id', authenticateUser, (req/router.delete('\/:id', authenticateUser, async (req/g" src/server/routes/alarms.ts
sed -i "s/db.deleteRule/await db.deleteRule/g" src/server/routes/alarms.ts

