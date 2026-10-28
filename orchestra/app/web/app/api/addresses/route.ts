import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { listAddresses } from "@/lib/server/products";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await customer();
    return { addresses: await listAddresses(pool, s.companyId) };
  });
}
