with open('src/server/database/schema.ts', 'r') as f:
    content = f.read()

alter_statements = """
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
"""

if "ALTER TABLE users ADD COLUMN IF NOT EXISTS status" not in content:
    content += alter_statements

with open('src/server/database/schema.ts', 'w') as f:
    f.write(content)
