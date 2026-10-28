import { getLang } from "@/lib/auth";
import { pool } from "@/lib/db";
import { listProducts } from "@/lib/server/products";
import Products from "./view";
export default async function Page() {
  return (
    <Products lang={await getLang()} products={await listProducts(pool)} />
  );
}
