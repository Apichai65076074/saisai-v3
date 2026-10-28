import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { now } from "@/lib/clock";
import { ShopError } from "@/lib/server/orders";
import { getQuoteForCompany } from "@/lib/server/quotes";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: { no: string } },
) {
  return api(async () => {
    const s = await customer();
    const quote = await getQuoteForCompany(
      pool,
      params.no,
      s.companyId,
      await now(pool),
    );
    if (!quote) throw new ShopError(404, [{ code: "QUOTE_NOT_FOUND" }]);
    return { quote };
  });
}
