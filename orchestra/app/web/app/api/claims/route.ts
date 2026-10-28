import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { now } from "@/lib/clock";
import { listClaims, createClaim } from "@/lib/server/claims";
import { publishOrderEvent } from "@/lib/i18n/order-events";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await customer();
    return { claims: await listClaims(pool, s.companyId) };
  });
}
export async function POST(req: Request) {
  return api(async () => {
    const s = await customer();
    const f = await req.formData();
    const files = f
      .getAll("photos")
      .filter((p): p is File => p instanceof File);
    return createClaim(pool, {
      ...s,
      orderNo: f.get("orderNo"),
      lotNo: f.get("lotNo"),
      quantity: f.get("quantity"),
      description: f.get("description"),
      photos: await Promise.all(
        files.map(async (p) => ({
          name: p.name,
          bytes: new Uint8Array(await p.arrayBuffer()),
        })),
      ),
      now: await now(pool),
      publish: publishOrderEvent,
    });
  }, 201);
}
