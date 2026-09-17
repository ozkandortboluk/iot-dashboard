import * as fs from 'fs';
let content = fs.readFileSync('src/components/DevicesView.tsx', 'utf-8');

// For Grid View:
const gridTarget = `                      {/* Badges: Hierarchy, Owner */}`;
const gridReplacement = `                      {/* Badges: Hierarchy, Owner, Power */}`;
if (content.includes(gridTarget)) {
  content = content.replace(gridTarget, gridReplacement);
  // Wait, I already added it in Grid view via edit_file! Let me check if it's there.
}

// For List View:
const listTarget = `                              <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {dev.name}
                              </p>
                            </div>`;
const listReplacement = `                              <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {dev.name}
                              </p>
                            </div>
                            <DevicePowerIcon device={dev} />`;

if (content.includes(listTarget)) {
  content = content.replace(listTarget, listReplacement);
} else {
  console.log("List target not found!");
}

fs.writeFileSync('src/components/DevicesView.tsx', content);
