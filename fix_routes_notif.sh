sed -i "s/router.post('\/login', (req/router.post('\/login', async (req/g" src/server/routes/auth.ts
sed -i "s/const session = db.createSession/const session = await db.createSession/g" src/server/routes/auth.ts

sed -i "s/router.post('\/logout', authenticateUser, (req/router.post('\/logout', authenticateUser, async (req/g" src/server/routes/auth.ts
sed -i "s/db.logout/await db.logout/g" src/server/routes/auth.ts

sed -i "s/router.put('\/:id\/read', authenticateUser, (req/router.put('\/:id\/read', authenticateUser, async (req/g" src/server/routes/notifications.ts
sed -i "s/db.markNotificationRead/await db.markNotificationRead/g" src/server/routes/notifications.ts

sed -i "s/router.put('\/read-all', authenticateUser, (req/router.put('\/read-all', authenticateUser, async (req/g" src/server/routes/notifications.ts
sed -i "s/db.markAllNotificationsRead/await db.markAllNotificationsRead/g" src/server/routes/notifications.ts

