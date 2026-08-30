const http = require('http');
// First login
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
      const { token } = JSON.parse(data);
      if(!token) { console.log("Login failed", data); return; }
      
      const req2 = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/admin/tenants?limit=1000',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res2) => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => console.log(res2.statusCode, data2));
      });
      req2.end();
  });
});
req.write(JSON.stringify({ email: 'admin@dashboard.io', password: 'admin' })); // default password
req.end();
