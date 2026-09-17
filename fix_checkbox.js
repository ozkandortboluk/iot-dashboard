import * as fs from 'fs';
let content = fs.readFileSync('src/index.css', 'utf-8');

// Remove the one we just added
content = content.replace(/\/\* ====[^*]+==== \*\/\n\[type="checkbox"\] \{[\s\S]*?\n\}/g, '');

const customCss = `
/* ==========================================================================
   Modern Global Checkbox Styling (Overrides HTML classes)
   ========================================================================== */
[type="checkbox"] {
  appearance: none !important;
  -webkit-appearance: none !important;
  width: 1rem !important;
  height: 1rem !important;
  border-radius: 0.25rem !important;
  border: 1px solid #cbd5e1 !important; /* border-slate-300 */
  background-color: #fff !important; /* bg-white */
  cursor: pointer !important;
  flex-shrink: 0 !important;
  display: inline-block !important;
  vertical-align: middle !important;
  transition: all 0.2s ease-in-out !important;
  margin: 0 !important;
}

.dark [type="checkbox"] {
  border-color: #334155 !important; /* border-slate-700 */
  background-color: #0f172a !important; /* bg-slate-900 */
}

[type="checkbox"]:checked {
  background-color: #4f46e5 !important; /* bg-indigo-600 */
  border-color: #4f46e5 !important; /* border-indigo-600 */
  background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e") !important;
  background-size: 100% 100% !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

.dark [type="checkbox"]:checked {
  background-color: #6366f1 !important; /* bg-indigo-500 */
  border-color: #6366f1 !important; /* border-indigo-500 */
}

[type="checkbox"]:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(99, 102, 241, 0.5) !important;
}

.dark [type="checkbox"]:focus-visible {
  box-shadow: 0 0 0 2px #020617, 0 0 0 4px rgba(99, 102, 241, 0.5) !important;
}

[type="checkbox"]:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
  background-color: #f1f5f9 !important; /* bg-slate-100 */
  border-color: #e2e8f0 !important; /* border-slate-200 */
}

.dark [type="checkbox"]:disabled {
  background-color: #1e293b !important; /* bg-slate-800 */
  border-color: #334155 !important; /* border-slate-700 */
}
`;

content += customCss;
fs.writeFileSync('src/index.css', content);
