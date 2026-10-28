import Link from "next/link";
import { notFound } from "next/navigation";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getClaimForCompany } from "@/lib/server/claims";
import { t, claimStatusName } from "@/lib/i18n";
export default async function Page({ params }: { params: { no: string } }) {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const c = await getClaimForCompany(pool, params.no, s.companyId);
  if (!c) notFound();
  return (
    <article data-testid="claim-detail">
      <h1 data-testid="claim-title">{c.claim_no}</h1>
      <p data-testid="claim-status" data-value={c.status}>
        {claimStatusName(lang, c.status)}
      </p>
      <Link data-testid="claim-order-no" href={`/orders/${c.order_no}`}>
        {c.order_no}
      </Link>
      <p data-testid="claim-lot" data-user-content="true">
        {c.lot_no}
      </p>
      <p data-testid="claim-quantity" data-value={c.quantity}>
        {c.quantity}
      </p>
      <p data-testid="claim-created-at">{c.created_at.toISOString()}</p>
      <p data-testid="claim-description" data-user-content="true">
        {c.description}
      </p>
      {c.reject_reason && (
        <p data-testid="reject-reason" data-user-content="true">
          {c.reject_reason}
        </p>
      )}
      <div
        className="grid"
        data-testid="claim-photos"
        data-count={c.photos.length}
      >
        {c.photos.map((p) => (
          <a
            key={p.seq}
            data-testid={`claim-photo-link-${p.seq}`}
            href={`/api/claims/${c.claim_no}/photos/${p.seq}`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              data-testid={`claim-photo-${p.seq}`}
              src={`/api/claims/${c.claim_no}/photos/${p.seq}`}
              alt={t(lang, "photoAlt", { no: c.claim_no, n: p.seq })}
            />
          </a>
        ))}
      </div>
      <div data-testid="claim-history" data-count={c.history.length}>
        {c.history.map((h, i) => (
          <p
            key={i}
            data-testid="claim-history-row"
            data-from={h.from ?? ""}
            data-to={h.to}
          >
            {claimStatusName(lang, h.to)} · {h.at.toISOString()} ·{" "}
            <span data-user-content="true">
              {lang === "th" ? h.name : h.nameEn} {h.reason}
            </span>
          </p>
        ))}
      </div>
      <Link href="/claims" data-testid="back-to-claims">
        {t(lang, "navClaims")}
      </Link>
    </article>
  );
}
