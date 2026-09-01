const fs = require('fs');
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

// I will just replace the bad blocks.
content = content.replace(/{\n\s*id: 'devices',\n\s*},\n\s*{\n\s*id: 'automations',\n\s*label: 'Otomasyon & Senaryolar',\n\s*icon: Activity,\n\s*label: 'Cihazlarım & Sensör Verileri',\n\s*icon: Cpu,\n\s*},/g, 
`{
      id: 'devices',
      label: 'Cihazlarım & Sensör Verileri',
      icon: Cpu,
    },
    {
      id: 'automations',
      label: 'Otomasyon & Senaryolar',
      icon: Activity,
    },`);

content = content.replace(/{\n\s*id: 'devices',\n\s*},\n\s*{\n\s*id: 'automations',\n\s*label: 'Otomasyon & Senaryolar',\n\s*icon: Activity,\n\s*label: 'Saha Cihazları & Kontrol',\n\s*icon: Cpu,\n\s*},/g, 
`{
          id: 'devices',
          label: 'Saha Cihazları & Kontrol',
          icon: Cpu,
        },
        {
          id: 'automations',
          label: 'Otomasyon & Senaryolar',
          icon: Activity,
        },`);

content = content.replace(/{\n\s*id: 'devices',\n\s*},\n\s*{\n\s*id: 'automations',\n\s*label: 'Otomasyon & Senaryolar',\n\s*icon: Activity,\n\s*label: 'Sensör Verileri & İzleme',\n\s*icon: Cpu,\n\s*},/g, 
`{
          id: 'devices',
          label: 'Sensör Verileri & İzleme',
          icon: Cpu,
        },
        {
          id: 'automations',
          label: 'Otomasyon & Senaryolar',
          icon: Activity,
        },`);

content = content.replace(/{\n\s*id: 'devices',\n\s*},\n\s*{\n\s*id: 'automations',\n\s*label: 'Otomasyon & Senaryolar',\n\s*icon: Activity,\n\s*label: 'Tüm Saha Cihazları',\n\s*icon: Cpu,\n\s*},/g, 
`{
          id: 'devices',
          label: 'Tüm Saha Cihazları',
          icon: Cpu,
        },
        {
          id: 'automations',
          label: 'Otomasyon & Senaryolar',
          icon: Activity,
        },`);

// Add Activity to lucide-react imports
if (!content.includes('Activity,')) {
    content = content.replace('LayoutDashboard,', 'LayoutDashboard,\n  Activity,');
}

fs.writeFileSync('src/components/Sidebar.tsx', content);
