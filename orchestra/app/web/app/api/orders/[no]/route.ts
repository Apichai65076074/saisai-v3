import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { getOrderForCompany, ShopError } from "@/lib/server/orders";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: { no: string } },
) {
  return api(async () => {
    const s = await customer();
    const order = await getOrderForCompany(pool, params.no, s.companyId);
    if (!order) throw new ShopError(404, [{ code: "ORDER_NOT_FOUND" }]);
    return { order };
  });
}
