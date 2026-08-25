import re

with open('src/server/database/postgres.ts', 'r') as f:
    content = f.read()

# Update saveUser
old_insert = """INSERT INTO users (
        id, name, email, phone, notification_email, whatsapp_number, 
        telegram_chat_id, password_hash, role, company_name, 
        notification_preferences, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"""

new_insert = """INSERT INTO users (
        id, name, email, phone, notification_email, whatsapp_number, 
        telegram_chat_id, password_hash, role, company_name, 
        notification_preferences, status, deleted_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)"""

old_update = """notification_preferences = EXCLUDED.notification_preferences,
        updated_at = CURRENT_TIMESTAMP;"""
        
new_update = """notification_preferences = EXCLUDED.notification_preferences,
        status = EXCLUDED.status,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = CURRENT_TIMESTAMP;"""

content = content.replace(old_insert, new_insert)
content = content.replace(old_update, new_update)

# Now update the parameter array in saveUser
old_params = """      user.role || 'customer',
      user.companyName || null,
      JSON.stringify(user.notificationPreferences || {}),
      user.created_at || new Date().toISOString(),
      user.updatedAt || new Date().toISOString(),
    ]);"""

new_params = """      user.role || 'customer',
      user.companyName || null,
      JSON.stringify(user.notificationPreferences || {}),
      user.status || 'active',
      user.deletedAt || null,
      user.created_at || new Date().toISOString(),
      user.updatedAt || new Date().toISOString(),
    ]);"""

content = content.replace(old_params, new_params)

# Now update hydrateFromPostgres for users
old_hydrate_user = """            notificationPreferences: typeof r.notification_preferences === 'string' 
              ? JSON.parse(r.notification_preferences) 
              : r.notification_preferences || undefined,
            created_at: new Date(r.created_at).toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,"""

new_hydrate_user = """            notificationPreferences: typeof r.notification_preferences === 'string' 
              ? JSON.parse(r.notification_preferences) 
              : r.notification_preferences || undefined,
            status: r.status || 'active',
            deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined,
            created_at: new Date(r.created_at).toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,"""

content = content.replace(old_hydrate_user, new_hydrate_user)

with open('src/server/database/postgres.ts', 'w') as f:
    f.write(content)
