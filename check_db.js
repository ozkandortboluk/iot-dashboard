import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
console.log("Latest users:", data.users.slice(-3).map(u => u.id + ' ' + u.name));
console.log("Latest devices:", data.devices.slice(-3).map(d => d.id + ' ' + d.name));
