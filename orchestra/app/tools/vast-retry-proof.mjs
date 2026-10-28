#!/usr/bin/env node
// Integration proof with a strict T22 isolation guard. Original T13 test unchanged.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.match(process.env.MQ_PREFIX || '', /^T22_/u, 'T22-owned queues only');
const root = process.env.T22_APP_ROOT || process.cwd();
const require = createRequire(resolve(root, 'web/package.json'));
const { assertTopology } = await import(pathToFileURL(resolve(root, 'shared/mq-topology.mjs')));
const connection = await require('amqplib').connect(process.env.AMQP_URL);
try {
  const ch = await connection.createConfirmChannel();
  const names = await assertTopology(ch);
  assert.equal((await ch.checkQueue(names.chatRequest)).consumerCount, 1);
  const marker = `T22-malformed-${randomUUID()}`;
  ch.sendToQueue(names.chatRequest, Buffer.from(marker), { persistent: true, correlationId: marker });
  await ch.waitForConfirms();
  let received;
  for (let attempt = 0; attempt < 100; attempt++) {
    const msg = await ch.get(names.chatDlq);
    if (msg && msg.content.toString() === marker) { received = msg; break; }
    if (msg && msg.content.toString().startsWith('T22-malformed-')) ch.ack(msg);
    // Leave unrelated messages unacknowledged; closing requeues them unchanged.
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(received, 'malformed request must reach DLQ');
  assert.equal(received.properties.headers['x-retry'], 2);
  assert.equal(received.properties.correlationId, marker);
  ch.ack(received);
  console.log(JSON.stringify({ proof: 'T22 malformed retry/DLQ', original_retained: true,
    correlation_retained: true, retry_header: 2, consumers: 1 }));
} finally { await connection.close(); }
