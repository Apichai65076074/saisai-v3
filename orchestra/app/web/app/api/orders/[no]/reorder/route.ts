import { pool } from "@/lib/db";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/http";
import { api, customer } from "@/lib/i18n/api";
import { getOrderForCompany, ShopError } from "@/lib/server/orders";
import { priceFromInput } from "@/lib/server/pricing";
import { onlyFactoryClosed } from "@/lib/rules";
export async function POST(
  req: Request,
  { params }: { params: { no: string } },
) {
  return api(async () => {
    const s = await customer(),
      at = await now(pool),
      b = await readJson(req);
    const o = await getOrderForCompany(pool, params.no, s.companyId, at);
    if (!o) throw new ShopError(404, [{ code: "ORDER_NOT_FOUND" }]);
    const draft = {
      model: o.model,
      color: o.color,
      quantity: o.quantity,
      logo: o.logo,
      addressCode: o.addressCode,
      distanceKm: o.distance_km,
      pickupDate: b.pickupDate,
      reorderOf: o.order_no,
    };
    const quote = await priceFromInput(pool, draft, {
      now: at,
      companyId: s.companyId,
    });
    if (onlyFactoryClosed(quote.errors)) throw new ShopError(422, quote.errors);
    return { draft, quote, previousTotal: o.total_amount };
  });
}
