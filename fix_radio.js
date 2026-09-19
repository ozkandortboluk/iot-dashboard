import * as fs from 'fs';
let content = fs.readFileSync('src/index.css', 'utf-8');

const radioCss = `

/* ==========================================================================
   Modern Global Radio Button Styling (Overrides HTML classes)
   ========================================================================== */
[type="radio"] {
  appearance: none !important;
  -webkit-appearance: none !important;
  width: 1rem !important;
  height: 1rem !important;
  border-radius: 50% !important;
  border: 1px solid #cbd5e1 !important; /* border-slate-300 */
  background-color: #fff !important; /* bg-white */
  cursor: pointer !important;
  flex-shrink: 0 !important;
  display: inline-block !important;
  vertical-align: middle !important;
  transition: all 0.2s ease-in-out !important;
  margin: 0 !important;
}

.dark [type="radio"] {
  border-color: #334155 !important; /* border-slate-700 */
  background-color: #0f172a !important; /* bg-slate-900 */
}

[type="radio"]:checked {
  background-color: #fff !important; /* bg-white */
  border-color: #4f46e5 !important; /* border-indigo-600 */
  border-width: 4px !important;
}

.dark [type="radio"]:checked {
  background-color: #0f172a !important; /* bg-slate-900 */
  border-color: #6366f1 !important; /* border-indigo-500 */
}

[type="radio"]:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(99, 102, 241, 0.5) !important;
}

.dark [type="radio"]:focus-visible {
  box-shadow: 0 0 0 2px #020617, 0 0 0 4px rgba(99, 102, 241, 0.5) !important;
}

[type="radio"]:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
  background-color: #f1f5f9 !important; /* bg-slate-100 */
  border-color: #e2e8f0 !important; /* border-slate-200 */
}

.dark [type="radio"]:disabled {
  background-color: #1e293b !important; /* bg-slate-800 */
  border-color: #334155 !important; /* border-slate-700 */
}
`;

content += radioCss;
fs.writeFileSync('src/index.css', content);
