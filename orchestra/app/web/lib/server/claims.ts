import type { Pool, PoolClient } from "pg";
import {
  claimWindow,
  claimedSoFar,
  checkLot,
  checkClaimQuantity,
  checkPhotoCount,
  checkPhoto,
  type RuleError,
} from "../rules";
import { ShopError, transaction } from "./orders";
import type { ShopDb } from "./products";
export type ClaimRow = {
  id: number;
  claim_no: string;
  order_no: string;
  status: string;
  lot_no: string;
  quantity: number;
  created_at: Date;
  description: string;
  reject_reason: string | null;
};
export type ClaimPhoto = { name: string; bytes: Uint8Array };
export async function listClaims(db: ShopDb, companyId: number) {
  return (
    await db.query(
      "SELECT c.*,o.order_no FROM claims c JOIN orders o ON o.id=c.order_id WHERE c.company_id=$1 ORDER BY c.id DESC",
      [companyId],
    )
  ).rows;
}
export async function getClaimForCompany(
  db: ShopDb,
  no: string,
  companyId: number,
) {
  const c = (
    await db.query<ClaimRow>(
      "SELECT c.*,o.order_no FROM claims c JOIN orders o ON o.id=c.order_id WHERE c.claim_no=$1 AND c.company_id=$2",
      [no, companyId],
    )
  ).rows[0];
  if (!c) return null;
  const [photos, history] = await Promise.all([
    db.query<{
      seq: number;
      file_name: string;
      mime_type: string;
      size_bytes: number;
    }>(
      "SELECT seq,file_name,mime_type,size_bytes FROM claim_photos WHERE claim_id=$1 ORDER BY seq",
      [c.id],
    ),
    db.query<{
      from: string | null;
      to: string;
      at: Date;
      reason: string | null;
      name: string;
      nameEn: string;
    }>(
      'SELECT h.from_status AS "from",h.to_status AS "to",h.changed_at AS at,h.reason,u.display_name AS name,u.display_name_en AS "nameEn" FROM claim_status_history h JOIN users u ON u.id=h.changed_by WHERE claim_id=$1 ORDER BY h.id',
      [c.id],
    ),
  ]);
  return { ...c, photos: photos.rows, history: history.rows };
}
export async function createClaim(
  db: Pool | PoolClient,
  args: {
    companyId: number;
    userId: number;
    orderNo: unknown;
    lotNo: unknown;
    quantity: unknown;
    description: unknown;
    photos: ClaimPhoto[];
    now: Date | string;
    publish?: (
      exchange: string,
      payload: { type: string; no: string },
    ) => Promise<unknown>;
  },
) {
  const result = await transaction(db, async (c) => {
    const o = (
      await c.query(
        "SELECT * FROM orders WHERE order_no=$1 AND company_id=$2 FOR UPDATE",
        [args.orderNo, args.companyId],
      )
    ).rows[0];
    if (!o) throw new ShopError(404, [{ code: "ORDER_NOT_FOUND" }]);
    const previous = (
      await c.query("SELECT quantity,status FROM claims WHERE order_id=$1", [
        o.id,
      ])
    ).rows;
    const window = claimWindow(o.status, o.shipped_at, args.now);
    const errors = [
      window.error,
      checkLot(args.lotNo),
      checkClaimQuantity(args.quantity, o.quantity, claimedSoFar(previous)),
      checkPhotoCount(args.photos.length),
      ...args.photos.map((p) => checkPhoto(p.bytes, p.bytes.byteLength).error),
    ].filter((e): e is RuleError => e !== null);
    if (errors.length) throw new ShopError(400, errors);
    const no = (await c.query("SELECT next_doc_no('CL') AS no")).rows[0].no;
    const row = (
      await c.query(
        `INSERT INTO claims(claim_no,order_id,company_id,reported_by,lot_no,quantity,description,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'received',$8) RETURNING id`,
        [
          no,
          o.id,
          args.companyId,
          args.userId,
          args.lotNo,
          Number(args.quantity),
          typeof args.description === "string" ? args.description : "",
          args.now,
        ],
      )
    ).rows[0];
    for (const [i, p] of args.photos.entries())
      await c.query(
        "INSERT INTO claim_photos(claim_id,seq,file_name,mime_type,size_bytes,content) VALUES($1,$2,$3,$4,$5,$6)",
        [
          row.id,
          i + 1,
          p.name,
          checkPhoto(p.bytes, p.bytes.byteLength).mime,
          p.bytes.byteLength,
          Buffer.from(p.bytes),
        ],
      );
    await c.query(
      "INSERT INTO claim_status_history(claim_id,from_status,to_status,changed_by,changed_at) VALUES($1,NULL,'received',$2,$3)",
      [row.id, args.userId, args.now],
    );
    return { ok: true, claimNo: no };
  });
  if (args.publish)
    await args.publish("order.events", {
      type: "claim.created",
      no: result.claimNo,
    });
  return result;
}
