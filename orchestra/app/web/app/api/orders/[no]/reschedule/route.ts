import { pool } from "@/lib/db";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/http";
import { api, customer } from "@/lib/i18n/api";
import { rescheduleOrder } from "@/lib/server/orders";
export async function POST(
  req: Request,
  { params }: { params: { no: string } },
) {
  return api(async () => {
    const s = await customer();
    const b = await readJson(req);
    return rescheduleOrder(pool, {
      ...s,
      no: params.no,
      pickupDate: b.pickupDate,
      now: await now(pool),
    });
  });
}
