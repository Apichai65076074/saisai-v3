// Mock HTTP integration; uses the server's isolated test DB. Run only after browser tests.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { assertTopology } from '../../../../shared/mq-topology.mjs';

const base = process.env.BASE_URL || 'http://localhost:4601';
const input = { model: 'B-250', color: 'clear', quantity: 10000, logo: true, addressCode: 'ADDR-01' };
async function request(path, { cookie = '', data, method = data === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(base + path, {
    method, headers: { cookie, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json(), response };
}
async function login(email = 'arun@saisai.test', password = 'Arun#Test2026') {
  const r = await request('/api/auth/login', { data: { email, password } });
  assert.equal(r.status, 200);
  return r.response.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
}
async function create(cookie, data = input) {
  const r = await request('/api/quotes', { cookie, data });
  assert.equal(r.status, 201);
  return r.body;
}
beforeEach(async () => {
  assert.equal((await request('/api/test/reset', { data: {} })).status, 200);
});

test('quote API enforces customer/company access and rejects sales-only inputs', async () => {
  assert.equal((await request('/api/quotes', { data: input })).status, 401);
  const cookie = await login();
  await create(cookie, { ...input, companyId: 2, userId: 2 });
  assert.equal((await request('/api/quotes', { cookie })).body.quotes.length, 1);
  const foreign = await login('theera@saisai.test', 'Theera#Test2026');
  assert.equal((await request('/api/quotes', { cookie: foreign })).body.quotes.length, 0);
  assert.equal((await request('/api/quotes/QT-0001', { cookie: foreign })).status, 404);
  assert.equal((await request('/api/quotes/QT-0001/convert', {
    cookie: foreign, data: { pickupDate: '2026-10-26' },
  })).status, 404);
  for (const [data, code] of [
    [{ ...input, addressCode: '', distanceKm: 301 }, 'DISTANCE_TOO_FAR'],
    [{ ...input, quantity: 200100 }, 'QTY_MAX'],
  ]) {
    const rejected = await request('/api/quotes', { cookie, data });
    assert.equal(rejected.status, 422);
    assert.ok(rejected.body.errors.some(e => e.code === code));
  }
  const staff = await login('somsri@saisai.test', 'Somsri#Test2026');
  assert.equal((await request('/api/quotes', { cookie: staff, data: input })).status, 403);
  assert.equal((await create(cookie)).quoteNo, 'QT-0002');
});

test('conversion rechecks pickup rules and rolls back rejected attempts', async () => {
  const cookie = await login();
  await create(cookie);
  for (const [pickupDate, code] of [
    ['2026-10-24', 'PICKUP_TOO_SOON'], ['2026-12-05', 'FACTORY_CLOSED'],
  ]) {
    const r = await request('/api/quotes/QT-0001/convert', { cookie, data: { pickupDate } });
    assert.ok(r.status >= 400);
    assert.ok(r.body.errors.some(e => e.code === code));
    assert.equal((await request('/api/quotes/QT-0001', { cookie })).body.quote.convertedOrderNo, null);
  }
  const r = await request('/api/quotes/QT-0001/convert', { cookie, data: { pickupDate: '2026-10-26' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.orderNo, 'SO-0019');
});

test('concurrent conversions create one order and preserve the quote snapshot', async () => {
  const cookie = await login();
  const original = await create(cookie);
  const results = await Promise.all([1, 2].map(() => request('/api/quotes/QT-0001/convert', {
    cookie, data: { pickupDate: '2026-10-26' },
  })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(results.find(r => r.status === 201).body.orderNo, 'SO-0019');
  const stored = (await request('/api/quotes/QT-0001', { cookie })).body.quote;
  assert.equal(stored.convertedOrderNo, 'SO-0019');
  assert.deepEqual(stored.lines, original.lines);
});

test('November conversion returns PRICE_CHANGED before explicit acceptance', async () => {
  assert.equal((await request('/api/test/clock', { data: { now: '2026-10-26T10:00:00+07:00' } })).status, 200);
  const cookie = await login();
  const pricedInput = { model: 'B-500', color: 'clear', quantity: 40000, logo: false, addressCode: 'ADDR-02' };
  const original = await create(cookie, pricedInput);
  assert.equal(original.validUntil, '2026-11-02');
  await request('/api/test/clock', { data: { now: '2026-11-01T10:00:00+07:00' } });
  const current = (await request('/api/quote', { cookie, data: pricedInput })).body.lines.total;
  assert.notEqual(current, original.lines.total);
  const conversion = { pickupDate: '2026-11-16' };
  const changed = await request('/api/quotes/QT-0001/convert', { cookie, data: conversion });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.errors[0].code, 'PRICE_CHANGED');
  assert.equal(changed.body.errors[0].params.total, current);
  const quote = (await request('/api/quotes/QT-0001', { cookie })).body.quote;
  assert.deepEqual(quote.lines, original.lines);
  assert.equal(quote.convertedOrderNo, null);
  const accepted = await request('/api/quotes/QT-0001/convert', {
    cookie, data: { ...conversion, acceptTotal: current },
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.orderNo, 'SO-0019');
  assert.equal(accepted.body.lines.total, current);
});

test('creation and conversion publish their canonical order.events messages', async () => {
  assert.ok(process.env.AMQP_URL, 'set AMQP_URL and the same MQ_PREFIX as the mock web');
  assert.ok(process.env.MQ_PREFIX, 'test queues must have an isolated MQ_PREFIX');
  const connection = await amqp.connect(process.env.AMQP_URL);
  try {
    const channel = await connection.createChannel();
    const names = await assertTopology(channel);
    const { queue } = await channel.assertQueue(`${process.env.MQ_PREFIX}quotes-test-${randomUUID()}`, {
      durable: false, exclusive: true, autoDelete: true,
    });
    await channel.bindQueue(queue, names.orderEvents, '');
    const cookie = await login();
    await create(cookie);
    const quoteEvent = await channel.get(queue, { noAck: true });
    assert.ok(quoteEvent, 'quote.created event must be published before the HTTP response');
    assert.deepEqual(JSON.parse(quoteEvent.content.toString()), { type: 'quote.created', no: 'QT-0001' });
    const order = await request('/api/quotes/QT-0001/convert', {
      cookie, data: { pickupDate: '2026-10-26' },
    });
    assert.equal(order.status, 201);
    const orderEvent = await channel.get(queue, { noAck: true });
    assert.ok(orderEvent);
    assert.deepEqual(JSON.parse(orderEvent.content.toString()), { type: 'order.created', no: 'SO-0019' });
    assert.equal(await channel.get(queue, { noAck: true }), false);
  } finally {
    await connection.close();
  }
});
