import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { listProducts, listAddresses } from "@/lib/server/products";
import Order from "./view";
export default async function Page() {
  const s = await getSession();
  return (
    <Order
      lang={await getLang()}
      products={await listProducts(pool)}
      addresses={s?.companyId ? await listAddresses(pool, s.companyId) : []}
    />
  );
}
