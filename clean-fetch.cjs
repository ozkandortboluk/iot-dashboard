const fs = require('fs');
let content = fs.readFileSync('src/components/AutomationsView.tsx', 'utf-8');

// Replace standard fetch structures with cleaner apiFetch usage
content = content.replace(/headers:\s*\{\s*Authorization:\s*`Bearer \$\{localStorage\.getItem\('token'\)\}`\s*\}/g, 'headers: {}');

fs.writeFileSync('src/components/AutomationsView.tsx', content);
