import { Router } from 'express';
import { db } from '../../server/db.js';
import { authenticateUser, requireAdmin } from '../../server/middleware/auth.js';
import { DEFAULT_ADMIN_CONTROL_CONFIG, parseAdminControlConfig, readAdminControlConfig } from './controlConfig.js';

export const codexAdminRouter = Router();

codexAdminRouter.get('/config', authenticateUser, requireAdmin, (_req, res) => {
  res.json({ success: true, config: readAdminControlConfig(db.getSystemSetting('codex_monitor_config') ?? DEFAULT_ADMIN_CONTROL_CONFIG) });
});

codexAdminRouter.put('/config', authenticateUser, requireAdmin, async (req, res) => {
  let parsed: ReturnType<typeof parseAdminControlConfig>;
  try {
    parsed = parseAdminControlConfig(req.body?.config);
  } catch {
    return res.status(400).json({ success: false, error: 'Codex izin veya özellik yapılandırması geçersiz.' });
  }
  const saved = await db.saveSystemSetting('codex_monitor_config', parsed, new Date().toISOString());
  if (!saved) return res.status(409).json({ success: false, error: 'Codex yapılandırması eşzamanlı olarak değişti; yeniden yükleyin.' });
  return res.json({ success: true, config: parsed });
});
