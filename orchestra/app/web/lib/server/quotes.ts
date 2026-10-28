// ใบเสนอราคา QT (T08) · ไม่พึ่ง Next → chat-worker import ตรงด้วย tsx ได้
// ตัวเลขเงินทุกตัวมาจาก priceFromInput() → quote() ใน rules.ts (snapshot ลง quotes.lines ณ วันออก)
import type { Pool, PoolClient } from "pg";
import { addDays, bangkokDate } from "../rules";
import { priceFromInput, type PricingInput } from "./pricing";
import { createOrder, ShopError, transaction } from "./orders";
import type { ShopDb } from "./products";

/** อายุใบเสนอราคา (PROBLEM 3.4 ⚠️ สมมติฐาน · SS-POLICY POL-086) */
export const QUOTE_VALID_DAYS = 7;
/** ระยะ/จำนวนที่ต้องคุยกับเซลส์ → ไม่ออก QT */
const SALES_ONLY = ["DISTANCE_TOO_FAR", "QTY_MAX"];

type Publish = (
  exchange: string,
  payload: { type: string; no: string },
) => Promise<unknown>;

export type QuoteInputSnapshot = {
  model: string;
  color: string;
  quantity: number;
  logo: boolean;
  addressCode?: string;
  distanceKm?: number;
  pickupDate?: string;
  note?: string;
};

type QuoteRow = {
  id: number;
  quote_no: string;
  company_id: number;
  created_by: number;
  input: QuoteInputSnapshot;
  lines: Record<string, unknown> & { total: string };
  valid_until: string;
  converted_order_no: string | null;
  created_at: Date;
};

/** เก็บเฉพาะฟิลด์ที่ใช้คิดราคา (ทิ้ง reorderOf/quotedTotal ฯลฯ) */
function snapshotInput(input: PricingInput & { note?: unknown }): QuoteInputSnapshot {
  const hasAddress = input.addressCode != null && input.addressCode !== "";
  const out: QuoteInputSnapshot = {
    model: String(input.model ?? ""),
    color: String(input.color ?? ""),
    quantity: Number(input.quantity),
    logo: input.logo === true || input.logo === "true",
  };
  if (hasAddress) out.addressCode = String(input.addressCode);
  else out.distanceKm = Number(input.distanceKm);
  if (typeof input.pickupDate === "string" && input.pickupDate !== "")
    out.pickupDate = input.pickupDate;
  if (typeof input.note === "string" && input.note.trim() !== "")
    out.note = input.note.slice(0, 1000);
  return out;
}

/**
 * ออกใบเสนอราคา · ต้องเป็นลูกค้าที่ล็อกอิน (companyId จาก session ฝั่ง server เท่านั้น)
 * ราคาไม่ ok / DISTANCE_TOO_FAR / QTY_MAX → throw ShopError (errors รูปแบบเดียวกับ /api/quote)
 */
