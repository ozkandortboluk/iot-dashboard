const fs = require('fs');
let code = fs.readFileSync('src/components/AddWidgetModal.tsx', 'utf8');

const newOption = `
  { id: 'custom_panel', title: 'Özel Kontrol Paneli', type: 'custom_panel', description: 'Birden fazla cihaz ve metrik için özelleştirilmiş kontroller (buton, slider, switch) içeren bir panel.', icon: 'LayoutDashboard', defaultSpan: 2 },
`;

if (!code.includes('custom_panel')) {
  // Let's find WIDGET_TEMPLATES array and insert this inside 'CONTROL_WIDGETS' or at the end
  code = code.replace("title: 'Kontrol Paneli'", newOption + "\n    title: 'Kontrol Paneli'");
  fs.writeFileSync('src/components/AddWidgetModal.tsx', code);
}
