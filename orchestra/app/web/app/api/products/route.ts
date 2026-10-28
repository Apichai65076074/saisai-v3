import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { listProducts } from "@/lib/server/products";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    return { products: await listProducts(pool) };
  });
}
