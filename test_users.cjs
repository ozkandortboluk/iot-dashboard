const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nexusnode' });
pool.query("SELECT * FROM users WHERE email='admin@dashboard.io'", (err, res) => {
    if(err) throw err;
    const admin = res.rows[0];
    
    // We don't have the token easily. Let's create a token via the database if possible or just check sessions.
    pool.query("SELECT * FROM sessions WHERE user_id=$1", [admin.id], (err2, res2) => {
        if(err2) throw err2;
        console.log("Sessions:", res2.rows);
        pool.end();
    });
});
