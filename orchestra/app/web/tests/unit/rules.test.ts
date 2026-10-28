import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creditDueDate, quote, sampleTotals, checkSampleRequest, creditStatus, type QuoteInput } from '../../lib/rules';

const holidays = [{ date: '2026-12-05', nameTh: 'วันพ่อแห่งชาติ', nameEn: "National Father's Day" }];
function calculate(input: Partial<QuoteInput> = {}, today = '2026-10-11', unitPrice = '5.20') {
  return quote({ model: 'B-250', color: 'clear', quantity: 10000, logo: false, distanceKm: 50, ...input },
    { today, unitPrice, shippedCount: 0, requirePickup: false, holidays });
}
const fixed = (n: { toFixed: (dp: number) => string } | undefined) => n?.toFixed(2);

describe('immutable legacy rules', () => {
  it('matches the required SHA-256 and every legacy byte', () => {
    const bytes = readFileSync(new URL('../../lib/rules.ts', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('1f880cd34c63667d90b7fac8e0cdbd6dfaa0a80ef270cda007e4957dfbf3122c');
    expect(bytes.equals(readFileSync(new URL('../../../legacy/web/lib/rules.ts', import.meta.url)))).toBe(true);
  });
  it('W02 B-500 700 bottles requires 800', () => {
    expect(calculate({ model: 'B-500', quantity: 700 }).errors).toContainEqual({ code: 'QTY_MIN', field: 'quantity', params: { model: 'B-500', min: 800 } });
  });
  it('W03 all pricing lines total 63,023.00', () => {
    const r = calculate({ logo: true, distanceKm: 160 });
    expect(r.ok).toBe(true);
    expect(Object.fromEntries(['bottles', 'discount', 'logoAmount', 'shipping', 'subtotal', 'vat', 'total'].map(key =>
      [key, fixed(r.lines![key as 'total'])]))).toEqual({ bottles: '52000.00', discount: '2600.00', logoAmount: '8000.00', shipping: '1500.00', subtotal: '58900.00', vat: '4123.00', total: '63023.00' });
    expect(r.lines?.trips).toBe(1);
    expect(fixed(r.lines?.discountRate)).toBe('0.05');
  });
  it.each([
    ['2026-10-11', '4800.00', '97584.00'],
    ['2026-11-01', '6720.00', '95529.60'],
  ])('W04 discount on %s', (today, discount, total) => {
    const r = calculate({ model: 'B-100', quantity: 30000, distanceKm: 49 }, today, '3.20');
    expect(r.ok).toBe(true);
    expect(fixed(r.lines?.discount)).toBe(discount);
    expect(fixed(r.lines?.total)).toBe(total);
    expect(fixed(r.lines?.shipping)).toBe('0.00');
    expect(r.lines?.trips).toBe(2);
  });
  it.each([
    ['B-100', 9600, '2026-10-11', '3.20', 10000, 5, '320.00'],
    ['B-250', 4900, '2026-11-01', '5.20', 5000, 3, '260.00'],
  ])('W05 upsell %s %i on %s', (model, quantity, today, price, targetQty, ratePercent, saving) => {
    const r = calculate({ model, quantity }, today, price);
    expect(r.ok).toBe(true);
    expect(r.upsell).toMatchObject({ targetQty, ratePercent });
    expect(fixed(r.upsell?.saving)).toBe(saving);
  });
  it.each([[50, '0.00'], [51, '3000.00'], [160, '3000.00']])('W06 distance %i', (distanceKm, shipping) => {
    const r = calculate({ model: 'B-500', quantity: 25000, distanceKm }, undefined, '8.20');
    expect(r.ok).toBe(true);
    expect(fixed(r.lines?.shipping)).toBe(shipping);
    expect(r.lines?.trips).toBe(2);
  });
  it('W06 rejects distance 301', () => {
    const r = calculate({ distanceKm: 301 });
    expect(r.errors.map(e => e.code)).toContain('DISTANCE_TOO_FAR');
    expect(r.lines).toBeNull();
  });
  it.each([['2026-10-24', 'PICKUP_TOO_SOON'], ['2026-12-05', 'FACTORY_CLOSED']])('W07 pickup %s', (pickupDate, code) => {
    const r = calculate({ pickupDate });
    expect(r.ok).toBe(false);
    expect(r.errors.map(e => e.code)).toEqual([code]);
    expect(r.earliestPickupDate).toBe('2026-10-25');
  });
  it('earliest pickup skips consecutive holidays', () => {
    const r = quote({ model: 'B-250', color: 'clear', quantity: 1200, logo: false, distanceKm: 0 }, {
      today: '2026-11-21', unitPrice: '5.20', shippedCount: 0, requirePickup: false,
      holidays: [...holidays, { ...holidays[0], date: '2026-12-06' }],
    });
    expect(r.earliestPickupDate).toBe('2026-12-07');
  });
  it('M01 green bottles and logo', () => {
    const r = calculate({ color: 'green', logo: true }, undefined, '5.80');
    expect(fixed(r.lines?.bottles)).toBe('58000.00');
    expect(fixed(r.lines?.discount)).toBe('2900.00');
    expect(fixed(r.lines?.logoAmount)).toBe('8000.00');
  });
  it.each([[9600, '30720.00', '2150.40', '32870.40'], [10000, '30400.00', '2128.00', '32528.00']])('M02 %i bottles', (quantity, subtotal, vat, total) => {
    const r = calculate({ model: 'B-100', quantity }, undefined, '3.20');
    expect(fixed(r.lines?.subtotal)).toBe(subtotal);
    expect(fixed(r.lines?.vat)).toBe(vat);
    expect(fixed(r.lines?.total)).toBe(total);
  });
  it('M05 credit starts after three shipments; due date is 2026-12-01', () => {
    expect(creditStatus(2).terms).toBe('prepay');
    expect(creditStatus(3).terms).toBe('credit30');
    expect(creditDueDate('2026-11-01')).toBe('2026-12-01');
  });
  it('W11 sample quota and free sample amounts', () => {
    expect(checkSampleRequest([{ model: 'B-250', color: 'green', quantity: 4 }], {}).errors[0].code).toBe('SAMPLE_QUOTA');
    expect(checkSampleRequest([{ model: 'B-250', color: 'green', quantity: 3 }], {}).errors).toEqual([]);
    expect(Object.values(sampleTotals()).map(fixed)).toEqual(['0.00', '0.00', '0.00']);
  });
  it.each([
    [{ quantity: 'x' }, 'QTY_INVALID'], [{ quantity: 1250 }, 'QTY_STEP'],
    [{ quantity: 200100 }, 'QTY_MAX'], [{ quantity: 1200, logo: true }, 'LOGO_MIN'],
    [{ distanceKm: -1 }, 'DISTANCE_INVALID'], [{ pickupDate: '2026-02-30' }, 'PICKUP_INVALID'],
    [{ color: 'purple' }, 'PRODUCT_NOT_FOUND'],
  ])('SPEC validation %j', (input, code) => {
    expect(calculate(input).errors.map(e => e.code)).toContain(code);
  });
});
