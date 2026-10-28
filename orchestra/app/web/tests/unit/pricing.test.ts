import { describe, expect, it, vi } from 'vitest';
import { priceFromInput, type PricingDb } from '../../lib/server/pricing';
import { pricingError } from '../../app/api/quote/messages';

function database(options: { missingProduct?: boolean; companyId?: number; shipped?: string; price?: string } = {}) {
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.includes('FROM products WHERE')) return { rows: options.missingProduct ? [] : [{ id: 1, code: 'P05', unit_price: options.price ?? '5.20' }] };
    if (sql.includes('FROM factory_holiday')) return { rows: [{ date: '2026-12-05', nameTh: 'วันพ่อแห่งชาติ', nameEn: "National Father's Day" }] };
    if (sql.includes('FROM orders')) return { rows: [{ n: options.shipped ?? '3' }] };
    if (sql.includes('FROM sample_requests')) return { rows: [{ model: 'B-250', n: '2' }] };
    if (sql.includes('FROM delivery_addresses')) return { rows: args[0] === 'ADDR-01' && args[1] === (options.companyId ?? 1) ? [{ distance_km: 160 }] : [] };
    throw new Error('Unexpected SQL');
  });
  return { db: { query } as unknown as PricingDb, query };
}
const input = { model: 'B-250', color: 'clear', quantity: 10000, logo: true, addressCode: 'ADDR-01' };
const ctx = { now: '2026-10-11T10:00:00+07:00', companyId: 1 };

describe('pricing adapter', () => {
  it('loads address, price, holidays, shipments and monthly sample usage; serializes all amounts', async () => {
    const { db, query } = database();
    const r = await priceFromInput(db, { ...input, distanceKm: 0 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.lines).toMatchObject({ unitPrice: '5.20', bottles: '52000.00', discount: '2600.00', logoUnitPrice: '0.80',
      logoAmount: '8000.00', shipping: '1500.00', subtotal: '58900.00', vat: '4123.00', total: '63023.00', trips: 1, distanceKm: 160 });
    expect(r.credit).toEqual({ terms: 'credit30', shipped: 3, remaining: 0 });
    expect(r.sampleQuotaLeft['B-250']).toBe(1);
    expect(r.earliestPickupDate).toBe('2026-10-25');
    expect(r.earliestPickup).toBe('2026-10-25');
    expect(query.mock.calls.find(([sql]) => sql.includes('FROM sample_requests'))?.[1]).toEqual([1, '2026-10-01', '2026-11-01']);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  it.each([2, undefined])('rejects another company or anonymous address lookup (%s), even with explicit distance', async companyId => {
    const { db, query } = database();
    const r = await priceFromInput(db, { ...input, distanceKm: 0 }, { ...ctx, companyId });
    expect(r.ok).toBe(false);
    expect(r.lines).toBeNull();
    expect(r.errors).toEqual([{ code: 'ADDRESS_NOT_FOUND', field: 'address' }]);
    if (companyId) expect(query.mock.calls.find(([sql]) => sql.includes('FROM delivery_addresses'))?.[1]).toEqual(['ADDR-01', companyId]);
    else expect(query.mock.calls.some(([sql]) => sql.includes('FROM delivery_addresses'))).toBe(false);
  });
  it('allows anonymous explicit distance and defaults to prepayment and unused sample quota', async () => {
    const { db } = database();
    const r = await priceFromInput(db, { ...input, addressCode: undefined, distanceKm: 160 }, { now: ctx.now });
    expect(r.ok).toBe(true);
    expect(r.credit).toEqual({ terms: 'prepay', shipped: 0, remaining: 3 });
    expect(r.sampleQuotaLeft['B-250']).toBe(3);
  });
  it('uses database price rather than hardcoded product pricing', async () => {
    const { db } = database({ price: '5.80' });
    const r = await priceFromInput(db, input, ctx);
    expect(r.lines?.bottles).toBe('58000.00');
    expect(r.lines?.discount).toBe('2900.00');
  });
  it('returns product rule error when the DB product is absent', async () => {
    const { db } = database({ missingProduct: true });
    const r = await priceFromInput(db, input, ctx);
    expect(r.errors[0].code).toBe('PRODUCT_NOT_FOUND');
    expect(r.lines).toBeNull();
  });
  it('normalizes now to Bangkok date for discount boundaries', async () => {
    const { db } = database();
    const r = await priceFromInput(db, { ...input, quantity: 4900, logo: false }, { ...ctx, now: '2026-10-31T17:00:00Z' });
    expect(r.upsell?.saving).toBe('260.00');
  });
  it('retains prices while reporting holiday validation errors', async () => {
    const { db } = database();
    const r = await priceFromInput(db, { ...input, pickupDate: '2026-12-05' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.lines?.total).toBe('63023.00');
    expect(pricingError(r.errors[0], 'th').message).toBe('โรงงานหยุดวันที่ 5 ธ.ค. 2026 (วันพ่อแห่งชาติ) กรุณาเลือกวันรับของอื่น');
    expect(pricingError(r.errors[0], 'en').message).toBe("The factory is closed on 5 Dec 2026 (National Father's Day). Please choose another pickup date");
  });
  it('matches legacy minimum quantity messages in both languages', () => {
    const error = { code: 'QTY_MIN', field: 'quantity', params: { model: 'B-500', min: 800 } };
    expect(pricingError(error, 'th').message).toBe('B-500 สั่งขั้นต่ำ 800 ใบ');
    expect(pricingError(error, 'en').message).toBe('B-500 minimum order is 800 bottles');
  });
});
