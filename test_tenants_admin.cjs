const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
      const parsed = JSON.parse(data);
      if(!parsed.token) { console.log("Login failed", data); return; }
      
      const req2 = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/tenants?limit=1000',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${parsed.token}` }
      }, (res2) => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => console.log("Tenants status:", res2.statusCode, "Data:", data2.substring(0, 200)));
      });
      req2.end();
  });
});
// Need to find the exact password for admin@dashboard.io. In demoData it might be something else. 
// Wait, I can just generate a token using the server's db directly.
