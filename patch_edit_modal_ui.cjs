const fs = require('fs');
let code = fs.readFileSync('src/components/EditWidgetModal.tsx', 'utf8');

const addUI = `
          {type === 'custom_panel' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Mini Widgetlar</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPanelItems([
                        ...customPanelItems,
                        {
                          id: 'item_' + Date.now(),
                          type: 'button',
                          deviceId: devices[0]?.id || '',
                          metricKey: 'relay_1',
                          label: 'Yeni Buton'
                        }
                      ]);
                    }}
                    className="text-xs flex items-center gap-1 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded"
                  >
                    <Plus className="w-3 h-3" /> Ekle
                  </button>
                </div>
                {customPanelItems.map((item, index) => (
                  <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 relative group">
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = [...customPanelItems];
                        newItems.splice(index, 1);
                        setCustomPanelItems(newItems);
                      }}
                      className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">TİP</label>
                        <select
                          value={item.type}
                          onChange={(e) => {
                            const newItems = [...customPanelItems];
                            newItems[index].type = e.target.value;
                            setCustomPanelItems(newItems);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                        >
                          <option value="button">Buton</option>
                          <option value="switch">Switch (Aç/Kapat)</option>
                          <option value="slider">Slider (Kaydırıcı)</option>
                          <option value="indicator">Lamba (Gösterge)</option>
                          <option value="label">Etiket (Sadece Oku)</option>
                          <option value="color_picker">Renk Paleti</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">CİHAZ</label>
                        <select
                          value={item.deviceId}
                          onChange={(e) => {
                            const newItems = [...customPanelItems];
                            newItems[index].deviceId = e.target.value;
                            setCustomPanelItems(newItems);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                        >
                          {devices.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">METRİK / PİN</label>
                        <input
                          type="text"
                          value={item.metricKey}
                          onChange={(e) => {
                            const newItems = [...customPanelItems];
                            newItems[index].metricKey = e.target.value;
                            setCustomPanelItems(newItems);
                          }}
                          placeholder="relay_1, temperature..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">ETİKET (BAŞLIK)</label>
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const newItems = [...customPanelItems];
                            newItems[index].label = e.target.value;
                            setCustomPanelItems(newItems);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                        />
                      </div>
                      {item.type === 'slider' && (
                        <>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">MIN</label>
                            <input
                              type="number"
                              value={item.min ?? 0}
                              onChange={(e) => {
                                const newItems = [...customPanelItems];
                                newItems[index].min = Number(e.target.value);
                                setCustomPanelItems(newItems);
                              }}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">MAX</label>
                            <input
                              type="number"
                              value={item.max ?? 100}
                              onChange={(e) => {
                                const newItems = [...customPanelItems];
                                newItems[index].max = Number(e.target.value);
                                setCustomPanelItems(newItems);
                              }}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                            />
                          </div>
                        </>
                      )}
                      {(item.type === 'button' || item.type === 'indicator' || item.type === 'label') && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">RENK</label>
                          <input
                            type="color"
                            value={item.color || '#3b82f6'}
                            onChange={(e) => {
                              const newItems = [...customPanelItems];
                              newItems[index].color = e.target.value;
                              setCustomPanelItems(newItems);
                            }}
                            className="w-full h-8 p-0 bg-white border-0 rounded cursor-pointer"
                          />
                        </div>
                      )}
                      {(item.type === 'button' || item.type === 'switch') && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">AÇIK DEĞERİ (Gönderilecek)</label>
                          <input
                            type="text"
                            value={item.valueOn ?? 1}
                            onChange={(e) => {
                              const newItems = [...customPanelItems];
                              newItems[index].valueOn = e.target.value;
                              setCustomPanelItems(newItems);
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                          />
                        </div>
                      )}
                      {item.type === 'switch' && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">KAPALI DEĞERİ</label>
                          <input
                            type="text"
                            value={item.valueOff ?? 0}
                            onChange={(e) => {
                              const newItems = [...customPanelItems];
                              newItems[index].valueOff = e.target.value;
                              setCustomPanelItems(newItems);
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:text-white outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
`;

if (!code.includes("type === 'custom_panel'")) {
  code = code.replace("{type === 'multi_metric' && (", addUI + "\n          {type === 'multi_metric' && (");
}

fs.writeFileSync('src/components/EditWidgetModal.tsx', code);
