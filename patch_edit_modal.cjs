const fs = require('fs');
let code = fs.readFileSync('src/components/EditWidgetModal.tsx', 'utf8');

// Add to imports if necessary
if (!code.includes('CustomPanelItem')) {
  code = code.replace('ThresholdRule } from', 'ThresholdRule, CustomPanelItem, CustomPanelItemType } from');
}

// Add state for custom panel items
if (!code.includes('customPanelItems, setCustomPanelItems')) {
  code = code.replace(
    'const [matrixSlots, setMatrixSlots] = useState<MatrixSlotConfig[]>([]);',
    'const [matrixSlots, setMatrixSlots] = useState<MatrixSlotConfig[]>([]);\n  const [customPanelItems, setCustomPanelItems] = useState<CustomPanelItem[]>([]);'
  );
}

// Populate state in useEffect
if (!code.includes('setCustomPanelItems(widget.customPanelItems || [])')) {
  code = code.replace(
    'setMatrixSlots(widget.matrixSlots || []);',
    'setMatrixSlots(widget.matrixSlots || []);\n      setCustomPanelItems(widget.customPanelItems || []);'
  );
}

// Add to handleSave
if (!code.includes('customPanelItems: customPanelItems')) {
  code = code.replace(
    'matrixSlots: matrixSlots.length > 0 ? matrixSlots : undefined',
    'matrixSlots: matrixSlots.length > 0 ? matrixSlots : undefined,\n      customPanelItems: customPanelItems.length > 0 ? customPanelItems : undefined'
  );
}

fs.writeFileSync('src/components/EditWidgetModal.tsx', code);
