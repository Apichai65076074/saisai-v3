import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { now } from "@/lib/clock";
import { listProducts } from "@/lib/server/products";
import { getSamples } from "@/lib/server/samples";
import Samples from "./view";
export default async function Page() {
  const s = await getSession();
  if (!s?.companyId) return null;
  return (
    <Samples
      lang={await getLang()}
      products={await listProducts(pool)}
      initial={await getSamples(pool, s.companyId, await now(pool))}
    />
  );
}
