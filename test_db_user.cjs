const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nexusnode' });
pool.query("SELECT * FROM users WHERE email='ozkan.1403@gmail.com'", (err, res) => {
  if (err) console.error(err);
  else console.log(res.rows);
  pool.end();
});
