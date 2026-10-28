import Link from "next/link";
import { notFound } from "next/navigation";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { now } from "@/lib/clock";
import { getOrderForCompany } from "@/lib/server/orders";
import { priceFromInput } from "@/lib/server/pricing";
import { t, colorName, orderStatusName, errorMessage } from "@/lib/i18n";
import { fmtInt, fmtDate } from "@/lib/money";
import { Credit, PriceLines } from "../../_components/common";
import Reschedule from "./reschedule";
export default async function Page({ params }: { params: { no: string } }) {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const at = await now(pool);
  const o = await getOrderForCompany(pool, params.no, s.companyId, at);
  if (!o) notFound();
  const q = await priceFromInput(
    pool,
    {
      model: o.model,
      color: o.color,
      quantity: o.quantity,
      distanceKm: o.distance_km,
    },
    { now: at, companyId: s.companyId },
  );
  return (
    <article data-testid="order-detail" data-order-no={o.order_no}>
      <h1 data-testid="order-title">{o.order_no}</h1>
      <p data-testid="order-status" data-value={o.status}>
        {orderStatusName(lang, o.status)}
      </p>
      <ol data-testid="status-steps" data-value={o.status}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <li
            key={n}
            data-testid={`status-step-${n}`}
            data-state={
              n < o.status ? "done" : n === o.status ? "current" : "todo"
            }
          >
            {orderStatusName(lang, n)}{" "}
            <span data-testid={`status-step-${n}-time`}>
              {o.history.find((h) => h.to === n)?.at?.toISOString()}
            </span>
          </li>
        ))}
      </ol>
      <p>
        {o.model} · {colorName(lang, o.color)} ·{" "}
        <span data-testid="order-quantity" data-value={o.quantity}>
          {fmtInt(o.quantity)}
        </span>
      </p>
      <p data-testid="order-logo">
        {t(lang, "stepLogo")}: {t(lang, o.logo ? "yes" : "no")}
      </p>
      <p data-testid="order-address">
        {lang === "th" ? o.addressLabel : o.addressLabelEn}
      </p>
      <p data-testid="order-distance" data-value={o.distance_km}>
        {t(lang, "km", { n: o.distance_km })}
      </p>
      <p data-testid="order-pickup-date" data-value={o.pickup_date}>
        {t(lang, "pickupDate")}: {fmtDate(o.pickup_date, lang)}
      </p>
      <p data-testid="order-created-at" data-value={o.created_at.toISOString()}>
        {fmtDate(o.created_at.toISOString(), lang)}
      </p>
      <p data-testid="due-date" data-value={o.due_date ?? ""}>
        {t(lang, "dueDate")}: {fmtDate(o.due_date, lang)}
      </p>
      <p
        data-testid="payment-status"
        data-value={o.payments.length ? "paid" : "unpaid"}
      >
        {t(lang, o.payments.length ? "paid" : "unpaid")}
      </p>
      <PriceLines lines={o.lines} lang={lang} />
      <Credit credit={o.credit} lang={lang} terms={o.payment_terms} />
      <p>
        <Link
          className="btn"
          data-testid="reorder-button"
          href={`/order?reorder=${o.order_no}`}
        >
          {t(lang, "reorder")}
        </Link>
      </p>
      {o.status <= 2 && (
        <Reschedule
          no={o.order_no}
          current={o.pickup_date}
          earliest={q.earliestPickup}
          lang={lang}
        />
      )}
      <section data-testid="pickup-changes" data-count={o.pickupChanges.length}>
        <h2>{t(lang, "pickupChanges")}</h2>
        {o.pickupChanges.map((h, i) => (
          <p
            key={i}
            data-testid="pickup-change-row"
            data-from={h.from}
            data-to={h.to}
          >
            {t(lang, "pickupChangeRow", {
              from: fmtDate(h.from, lang),
              to: fmtDate(h.to, lang),
            })}{" "}
            ·{" "}
            <span data-user-content="true">
              {lang === "th" ? h.name : h.nameEn}
            </span>{" "}
            · {h.at.toISOString()}
          </p>
        ))}
      </section>
      <section data-testid="order-history" data-count={o.history.length}>
        <h2>{t(lang, "history")}</h2>
        {o.history.map((h, i) => (
          <p
            key={i}
            data-testid="order-history-row"
            data-from={h.from ?? ""}
            data-to={h.to}
          >
            {orderStatusName(lang, h.to)} · {h.at.toISOString()}
          </p>
        ))}
      </section>
      <section>
        {o.claim.open ? (
          <>
            <p data-testid="claim-until" data-value={o.claim.lastDay ?? ""}>
              {fmtDate(o.claim.lastDay, lang)}
            </p>
            <Link
              className="btn"
              href={`/orders/${o.order_no}/claim`}
              data-testid="claim-button"
            >
              {t(lang, "fileClaim")}
            </Link>
          </>
        ) : (
          <p
            className="error"
            data-testid="claim-window-error"
            data-code={o.claim.errorCode}
          >
            {errorMessage(lang, o.claim.errorCode ?? "NOT_SHIPPED")}
          </p>
        )}
      </section>
      <div data-testid="order-claims">
        {o.claims.map((c) => (
          <p key={c.claim_no}>
            <Link
              data-testid={`order-claim-${c.claim_no}`}
              href={`/claims/${c.claim_no}`}
            >
              {c.claim_no}
            </Link>
          </p>
        ))}
      </div>
      <p>
        <Link data-testid="back-to-orders" href="/orders">
          {t(lang, "navOrders")}
        </Link>
      </p>
    </article>
  );
}
