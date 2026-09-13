import fetch from 'node-fetch';
async function test() {
  const loginRes = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@nexusnodeiot.com.tr', password: 'test1234' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const res = await fetch('http://127.0.0.1:3000/api/devices/hierarchy/sites', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  const text = await res.text();
  console.log('Response body:', text.substring(0, 100));
}
test();
