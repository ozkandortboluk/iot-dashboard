import fs from 'fs';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
console.log(db.passwords);
