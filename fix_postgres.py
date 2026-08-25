import re

with open('src/server/database/postgres.ts', 'r') as f:
    content = f.read()

# Replace userId with tenantId ONLY in the dashboards push block
def replace_in_dashboards(text):
    start = text.find("dashboards.push({")
    if start == -1: return text
    end = text.find("})", start)
    block = text[start:end]
    new_block = block.replace("userId: r.user_id", "tenantId: r.user_id")
    return text[:start] + new_block + text[end:]

def replace_in_devices(text):
    start = text.find("devices.push({")
    if start == -1: return text
    end = text.find("})", start)
    block = text[start:end]
    new_block = block.replace("userId: r.user_id", "tenantId: r.user_id")
    return text[:start] + new_block + text[end:]

content = replace_in_dashboards(content)
content = replace_in_devices(content)

with open('src/server/database/postgres.ts', 'w') as f:
    f.write(content)
