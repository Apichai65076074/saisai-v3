import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  exchangeOptions,
} from "../../../../shared/mq-topology.mjs";
const require = createRequire(
  new URL("../../../package.json", import.meta.url),
);
const amqp = require("amqplib");
assert.ok(process.env.AMQP_URL, "Set AMQP_URL for the T07 mock event check");
const base = process.env.BASE_URL ?? "http://localhost:4600";
const connection = await amqp.connect(process.env.AMQP_URL);
try {
  const channel = await connection.createChannel();
  const exchange = (process.env.MQ_PREFIX ?? "T07_") + "order.events";
  const definition = exchangeOptions(process.env.MQ_PREFIX ?? "T07_")[exchange];
  await channel.assertExchange(exchange, definition.type, definition.options);
  const queue = await channel.assertQueue("", {
    exclusive: true,
    autoDelete: true,
  });
  await channel.bindQueue(queue.queue, exchange, "");
  const observed = [];
  await channel.consume(queue.queue, (msg) => {
    if (msg) {
      observed.push(JSON.parse(msg.content.toString()));
      channel.ack(msg);
    }
  });
  await fetch(base + "/api/test/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "arun@saisai.test",
      password: "Arun#Test2026",
    }),
  });
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const order = await fetch(base + "/api/orders", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      model: "B-100",
      color: "clear",
      quantity: 2400,
      addressCode: "ADDR-01",
      pickupDate: "2026-10-26",
    }),
  });
  assert.equal(order.status, 201);
  const no = (await order.json()).orderNo;
  for (let i = 0; i < 50 && !observed.some((e) => e.no === no); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(observed.some((e) => e.type === "order.created" && e.no === no));
  const form = new FormData();
  for (const [k, v] of Object.entries({
    orderNo: "SO-0007",
    lotNo: "LOT-261005",
    quantity: "1",
    description: "Damaged",
  }))
    form.set(k, v);
  form.append(
    "photos",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkYQAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "claim.png",
  );
  const claim = await fetch(base + "/api/claims", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  assert.equal(claim.status, 201);
  const claimNo = (await claim.json()).claimNo;
  for (let i = 0; i < 50 && !observed.some((e) => e.no === claimNo); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(
    observed.some((e) => e.type === "claim.created" && e.no === claimNo),
  );
  await fetch(base + "/api/test/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  await channel.close();
  console.log(
    "T07 RabbitMQ confirmed order.created and claim.created on the prefixed fanout exchange.",
  );
} finally {
  await connection.close();
}
