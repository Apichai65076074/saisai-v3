import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/http";
import { listOrders, getCredit, createOrder } from "@/lib/server/orders";
import { publishOrderEvent } from "@/lib/i18n/order-events";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await customer();
    return {
      orders: await listOrders(pool, s.companyId),
      credit: await getCredit(pool, s.companyId),
    };
  });
}
export async function POST(req: Request) {
  return api(async () => {
    const s = await customer();
    const input = await readJson(req);
    return createOrder(pool, {
      ...s,
      input: input as Parameters<typeof createOrder>[1]["input"],
      now: await now(pool),
      publish: publishOrderEvent,
    });
  }, 201);
}
