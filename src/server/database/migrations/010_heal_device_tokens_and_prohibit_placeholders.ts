import type pg from 'pg';
import crypto from 'crypto';
import type { Migration } from './types.js';

export const migration010: Migration = {
  version: '010',
  name: 'heal_device_tokens_and_prohibit_placeholders',
  up: async (client: pg.PoolClient) => {
    // 1. Kanonik test cihazını kesinlikle kuraldaki kalıcı anahtara eşitle
    const testKey = 'dev_key_test_0000000000000000';
    const testHash = crypto.createHash('sha256').update(testKey).digest('hex');
    const testPrefix = testKey.substring(0, 12);

    await client.query(`
      UPDATE devices 
      SET 
        api_key = $1,
        api_key_prefix = $2,
        api_key_hash = $3
      WHERE id = 'dev_test_01';
    `, [testKey, testPrefix, testHash]);

    // 2. __USE_CACHED_TOKEN__, 'Yok' veya boş kalan tüm cihazlar için gerçek kriptografik anahtarlar üret ve onar
    const invalidDevices = await client.query(`
      SELECT id, name FROM devices 
      WHERE api_key LIKE '%USE_CACHED%' 
         OR api_key = 'Yok' 
         OR api_key = 'undefined'
         OR api_key = 'null'
         OR api_key IS NULL 
         OR api_key = '';
    `);

    for (const row of invalidDevices.rows) {
      if (row.id === 'dev_test_01') continue;

      const generatedKey = `nex_${crypto.randomBytes(4).toString('hex')}_${crypto.randomBytes(12).toString('hex')}`;
      const genHash = crypto.createHash('sha256').update(generatedKey).digest('hex');
      const genPrefix = generatedKey.substring(0, 12);

      await client.query(`
        UPDATE devices 
        SET 
          api_key = $1,
          api_key_prefix = $2,
          api_key_hash = $3
        WHERE id = $4;
      `, [generatedKey, genPrefix, genHash, row.id]);

      console.log(`[Migration 010] Onarılan cihaz tokeni: ID=${row.id}, Name=${row.name}, Yeni Token Prefix=${genPrefix}`);
    }
  },
  down: async (_client: pg.PoolClient) => {
    // Non-destructive
  },
};
