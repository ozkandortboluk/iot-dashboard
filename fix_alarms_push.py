with open('src/server/database/postgres.ts', 'r') as f:
    content = f.read()

start = content.find("alarms.push({")
if start != -1:
    end = content.find("})", start)
    block = content[start:end]
    new_block = block.replace("userId: r.user_id,", "tenantId: r.user_id,")
    content = content[:start] + new_block + content[end:]

with open('src/server/database/postgres.ts', 'w') as f:
    f.write(content)
