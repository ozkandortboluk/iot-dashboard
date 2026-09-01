const fs = require('fs');
let content = fs.readFileSync('src/lib/permissions.ts', 'utf-8');

const roles = ['admin:', 'operator:', 'analyst:', 'customer:'];
roles.forEach(role => {
    if (!content.includes(`'automations'`)) {
        // If 'automations' is not anywhere, replace the first occurences
    }
    // Simple replace
    content = content.replace(new RegExp(`(${role} \\[.*?)('devices',)`, 's'), "$1$2\n    'automations',");
});

fs.writeFileSync('src/lib/permissions.ts', content);
