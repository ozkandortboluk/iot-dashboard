const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

const customPanelTypes = `
export type CustomPanelItemType = 'button' | 'slider' | 'label' | 'switch' | 'indicator' | 'color_picker';

export interface CustomPanelItem {
  id: string;
  type: CustomPanelItemType;
  deviceId: string;
  metricKey: string; // The metric/pin it controls or reads
  label: string;
  color?: string;
  min?: number;
  max?: number;
  step?: number;
  valueOn?: string | number;
  valueOff?: string | number;
}
`;

if (!code.includes('CustomPanelItemType')) {
  code = code.replace('export interface WidgetButtonConfig', customPanelTypes + '\nexport interface WidgetButtonConfig');
}

if (!code.includes('customPanelItems?:')) {
  code = code.replace('matrixSlots?: MatrixSlotConfig[];', 'matrixSlots?: MatrixSlotConfig[];\n  customPanelItems?: CustomPanelItem[];');
}

fs.writeFileSync('src/types.ts', code);
