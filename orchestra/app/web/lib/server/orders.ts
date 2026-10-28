import type { Pool, PoolClient } from "pg";
import {
  bangkokDate,
  checkPickupDate,
  checkPickupFormat,
  checkReschedule,
  claimWindow,
  claimedSoFar,
  creditStatus,
  DUPLICATE_WINDOW_MINUTES,
  onlyFactoryClosed,
  type RuleError,
} from "../rules";
import { priceFromInput, type PricingInput } from "./pricing";
import type { ShopDb } from "./products";

export type OrderRow = {
  id: number;
  order_no: string;
  company_id: number;
  created_by: number;
  product_id: number;
  address_id: number | null;
  reorder_of: number | null;
  quantity: number;
  unit_price: string;
  logo: boolean;
  logo_unit_price: string;
  distance_km: number;
  trips: number;
  bottles_amount: string;
  discount_rate: string;
  discount_amount: string;
  logo_amount: string;
  shipping_amount: string;
  subtotal_amount: string;
  vat_amount: string;
  total_amount: string;
  pickup_date: string;
  payment_terms: "prepay" | "credit30";
  status: number;
  shipped_at: Date | null;
  due_date: string | null;
  note: string | null;
  created_at: Date;
  model: string;
  color: string;
  slug: string;
  addressCode: string | null;
  addressLabel: string | null;
  addressLabelEn: string | null;
};

