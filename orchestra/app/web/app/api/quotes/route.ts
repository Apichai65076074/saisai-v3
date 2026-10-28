import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/http";
import { createQuote, listQuotes } from "@/lib/server/quotes";
import { publishOrderEvent } from "@/lib/i18n/order-events";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await customer();
    return { quotes: await listQuotes(pool, s.companyId, await now(pool)) };
  });
}
/** input เดียวกับ POST /api/quote → QT-NNNN (snapshot บรรทัดเงิน · อายุ 7 วัน) */
export async function POST(req: Request) {
  return api(async () => {
    const s = await customer();
    const input = await readJson(req);
    return createQuote(pool, {
      companyId: s.companyId,
      userId: s.userId,
      input: input as Parameters<typeof createQuote>[1]["input"],
      now: await now(pool),
      publish: publishOrderEvent,
    });
  }, 201);
}
