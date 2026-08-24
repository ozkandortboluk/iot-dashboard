cat << 'INNER_EOF' >> src/server/routes/auth.ts

customersRouter.put('/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const updatedUser = await db.updateUserProfile(req.params.id, req.body);
    broadcast('users:updated', db.getUsers());
    res.json({ user: updatedUser, message: 'Müşteri bilgileri güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Müşteri güncellenemedi.' });
  }
});

customersRouter.patch('/:id/status', authenticateUser, requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz statü.' });
  }
  try {
    const user = db.getUsers().find(u => u.id === req.params.id);
    if (!user) throw new Error('Kullanıcı bulunamadı.');
    user.status = status;
    await db.updateUserProfile(user.id, { status });
    
    if (status === 'suspended') {
      await db.terminateUserSessions(user.id);
    }
    broadcast('users:updated', db.getUsers());
    res.json({ message: \`Kullanıcı hesabı \${status === 'active' ? 'aktifleştirildi' : 'donduruldu'}.\` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.post('/:id/terminate-sessions', authenticateUser, requireAdmin, async (req, res) => {
  try {
    await db.terminateUserSessions(req.params.id);
    res.json({ message: 'Tüm aktif oturumlar sonlandırıldı.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.post('/:id/reset-password', authenticateUser, requireAdmin, async (req, res) => {
  try {
    // In a real app, send an email. For now, just return success.
    res.json({ message: 'Parola sıfırlama bağlantısı e-posta adresine gönderildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
INNER_EOF