export async function createQuote(
  db: Pool | PoolClient,
  args: {
    companyId: number | null | undefined;
    userId: number | null | undefined;
    input: PricingInput & { note?: unknown };
    now: Date | string;
    publish?: Publish;
  },
) {
  if (args.companyId == null || args.userId == null)
    throw new ShopError(401, [{ code: "LOGIN_REQUIRED" }]);
  const companyId = args.companyId;
  const result = await transaction(db, async (c) => {
    const q = await priceFromInput(c, args.input, {
      now: args.now,
      companyId,
    });
    if (q.errors.some((e) => SALES_ONLY.includes(e.code)))
      throw new ShopError(422, q.errors);
    if (!q.ok || !q.lines) throw new ShopError(400, q.errors);
    const validUntil = addDays(bangkokDate(args.now), QUOTE_VALID_DAYS);
    const no = (await c.query("SELECT next_doc_no('QT') AS no")).rows[0].no;
    await c.query(
      `INSERT INTO quotes(quote_no,company_id,created_by,input,lines,valid_until,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        no,
        companyId,
        args.userId,
        JSON.stringify(snapshotInput(args.input)),
        JSON.stringify(q.lines),
        validUntil,
        args.now,
      ],
    );
    return {
      ok: true as const,
      quoteNo: no as string,
      validUntil,
      lines: q.lines,
    };
  });
  if (args.publish)
    await args.publish("order.events", {
      type: "quote.created",
      no: result.quoteNo,
    }).catch(() => undefined); // แจ้งเตือนล่มต้องไม่ทำให้ QT ที่ออกแล้วล้ม
  return result;
}

function present(row: QuoteRow, today: string) {
  const expired = today > row.valid_until;
  return {
    quoteNo: row.quote_no,
    input: row.input,
    lines: row.lines,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    convertedOrderNo: row.converted_order_no,
    expired,
    canConvert: !expired && !row.converted_order_no,
  };
}
export type QuoteView = ReturnType<typeof present>;

const QUOTE_SELECT = `SELECT id,quote_no,company_id,created_by,input,lines,to_char(valid_until,'YYYY-MM-DD') AS valid_until,converted_order_no,created_at FROM quotes`;

/** บริษัทอื่น/ไม่มี → null ("ไม่พบใบเสนอราคานี้") */
export async function getQuoteForCompany(
  db: ShopDb,
  no: string,
  companyId: number,
  now: Date | string,
): Promise<QuoteView | null> {
  const row = (
    await db.query<QuoteRow>(
      `${QUOTE_SELECT} WHERE quote_no=$1 AND company_id=$2`,
      [no, companyId],
    )
  ).rows[0];
  return row ? present(row, bangkokDate(now)) : null;
}

export async function listQuotes(
  db: ShopDb,
  companyId: number,
  now: Date | string,
  limit = 100,
) {
  const today = bangkokDate(now);
  return (
    await db.query<QuoteRow>(
      `${QUOTE_SELECT} WHERE company_id=$1 ORDER BY id DESC LIMIT $2`,
      [companyId, Math.min(Math.max(limit, 1), 500)],
    )
  ).rows.map((r) => present(r, today));
}

/**
 * แปลง QT → ออเดอร์ · ตรวจทุกกฎซ้ำผ่าน createOrder (วันรับของ 14 วัน · วันหยุด · กันซ้ำ)
 * คิดราคาใหม่ ณ วันที่แปลง (ตารางส่วนลดตามวัน) · ยอดไม่เท่า QT → 409 PRICE_CHANGED
 * (params.total = ยอดใหม่ · ส่ง acceptTotal = ยอดใหม่มาเพื่อยืนยันราคาใหม่)
 */
export async function convertQuote(
  db: Pool | PoolClient,
  args: {
    companyId: number;
    userId: number;
    no: string;
    pickupDate?: unknown;
    acceptTotal?: unknown;
    note?: unknown;
    now: Date | string;
    publish?: Publish;
  },
) {
  const result = await transaction(db, async (c) => {
    const row = (
      await c.query<QuoteRow>(
        `${QUOTE_SELECT} WHERE quote_no=$1 AND company_id=$2 FOR UPDATE`,
        [args.no, args.companyId],
      )
    ).rows[0];
    if (!row) throw new ShopError(404, [{ code: "QUOTE_NOT_FOUND" }]);
    if (row.converted_order_no)
      throw new ShopError(
        409,
        [{ code: "QUOTE_CONVERTED", params: { code: row.converted_order_no } }],
        row.converted_order_no,
      );
    if (bangkokDate(args.now) > row.valid_until)
      throw new ShopError(410, [
        { code: "QUOTE_EXPIRED", params: { date: row.valid_until } },
      ]);
    const { note: quoteNote, ...priced } = row.input;
    const input = {
      ...priced,
      pickupDate:
        args.pickupDate === undefined ? row.input.pickupDate : args.pickupDate,
      note: typeof args.note === "string" ? args.note : quoteNote,
    };
    const fresh = await priceFromInput(c, input, {
      now: args.now,
      companyId: args.companyId,
    });
    const quoted = row.lines.total;
    const current = fresh.lines?.total;
    if (current && current !== quoted && String(args.acceptTotal) !== current)
      throw new ShopError(409, [
        { code: "PRICE_CHANGED", params: { total: current, quoted } },
      ]);
    const order = await createOrder(c, {
      companyId: args.companyId,
      userId: args.userId,
      input: { ...input, quotedTotal: current ?? quoted },
      now: args.now,
    });
    await c.query("UPDATE quotes SET converted_order_no=$1 WHERE id=$2", [
      order.orderNo,
      row.id,
    ]);
    return {
      ok: true as const,
      quoteNo: row.quote_no,
      orderNo: order.orderNo,
      lines: order.lines,
      priceChanged: current !== quoted,
    };
  });
  if (args.publish)
    await args.publish("order.events", {
      type: "order.created",
      no: result.orderNo,
    }).catch(() => undefined);
  return result;
}
