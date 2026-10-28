import { notFound } from "next/navigation";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getOrderForCompany } from "@/lib/server/orders";
import { errorMessage, t } from "@/lib/i18n";
import ClaimForm from "./view";
export default async function Page({ params }: { params: { no: string } }) {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const o = await getOrderForCompany(pool, params.no, s.companyId);
  if (!o) notFound();
  return (
    <>
      <h1 data-testid="claim-title">
        {t(lang, "fileClaim")} {o.order_no}
      </h1>
      {o.claim.open ? (
        <ClaimForm
          no={o.order_no}
          remaining={o.claim.remainingQuantity}
          ordered={o.quantity}
          lastDay={o.claim.lastDay ?? ""}
          lang={lang}
        />
      ) : (
        <p className="error" data-testid="claim-window-error">
          {errorMessage(lang, o.claim.errorCode ?? "NOT_SHIPPED")}
        </p>
      )}
    </>
  );
}
