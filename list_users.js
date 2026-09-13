import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
data.users.forEach(u => console.log(u.id, u.name, u.email));
