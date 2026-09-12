sed -i "s/rulesRouter.delete('\/:id', authenticateUser, (req/rulesRouter.delete('\/:id', authenticateUser, async (req/g" src/server/routes/alarms.ts

sed -i 's/public saveDashboardWidgets(/public async saveDashboardWidgets(/g' src/server/repositories/notification.repository.ts
sed -i 's/public saveDashboardWidgets(/public async saveDashboardWidgets(/g' src/server/db.ts