export class ShopError extends Error {
  constructor(
    public status: number,
    public errors: RuleError[],
    public existing?: string,
  ) {
    super(errors[0]?.code);
  }
}
export async function transaction<T>(
  db: Pool | PoolClient,
  work: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const own = !("release" in db);
  const c = own ? await (db as Pool).connect() : (db as PoolClient);
  // A caller-supplied PoolClient already belongs to its caller's transaction.
  try {
    if (own) await c.query("BEGIN");
    const result = await work(c);
    if (own) await c.query("COMMIT");
    return result;
  } catch (e) {
    if (own) await c.query("ROLLBACK");
    throw e;
  } finally {
    if (own) c.release();
  }
}
export type OrderInput = PricingInput & {
  note?: unknown;
  quotedTotal?: unknown;
  reorderOf?: unknown;
};
export async function createOrder(
  db: Pool | PoolClient,
  args: {
    companyId: number;
    userId: number;
    input: OrderInput;
    now: Date | string;
    publish?: (
      exchange: string,
      payload: { type: string; no: string },
    ) => Promise<unknown>;
  },
) {
  const result = await transaction(db, async (c) => {
    const { input, companyId, userId } = args;
    await c.query("SELECT pg_advisory_xact_lock(4243,$1::int)", [companyId]);
    if (!checkPickupFormat(input.pickupDate))
      await c.query(
        "SELECT pg_advisory_xact_lock(4244, ($1::date - DATE '2000-01-01'))",
        [input.pickupDate],
      );
    const q = await priceFromInput(c, input, { now: args.now, companyId });
    const required = checkPickupDate(input.pickupDate, bangkokDate(args.now));
    if (required && !q.errors.some((e) => e.field === "pickupDate"))
      q.errors.push(required);
    if (q.errors.length || !q.lines)
      throw new ShopError(onlyFactoryClosed(q.errors) ? 422 : 400, q.errors);
    if (
      input.quotedTotal != null &&
      String(input.quotedTotal) !== q.lines.total
    )
      throw new ShopError(409, [{ code: "PRICE_CHANGED" }]);
    const product = (
      await c.query(
        "SELECT id FROM products WHERE model_code=$1 AND color=$2",
        [input.model, input.color],
      )
    ).rows[0];
    const address = input.addressCode
      ? (
          await c.query(
            "SELECT id FROM delivery_addresses WHERE code=$1 AND company_id=$2",
            [input.addressCode, companyId],
          )
        ).rows[0]?.id
      : null;
    let reorder = null;
    if (input.reorderOf) {
      reorder = (
        await c.query(
          "SELECT id FROM orders WHERE order_no=$1 AND company_id=$2",
          [input.reorderOf, companyId],
        )
      ).rows[0]?.id;
      if (!reorder) throw new ShopError(404, [{ code: "ORDER_NOT_FOUND" }]);
    }
    const l = q.lines;
    const duplicate = (
      await c.query(
        `SELECT order_no FROM orders WHERE company_id=$1 AND product_id=$2 AND quantity=$3 AND logo=$4 AND address_id IS NOT DISTINCT FROM $5::bigint AND pickup_date=$6 AND status=1 AND created_at >= $7::timestamptz - make_interval(mins=>$8) AND created_at <= $7::timestamptz ORDER BY id LIMIT 1`,
        [
          companyId,
          product.id,
          l.quantity,
          l.logo,
          address,
          input.pickupDate,
          args.now,
          DUPLICATE_WINDOW_MINUTES,
        ],
      )
    ).rows[0];
    if (duplicate)
      throw new ShopError(
        409,
        [{ code: "DUPLICATE_ORDER", params: { code: duplicate.order_no } }],
        duplicate.order_no,
      );
    const no = (await c.query("SELECT next_doc_no('SO') AS no")).rows[0].no;
    const order = (
      await c.query(
        `INSERT INTO orders(order_no,company_id,created_by,product_id,address_id,reorder_of,quantity,unit_price,logo,logo_unit_price,distance_km,trips,bottles_amount,discount_rate,discount_amount,logo_amount,shipping_amount,subtotal_amount,vat_amount,total_amount,pickup_date,payment_terms,status,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,1,$23,$24) RETURNING *`,
        [
          no,
          companyId,
          userId,
          product.id,
          address,
          reorder,
          l.quantity,
          l.unitPrice,
          l.logo,
          l.logoUnitPrice,
          l.distanceKm,
          l.trips,
          l.bottles,
          Number(l.discountRate),
          l.discount,
          l.logoAmount,
          l.shipping,
          l.subtotal,
          l.vat,
          l.total,
          input.pickupDate,
          q.credit.terms,
          typeof input.note === "string" ? input.note : null,
          args.now,
        ],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO order_status_history(order_id,from_status,to_status,changed_by,changed_at) VALUES($1,NULL,1,$2,$3)",
      [order.id, userId, args.now],
    );
    return { ok: true, orderNo: no, lines: l, order };
  });
  if (args.publish)
    await args.publish("order.events", {
      type: "order.created",
      no: result.orderNo,
    });
  return result;
}
const ORDER_SELECT = `SELECT o.*,p.model_code AS model,p.color,p.slug,a.code AS "addressCode",a.label AS "addressLabel",a.label_en AS "addressLabelEn" FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN delivery_addresses a ON a.id=o.address_id`;
export async function listOrders(db: ShopDb, companyId: number, limit = 100) {
  return (
    await db.query(
      `${ORDER_SELECT} WHERE o.company_id=$1 ORDER BY o.id DESC LIMIT $2`,
      [companyId, Math.min(Math.max(limit, 1), 500)],
    )
  ).rows;
}
export async function getCredit(db: ShopDb, companyId: number) {
  const r = await db.query(
    "SELECT count(*) AS n FROM orders WHERE company_id=$1 AND status=6",
    [companyId],
  );
  return creditStatus(Number(r.rows[0].n));
}
export async function getOrderForCompany(
  db: ShopDb,
  no: string,
  companyId: number,
  at?: Date | string,
) {
  const o = (
    await db.query<OrderRow>(
      `${ORDER_SELECT} WHERE o.order_no=$1 AND o.company_id=$2`,
      [no, companyId],
    )
  ).rows[0];
  if (!o) return null;
  const [history, changes, claims, payments, credit] = await Promise.all([
    db.query<{ from: number | null; to: number; at: Date }>(
      'SELECT from_status AS "from",to_status AS "to",changed_at AS at FROM order_status_history WHERE order_id=$1 ORDER BY id',
      [o.id],
    ),
    db.query<{
      from: string;
      to: string;
      at: Date;
      name: string;
      nameEn: string;
    }>(
      'SELECT c.from_date AS "from",c.to_date AS "to",c.changed_at AS at,u.display_name AS name,u.display_name_en AS "nameEn" FROM order_pickup_change c JOIN users u ON u.id=c.changed_by WHERE order_no=$1 ORDER BY c.id',
      [no],
    ),
    db.query<{
      claim_no: string;
      quantity: number;
      status: import("../rules").ClaimStatus;
    }>(
      "SELECT claim_no,quantity,status FROM claims WHERE order_id=$1 AND company_id=$2 ORDER BY id",
      [o.id, companyId],
    ),
    db.query("SELECT amount,recorded_at FROM payments WHERE order_id=$1", [
      o.id,
    ]),
    getCredit(db, companyId),
  ]);
  const current = at ?? (await db.query("SELECT app_now() AS now")).rows[0].now;
  const window = claimWindow(o.status, o.shipped_at, current);
  const claimed = claimedSoFar(claims.rows);
  return {
    ...o,
    orderNo: o.order_no,
    pickupDate: o.pickup_date,
    dueDate: o.due_date,
    history: history.rows,
    pickupChanges: changes.rows,
    claims: claims.rows,
    payments: payments.rows,
    credit,
    claim: {
      ...window,
      errorCode: window.error?.code,
      claimedQuantity: claimed,
      remainingQuantity: o.quantity - claimed,
    },
    lines: {
      unitPrice: o.unit_price,
      quantity: o.quantity,
      logo: o.logo,
      logoUnitPrice: o.logo_unit_price,
      bottles: o.bottles_amount,
      discountRate: o.discount_rate,
      discount: o.discount_amount,
      logoAmount: o.logo_amount,
      shipping: o.shipping_amount,
      trips: o.trips,
      subtotal: o.subtotal_amount,
      vat: o.vat_amount,
      total: o.total_amount,
    },
  };
}
export async function rescheduleOrder(
  db: Pool | PoolClient,
  args: {
    companyId: number;
    userId: number;
    no: string;
    pickupDate: unknown;
    now: Date | string;
  },
) {
  const format = checkPickupFormat(args.pickupDate);
  if (format) throw new ShopError(400, [format]);
  return transaction(db, async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(4244, ($1::date - DATE '2000-01-01'))",
      [args.pickupDate],
    );
    const o = (
      await c.query(
        "SELECT * FROM orders WHERE order_no=$1 AND company_id=$2 FOR UPDATE",
        [args.no, args.companyId],
      )
    ).rows[0];
    if (!o) throw new ShopError(404, [{ code: "ORDER_NOT_FOUND" }]);
    const holidays = (
      await c.query(
        `SELECT to_char(holiday_date,'YYYY-MM-DD') AS date,name_th AS "nameTh",name_en AS "nameEn" FROM factory_holiday`,
      )
    ).rows;
    const e = checkReschedule(
      o.status,
      o.pickup_date,
      args.pickupDate,
      bangkokDate(args.now),
      holidays,
    );
    if (e) throw new ShopError(e.code === "PICKUP_TOO_SOON" ? 400 : 422, [e]);
    await c.query("UPDATE orders SET pickup_date=$1 WHERE id=$2", [
      args.pickupDate,
      o.id,
    ]);
    await c.query(
      "INSERT INTO order_pickup_change(order_no,from_date,to_date,changed_by,changed_at) VALUES($1,$2,$3,$4,$5)",
      [args.no, o.pickup_date, args.pickupDate, args.userId, args.now],
    );
    return {
      ok: true,
      pickupDate: args.pickupDate,
      previousPickupDate: o.pickup_date,
      total: o.total_amount,
    };
  });
}
