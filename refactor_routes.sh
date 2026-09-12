sed -i "s/router.post('\/', authenticateUser, (req/router.post('\/', authenticateUser, async (req/g" src/server/routes/devices.ts
sed -i "s/const device = db.createDevice/const device = await db.createDevice/g" src/server/routes/devices.ts

sed -i "s/router.put('\/:id', authenticateUser, (req/router.put('\/:id', authenticateUser, async (req/g" src/server/routes/devices.ts
sed -i "s/const updated = db.updateDevice/const updated = await db.updateDevice/g" src/server/routes/devices.ts

sed -i "s/router.delete('\/:id', authenticateUser, (req/router.delete('\/:id', authenticateUser, async (req/g" src/server/routes/devices.ts
sed -i "s/db.deleteDevice/await db.deleteDevice/g" src/server/routes/devices.ts

