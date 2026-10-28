import type { Pool } from "pg";
export type ShopDb = Pick<Pool, "query">;
export type Product = {
  id: number;
  code: string;
  slug: string;
  model: string;
  color: string;
  unitPrice: string;
  imagePath: string;
  sizeMl: number;
  minQty: number;
};
export async function listProducts(db: ShopDb) {
  return (
    await db.query<Product>(
      `SELECT p.id,p.code,p.slug,p.model_code AS model,p.color,p.unit_price AS "unitPrice",p.image_path AS "imagePath",m.size_ml AS "sizeMl",m.min_qty AS "minQty" FROM products p JOIN product_models m ON m.code=p.model_code ORDER BY p.code`,
    )
  ).rows;
}
export async function listAddresses(db: ShopDb, companyId: number) {
  return (
    await db.query(
      `SELECT id,code,label,label_en AS "labelEn",address_text AS "addressText",address_text_en AS "addressTextEn",distance_km AS "distanceKm",is_primary AS "isPrimary" FROM delivery_addresses WHERE company_id=$1 ORDER BY id`,
      [companyId],
    )
  ).rows;
}
