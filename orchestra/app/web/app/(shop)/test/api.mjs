import assert from "node:assert/strict";
const base = process.env.BASE_URL ?? "http://localhost:4600";
async function json(path, data, cookie) {
  const r = await fetch(base + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(data === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: r.status, body: await r.json() };
}
async function session(email, password) {
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.status, 200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
await json("/api/test/reset", {});
const arun = await session("arun@saisai.test", "Arun#Test2026");
const porn = await session("porn@saisai.test", "Porn#Test2026");
const theera = await session("theera@saisai.test", "Theera#Test2026");
const staff = await session("somsri@saisai.test", "Somsri#Test2026");
assert.equal((await json("/api/orders")).status, 401);
assert.equal((await json("/api/orders", undefined, staff)).status, 403);
const input = {
  model: "B-250",
  color: "clear",
  quantity: 10000,
  logo: true,
  addressCode: "ADDR-01",
  pickupDate: "2026-10-26",
};
assert.equal(
  (await json("/api/orders", { ...input, pickupDate: "" }, arun)).body.errors[0]
    .code,
  "PICKUP_REQUIRED",
);
assert.equal(
  (await json("/api/orders", { ...input, addressCode: "ADDR-05" }, arun)).body
    .errors[0].code,
  "ADDRESS_NOT_FOUND",
);
assert.equal(
  (await json("/api/orders", { ...input, quotedTotal: "1.00" }, arun)).body
    .errors[0].code,
  "PRICE_CHANGED",
);
const simultaneous = await Promise.all([
  json("/api/orders", input, arun),
  json("/api/orders", input, arun),
]);
assert.deepEqual(simultaneous.map((r) => r.status).sort(), [201, 409]);
const created = simultaneous.find((r) => r.status === 201).body;
assert.equal(created.orderNo, "SO-0019");
assert.equal(created.lines.total, "63023.00");
assert.equal(
  simultaneous.find((r) => r.status === 409).body.existing,
  "SO-0019",
);
const before = (await json("/api/orders/SO-0013", undefined, arun)).body.order;
assert.equal(
  (
    await json(
      "/api/orders/SO-0013/reschedule",
      { pickupDate: "2026-12-05" },
      arun,
    )
  ).status,
  422,
);
assert.equal(
  (
    await json(
      "/api/orders/SO-0013/reschedule",
      { pickupDate: "2026-10-26" },
      arun,
    )
  ).status,
  200,
);
const after = (await json("/api/orders/SO-0013", undefined, arun)).body.order;
assert.deepEqual(after.lines, before.lines);
assert.equal(after.pickupChanges.length, 1);
assert.equal(after.status, before.status);
assert.equal(
  (
    await json(
      "/api/orders/SO-0012/reschedule",
      { pickupDate: "2026-10-26" },
      arun,
    )
  ).body.errors[0].code,
  "RESCHEDULE_NOT_ALLOWED",
);
assert.equal(
  (await json("/api/orders/SO-0013", undefined, theera)).status,
  404,
);
// Exactly ten minutes still counts as duplicate; one second later creates the next number.
await json("/api/test/clock", { now: "2026-10-11T10:10:00+07:00" });
assert.equal((await json("/api/orders", input, arun)).status, 409);
await json("/api/test/clock", { now: "2026-10-11T10:10:01+07:00" });
assert.equal((await json("/api/orders", input, arun)).body.orderNo, "SO-0020");
// U02 and U03 share C02 in the immutable seed.
const acrossUsers = await Promise.all(
  [theera, porn].map((cookie) =>
    json("/api/orders", { ...input, addressCode: "ADDR-05" }, cookie),
  ),
);
assert.deepEqual(acrossUsers.map((r) => r.status).sort(), [201, 409]);
assert.equal(acrossUsers.find((r) => r.status === 201).body.orderNo, "SO-0021");
// All colors share the same company's model quota, including concurrent requests.
const samples = await Promise.all(
  ["clear", "green"].map((color) =>
    json(
      "/api/samples",
      { items: [{ model: "B-250", color, quantity: 2 }] },
      arun,
    ),
  ),
);
assert.deepEqual(samples.map((r) => r.status).sort(), [201, 400]);
assert.equal(
  samples.find((r) => r.status === 400).body.errors[0].code,
  "SAMPLE_QUOTA",
);
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkYQAAAAASUVORK5CYII=",
  "base64",
);
async function claim(cookie, orderNo, bytes = photo) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    orderNo,
    lotNo: "LOT-261005",
    quantity: "1",
    description: "Damaged bottle",
  }))
    form.set(key, value);
  form.append("photos", new Blob([bytes], { type: "image/png" }), "claim.png");
  const r = await fetch(base + "/api/claims", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  return { status: r.status, body: await r.json() };
}
assert.equal(
  (await claim(theera, "SO-0001")).body.errors[0].code,
  "CLAIM_WINDOW",
);
assert.equal(
  (await claim(arun, "SO-0007", Buffer.from("fake png"))).body.errors[0].code,
  "PHOTO_TYPE",
);
assert.equal(
  (await claim(arun, "SO-0007", Buffer.alloc(5242881, 1))).body.errors[0].code,
  "PHOTO_TYPE",
);
const large = Buffer.alloc(5242881);
photo.copy(large);
assert.equal(
  (await claim(arun, "SO-0007", large)).body.errors[0].code,
  "PHOTO_SIZE",
);
const accepted = await claim(arun, "SO-0007");
assert.equal(accepted.status, 201);
assert.equal(accepted.body.claimNo, "CL-0005");
const image = await fetch(base + "/api/claims/CL-0005/photos/1", {
  headers: { cookie: arun },
});
assert.equal(image.status, 200);
assert.deepEqual(Buffer.from(await image.arrayBuffer()), photo);
assert.equal(
  (
    await fetch(base + "/api/claims/CL-0005/photos/1", {
      headers: { cookie: theera },
    })
  ).status,
  404,
);
await json("/api/test/reset", {});
console.log(
  "T07 HTTP checks passed: authentication, isolation, concurrent duplicates, numbering, immutable reschedule, sample quota, claim window and image validation.",
);
