const fs = require('fs');
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');
content = content.replace(/icon: LayoutDashboard,(\s*)Activity,/g, 'icon: LayoutDashboard,');
fs.writeFileSync('src/components/Sidebar.tsx', content);
