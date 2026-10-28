import Link from "next/link";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { listClaims } from "@/lib/server/claims";
import { t, claimStatusName } from "@/lib/i18n";
export default async function Page() {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const claims = await listClaims(pool, s.companyId);
  return (
    <>
      <h1>{t(lang, "claimsTitle")}</h1>
      {!claims.length ? (
        <p data-testid="claims-empty">{t(lang, "claimsEmpty")}</p>
      ) : (
        <table data-testid="claims-table" data-count={claims.length}>
          <thead>
            <tr>
              <th>{t(lang, "claimNo")}</th>
              <th>{t(lang, "orderNo")}</th>
              <th>{t(lang, "quantity")}</th>
              <th>{t(lang, "status")}</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.claim_no} data-testid={`claim-row-${c.claim_no}`}>
                <td>
                  <Link
                    href={`/claims/${c.claim_no}`}
                    data-testid={`claim-link-${c.claim_no}`}
                  >
                    {c.claim_no}
                  </Link>
                </td>
                <td>
                  <Link href={`/orders/${c.order_no}`}>{c.order_no}</Link>
                </td>
                <td>{c.quantity}</td>
                <td
                  data-testid={`claim-status-${c.claim_no}`}
                  data-value={c.status}
                >
                  {claimStatusName(lang, c.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
