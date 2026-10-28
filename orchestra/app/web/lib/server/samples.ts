import type { Pool, PoolClient } from "pg";
import {
  bangkokDate,
  monthRange,
  checkSampleRequest,
  sampleQuotaLeft,
  sampleTotals,
  type ModelCode,
  type SampleItem,
} from "../rules";
import { ShopError, transaction } from "./orders";
import type { ShopDb } from "./products";
export async function getSamples(
  db: ShopDb,
  companyId: number,
  at: Date | string,
) {
  const today = bangkokDate(at),
    range = monthRange(today);
  const usedRows = await db.query(
    `SELECT p.model_code AS model,sum(i.quantity) AS n FROM sample_requests r JOIN sample_request_items i ON i.sample_request_id=r.id JOIN products p ON p.id=i.product_id WHERE r.company_id=$1 AND r.request_date >= $2 AND r.request_date < $3 GROUP BY p.model_code`,
    [companyId, range.from, range.to],
  );
  const used = Object.fromEntries(
    usedRows.rows.map((r) => [r.model, Number(r.n)]),
  ) as Partial<Record<ModelCode, number>>;
  const requests = (
    await db.query(
      `SELECT r.*,json_agg(json_build_object('model',p.model_code,'color',p.color,'quantity',i.quantity) ORDER BY i.id) AS items FROM sample_requests r JOIN sample_request_items i ON i.sample_request_id=r.id JOIN products p ON p.id=i.product_id WHERE r.company_id=$1 GROUP BY r.id ORDER BY r.id DESC`,
      [companyId],
    )
  ).rows;
  const totals = sampleTotals();
  return {
    today,
    used,
    left: sampleQuotaLeft(used),
    requests,
    totals: {
      subtotal: totals.subtotal.toFixed(2),
      vat: totals.vat.toFixed(2),
      total: totals.total.toFixed(2),
    },
  };
}
export async function createSampleRequest(
  db: Pool | PoolClient,
  args: {
    companyId: number;
    userId: number;
    items: SampleItem[];
    note?: unknown;
    dryRun?: boolean;
    now: Date | string;
  },
) {
  return transaction(db, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(4242,$1::int)", [
      args.companyId,
    ]);
    const state = await getSamples(c, args.companyId, args.now);
    const validation = checkSampleRequest(args.items, state.used);
    if (validation.errors.length) throw new ShopError(400, validation.errors);
    if (args.dryRun)
      return { ok: true, errors: [], totals: state.totals, left: state.left };
    const no = (await c.query("SELECT next_doc_no('SR') AS no")).rows[0].no;
    const r = (
      await c.query(
        "INSERT INTO sample_requests(request_no,company_id,requested_by,request_date,total_amount,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [
          no,
          args.companyId,
          args.userId,
          state.today,
          state.totals.total,
          typeof args.note === "string" ? args.note : null,
          args.now,
        ],
      )
    ).rows[0];
    for (const item of args.items)
      await c.query(
        "INSERT INTO sample_request_items(sample_request_id,product_id,quantity) SELECT $1,id,$2 FROM products WHERE model_code=$3 AND color=$4",
        [r.id, Number(item.quantity), item.model, item.color],
      );
    return {
      ok: true,
      requestNo: no,
      totals: state.totals,
      left: (await getSamples(c, args.companyId, args.now)).left,
    };
  });
}
