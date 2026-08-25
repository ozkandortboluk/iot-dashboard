import re

with open('src/components/CustomerManagement.tsx', 'r') as f:
    content = f.read()

# We need to remove the block starting from `<div className="space-y-1.5">\n                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">Hesap Türü (Rol)</label>`
# up to its closing `</div>`
pattern = r'<div className="space-y-1\.5">\s*<label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">Hesap Türü \(Rol\)<\/label>.*?<\/select>\s*<\/div>'

content = re.sub(pattern, '', content, flags=re.DOTALL)

with open('src/components/CustomerManagement.tsx', 'w') as f:
    f.write(content)
