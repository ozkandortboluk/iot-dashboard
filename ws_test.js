const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:3001/ws`);
ws.on('open', () => {
  console.log('Opened');
  ws.close();
});
ws.on('unexpected-response', (request, response) => {
  console.error('Unexpected response:', response.statusCode);
});
ws.on('error', (err) => {
  console.error('Error:', err.message);
});
