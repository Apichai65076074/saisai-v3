import { NextResponse } from 'next/server';
import { getLang, getSession } from '@/lib/auth';
import { now } from '@/lib/clock';
import { pool } from '@/lib/db';
import { fail, msg, readJson } from '@/lib/http';
import { onlyFactoryClosed } from '@/lib/rules';
import { priceFromInput } from '@/lib/server/pricing';
import { pricingError } from './messages';

export const dynamic = 'force-dynamic';

/** Public preview; company identity is taken exclusively from the signed session. */
export async function POST(req: Request) {
  const lang = await getLang();
  try {
    const [body, session, at] = await Promise.all([readJson(req), getSession(), now(pool)]);
    const result = await priceFromInput(pool, {
      model: body.model, color: body.color, quantity: body.quantity,
      logo: body.logo, distanceKm: body.distanceKm, addressCode: body.addressCode,
      pickupDate: body.pickupDate,
    }, { now: at, companyId: session?.companyId });
    return NextResponse.json({ ...result, errors: result.errors.map(error => pricingError(error, lang)) }, {
      status: result.ok ? 200 : onlyFactoryClosed(result.errors) ? 422 : 400,
    });
  } catch {
    return fail(500, { code: 'SERVER_ERROR', message: msg('SERVER_ERROR', lang) });
  }
}
