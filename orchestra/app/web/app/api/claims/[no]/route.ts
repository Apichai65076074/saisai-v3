import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { getClaimForCompany } from "@/lib/server/claims";
import { ShopError } from "@/lib/server/orders";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: { no: string } },
) {
  return api(async () => {
    const s = await customer();
    const claim = await getClaimForCompany(pool, params.no, s.companyId);
    if (!claim) throw new ShopError(404, [{ code: "CLAIM_NOT_FOUND" }]);
    return { claim };
  });
}
