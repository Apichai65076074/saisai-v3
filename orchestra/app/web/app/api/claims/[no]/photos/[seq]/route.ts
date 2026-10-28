import { pool } from "@/lib/db";
import { api, customer } from "@/lib/i18n/api";
import { ShopError } from "@/lib/server/orders";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: { no: string; seq: string } },
) {
  let photo: { content: Buffer; mime_type: string } | undefined;
  const checked = await api(async () => {
    const s = await customer();
    photo = (
      await pool.query(
        "SELECT p.content,p.mime_type FROM claim_photos p JOIN claims c ON c.id=p.claim_id WHERE c.claim_no=$1 AND c.company_id=$2 AND p.seq=$3",
        [params.no, s.companyId, Number(params.seq) || 0],
      )
    ).rows[0];
    if (!photo) throw new ShopError(404, [{ code: "CLAIM_NOT_FOUND" }]);
    return { ok: true };
  });
  return photo
    ? new Response(new Uint8Array(photo.content), {
        headers: {
          "content-type": photo.mime_type,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      })
    : checked;
}
