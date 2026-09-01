const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

if (!content.includes('import { AutomationsView }')) {
    content = content.replace(
        "import { HelpView } from './components/HelpView';",
        "import { HelpView } from './components/HelpView';\nimport { AutomationsView } from './components/AutomationsView';"
    );
}

if (!content.includes("automations: 'Otomasyon & Senaryolar'")) {
    content = content.replace(
        "help: 'Yardım & Bilgi Merkezi',",
        "help: 'Yardım & Bilgi Merkezi',\n    automations: 'Otomasyon & Senaryolar',"
    );
}

if (!content.includes("safeActiveTab === 'automations'")) {
    content = content.replace(
        "{safeActiveTab === 'device_health' && (",
        "{safeActiveTab === 'automations' && <AutomationsView />}\n          {safeActiveTab === 'device_health' && ("
    );
}

fs.writeFileSync('src/App.tsx', content);
