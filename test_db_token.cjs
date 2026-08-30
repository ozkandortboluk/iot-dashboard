(async () => {
  const server = await import('./dist/server.cjs');
  const db = server.db;
  const admin = db.data.users.find(u => u.role === 'admin');
  if(!admin) { console.log("No admin found"); return; }
  
  // Just verify what the API returns directly
  const req = { query: { limit: '1000' } };
  // Mock response
  const res = {
    json: (data) => console.log("API returned:", JSON.stringify(data).substring(0, 300))
  };
  
  // Need to run the route handler... too hard. Let's just create a token.
  const token = db.userRepository.createSession(admin);
  
  const http = require('http');
  const req2 = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/tenants?limit=1000',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res2) => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => console.log("Tenants status:", res2.statusCode, "Data:", data2.substring(0, 300)));
      });
      req2.end();
})();
