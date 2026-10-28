import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/http";
import { getSamples, createSampleRequest } from "@/lib/server/samples";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await customer();
    return getSamples(pool, s.companyId, await now(pool));
  });
}
export async function POST(req: Request) {
  const b = await readJson(req);
  return api(
    async () => {
      const s = await customer();
      return createSampleRequest(pool, {
        ...s,
        items: Array.isArray(b.items) ? b.items : [],
        note: b.note,
        dryRun: b.dryRun === true,
        now: await now(pool),
      });
    },
    b.dryRun === true ? 200 : 201,
  );
}
