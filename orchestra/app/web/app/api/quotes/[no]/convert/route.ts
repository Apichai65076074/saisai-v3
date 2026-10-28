import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/http";
import { convertQuote } from "@/lib/server/quotes";
import { publishOrderEvent } from "@/lib/i18n/order-events";
export const dynamic = "force-dynamic";
/** {pickupDate, acceptTotal?, note?} → ตรวจเหมือน POST /api/orders → {orderNo} */
export async function POST(
  req: Request,
  { params }: { params: { no: string } },
) {
  return api(async () => {
    const s = await customer();
    const body = await readJson(req);
    return convertQuote(pool, {
      companyId: s.companyId,
      userId: s.userId,
      no: params.no,
      pickupDate: body.pickupDate,
      acceptTotal: body.acceptTotal,
      note: body.note,
      now: await now(pool),
      publish: publishOrderEvent,
    });
  }, 201);
}
