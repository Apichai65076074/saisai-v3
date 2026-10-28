import Decimal from 'decimal.js';
import type { Pool } from 'pg';
import {
  bangkokDate, monthRange, quote, sampleQuotaLeft, STATUS_SHIPPED,
  type FactoryHoliday, type ModelCode, type QuoteInput,
} from '../rules';

export type PricingInput = Omit<QuoteInput, 'logo' | 'distanceKm'> & {
  logo?: unknown;
  distanceKm?: unknown;
  addressCode?: unknown;
};
export type PricingContext = { now: Date | string; companyId?: number | null };
export type PricingDb = Pick<Pool, 'query'>;

type JsonValue<T> = T extends Decimal ? string : T extends object ? { [K in keyof T]: JsonValue<T[K]> } : T;

/** Serialize decimals without recalculating any business amount. */
function serialize<T>(value: T): JsonValue<T> {
  if (Decimal.isDecimal(value)) return value.toFixed(2) as JsonValue<T>;
  if (Array.isArray(value)) return value.map(item => serialize(item)) as JsonValue<T>;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)])) as JsonValue<T>;
  }
  return value as JsonValue<T>;
}

/** One pricing entry point for HTTP, quotes, orders and workers. No Next dependencies. */
export async function priceFromInput(db: PricingDb, input: PricingInput, ctx: PricingContext) {
  const today = bangkokDate(ctx.now);
  const range = monthRange(today);
  const [products, holidays, shipped, usage, addresses] = await Promise.all([
    db.query<{ id: number; code: string; unit_price: string }>(
      'SELECT id, code, unit_price FROM products WHERE model_code = $1 AND color = $2',
      [input.model, input.color]),
    db.query<FactoryHoliday>(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS date, name_th AS "nameTh", name_en AS "nameEn"
       FROM factory_holiday ORDER BY holiday_date`),
    ctx.companyId == null ? null : db.query<{ n: string }>(
      'SELECT count(*) AS n FROM orders WHERE company_id = $1 AND status = $2',
      [ctx.companyId, STATUS_SHIPPED]),
    ctx.companyId == null ? null : db.query<{ model: ModelCode; n: string }>(
      `SELECT p.model_code AS model, sum(i.quantity) AS n
       FROM sample_requests r JOIN sample_request_items i ON i.sample_request_id = r.id
       JOIN products p ON p.id = i.product_id
       WHERE r.company_id = $1 AND r.request_date >= $2::date AND r.request_date < $3::date
       GROUP BY p.model_code`, [ctx.companyId, range.from, range.to]),
    input.addressCode == null || input.addressCode === '' || ctx.companyId == null ? null :
      db.query<{ distance_km: number }>(
        'SELECT distance_km FROM delivery_addresses WHERE code = $1 AND company_id = $2',
        [input.addressCode, ctx.companyId]),
  ]);
  const hasAddress = input.addressCode != null && input.addressCode !== '';
  const address = addresses?.rows[0];
  const result = quote({ ...input, logo: input.logo ?? false,
    distanceKm: hasAddress ? address?.distance_km : input.distanceKm,
  }, {
    unitPrice: products.rows[0]?.unit_price ?? null,
    today, shippedCount: Number(shipped?.rows[0]?.n ?? 0), requirePickup: false,
    holidays: holidays.rows,
  });
  if (hasAddress && !address) {
    result.ok = false;
    result.errors = result.errors.filter(error => error.field !== 'distance');
    result.errors.push({ code: 'ADDRESS_NOT_FOUND', field: 'address' });
  }
  const used = Object.fromEntries((usage?.rows ?? []).map(row => [row.model, Number(row.n)]));
  return {
    ...serialize(result), earliestPickup: result.earliestPickupDate,
    sampleQuotaLeft: sampleQuotaLeft(used),
  };
}
