import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { assertTopology } from '../../../shared/mq-topology.mjs';
const require = createRequire(new URL('../../../web/package.json', import.meta.url));
const amqp = require('amqplib');
test('live consumer retries malformed requests twice then DLQ retains original content', async () => {
  assert.match(process.env.MQ_PREFIX || '', /^T13_/u, 'Use the task-isolated T13_ queue prefix');
  const connection = await amqp.connect(process.env.AMQP_URL);
  try {
    const ch = await connection.createConfirmChannel();
    const n = await assertTopology(ch);
    let request;
    for (let attempt = 0; attempt < 100; attempt++) {
      request = await ch.checkQueue(n.chatRequest);
      if (request.consumerCount > 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(request.consumerCount, 1, 'Start exactly one owned chat worker');
    const marker = `malformed-${randomUUID()}`;
    ch.sendToQueue(n.chatRequest, Buffer.from(marker), { persistent: true, correlationId: marker });
    await ch.waitForConfirms();
    let received;
    for (let attempt = 0; attempt < 100; attempt++) {
      const msg = await ch.get(n.chatDlq);
      if (msg) {
        if (msg.content.toString() === marker) { received = msg; break; }
        // Hold unrelated messages unacknowledged until close, which requeues them.
        // Immediate requeue would repeatedly return the same head and starve our marker.
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(received, 'Request must reach DLQ');
    assert.equal(received.properties.headers['x-retry'], 2);
    assert.equal(received.properties.correlationId, marker);
    ch.ack(received);
  } finally { await connection.close(); }
});
