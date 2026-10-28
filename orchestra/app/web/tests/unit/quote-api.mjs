// Optional HTTP integration checks against a running mock-mode web and isolated test DB.
// Run from web: BASE_URL=http://localhost:4600 node tests/unit/quote-api.mjs
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://localhost:4600';
async function post(path, input, cookie = '') {
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(input),
  });
  return { response, body: await response.json() };
}
assert.equal((await post('/api/test/reset', {})).response.status, 200);
const login = await post('/api/auth/login', { email: 'arun@saisai.test', password: 'Arun#Test2026' });
assert.equal(login.response.status, 200);
const cookie = login.response.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
const input = { model: 'B-250', color: 'clear', quantity: 10000, logo: true, addressCode: 'ADDR-01' };
const w03 = await post('/api/quote', { ...input, companyId: 2, distanceKm: 0 }, cookie);
assert.equal(w03.response.status, 200);
assert.equal(w03.body.lines.total, '63023.00');
assert.equal(w03.body.lines.distanceKm, 160);
assert.deepEqual(w03.body.errors, []);
const w02 = await post('/api/quote', { ...input, model: 'B-500', quantity: 700, logo: false }, cookie);
assert.equal(w02.response.status, 400);
assert.equal(w02.body.errors[0].message, 'B-500 สั่งขั้นต่ำ 800 ใบ');
const holiday = await post('/api/quote', { ...input, pickupDate: '2026-12-05' }, cookie);
assert.equal(holiday.response.status, 422);
assert.equal(holiday.body.errors[0].code, 'FACTORY_CLOSED');
const soon = await post('/api/quote', { ...input, pickupDate: '2026-10-24' }, cookie);
assert.equal(soon.response.status, 400);
assert.equal(soon.body.errors[0].code, 'PICKUP_TOO_SOON');
assert.equal(soon.body.earliestPickupDate, '2026-10-25');
const foreign = await post('/api/quote', { ...input, addressCode: 'ADDR-05', distanceKm: 0 }, cookie);
assert.equal(foreign.response.status, 400);
assert.equal(foreign.body.errors[0].code, 'ADDRESS_NOT_FOUND');
const anonymous = await post('/api/quote', { ...input, companyId: 1, distanceKm: 160 });
assert.equal(anonymous.response.status, 400);
assert.equal(anonymous.body.errors[0].code, 'ADDRESS_NOT_FOUND');
const publicPrice = await post('/api/quote', { ...input, addressCode: undefined, distanceKm: 160 });
assert.equal(publicPrice.response.status, 200);
assert.equal(publicPrice.body.lines.total, '63023.00');
const en = await post('/api/quote', { ...input, model: 'B-500', quantity: 700, logo: false }, cookie + '; lang=en');
assert.equal(en.body.errors[0].message, 'B-500 minimum order is 800 bottles');
const malformed = await fetch(base + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
assert.equal(malformed.status, 400);
assert.equal((await malformed.json()).errors[0].code, 'PRODUCT_NOT_FOUND');
console.log('Quote API: 10 integration scenarios passed; W03 total 63023.00');
