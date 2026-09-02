const fs = require('fs');
let code = fs.readFileSync('src/components/EditWidgetModal.tsx', 'utf8');

if (!code.includes("import { CustomPanelWidget }")) {
  code = code.replace("import { DataTableWidget } from './widgets/DataTableWidget';", "import { DataTableWidget } from './widgets/DataTableWidget';\nimport { CustomPanelWidget } from './widgets/CustomPanelWidget';");
}

if (!code.includes("case 'custom_panel':")) {
  code = code.replace("case 'data_table':", "case 'custom_panel':\n        return <CustomPanelWidget config={widget} onEdit={handleEdit} />;\n      case 'data_table':");
}

fs.writeFileSync('src/components/EditWidgetModal.tsx', code);

// Same for WidgetGrid.tsx
let gridCode = fs.readFileSync('src/components/WidgetGrid.tsx', 'utf8');
if (!gridCode.includes("import { CustomPanelWidget }")) {
  gridCode = gridCode.replace("import { DataTableWidget } from './widgets/DataTableWidget';", "import { DataTableWidget } from './widgets/DataTableWidget';\nimport { CustomPanelWidget } from './widgets/CustomPanelWidget';");
}
if (!gridCode.includes("case 'custom_panel':")) {
  gridCode = gridCode.replace("case 'data_table':", "case 'custom_panel':\n          return <CustomPanelWidget config={widget} onEdit={() => onEditWidget(widget)} />;\n        case 'data_table':");
}
fs.writeFileSync('src/components/WidgetGrid.tsx', gridCode);
