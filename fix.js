const fs = require('fs');
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

// The sed command messed up the structure.
// I will just download the original from git ... wait, no git.
