const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const API_BASE_URL = 'http://localhost:5050';

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

test('API Gateway - Health Check', async () => {
  const res = await makeRequest(`${API_BASE_URL}/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.strictEqual(res.body.service, 'E2N Studio API Gateway');
});

test('API Gateway - Protect Route Rejects Unauthenticated', async () => {
  const res = await makeRequest(`${API_BASE_URL}/api/projects`);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.success, false);
});
