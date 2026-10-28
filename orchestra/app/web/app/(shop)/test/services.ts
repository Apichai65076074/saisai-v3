import assert from "node:assert/strict";
import { pool } from "../../../lib/db";
import { createOrder } from "../../../lib/server/orders";
import { createSampleRequest } from "../../../lib/server/samples";
async function main() {
  const c = await pool.connect();
  try {
    await c.query("SELECT reset_test_data($1)", ["2026-10-11T10:00:00+07:00"]);
    await c.query("BEGIN");
    const at = "2026-10-11T10:00:00+07:00";
    const result = await createOrder(c, {
      companyId: 1,
      userId: 1,
      now: at,
      input: {
        model: "B-250",
        color: "clear",
        quantity: 10000,
        logo: true,
        addressCode: "ADDR-01",
        pickupDate: "2026-10-26",
      },
    });
    assert.equal(result.orderNo, "SO-0019");
    assert.equal(result.lines.total, "63023.00");
    const sample = await createSampleRequest(c, {
      companyId: 1,
      userId: 1,
      now: at,
      items: [{ model: "B-250", color: "green", quantity: 3 }],
    });
    assert.ok("requestNo" in sample);
    assert.equal(sample.requestNo, "SR-0004");
    await c.query("ROLLBACK");
    assert.equal(
      Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM orders WHERE order_no='SO-0019'",
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number(
        (await c.query("SELECT n FROM doc_counters WHERE prefix='SO'")).rows[0]
          .n,
      ),
      18,
    );
    assert.equal(
      Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM sample_requests WHERE request_no='SR-0004'",
          )
        ).rows[0].n,
      ),
      0,
    );
    console.log("T07 caller-owned transaction rollback checks passed.");
  } finally {
    c.release();
    await pool.end();
  }
}
void main();
