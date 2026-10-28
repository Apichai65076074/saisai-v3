import Link from "next/link";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getCredit, listOrders } from "@/lib/server/orders";
import { t, colorName, orderStatusName } from "@/lib/i18n";
import { fmtMoney, fmtInt, fmtDate } from "@/lib/money";
import { Credit } from "../_components/common";
export default async function Page() {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const orders = await listOrders(pool, s.companyId);
  const credit = await getCredit(pool, s.companyId);
  return (
    <>
      <h1>{t(lang, "ordersTitle")}</h1>
      <Credit credit={credit} lang={lang} />
      <p>
        <Link className="btn" data-testid="new-order-link" href="/order">
          {t(lang, "navOrder")}
        </Link>
      </p>
      {orders.length === 0 ? (
        <p data-testid="orders-empty">{t(lang, "ordersEmpty")}</p>
      ) : (
        <table data-testid="orders-table" data-count={orders.length}>
          <thead>
            <tr>
              {[
                "orderNo",
                "product",
                "quantity",
                "pickupDate",
                "status",
                "dueDate",
                "total",
              ].map((k) => (
                <th key={k}>{t(lang, k as "orderNo")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.order_no} data-testid={`order-row-${o.order_no}`}>
                <td>
                  <Link
                    href={`/orders/${o.order_no}`}
                    data-testid={`order-link-${o.order_no}`}
                  >
                    {o.order_no}
                  </Link>
                </td>
                <td>
                  {o.model} {colorName(lang, o.color)}
                </td>
                <td>{fmtInt(o.quantity)}</td>
                <td>{fmtDate(o.pickup_date, lang)}</td>
                <td
                  data-testid={`order-status-${o.order_no}`}
                  data-value={o.status}
                >
                  {orderStatusName(lang, o.status)}
                </td>
                <td
                  data-testid="due-date"
                  data-state={
                    o.due_date
                      ? "date"
                      : o.payment_terms === "credit30"
                        ? "pending"
                        : "none"
                  }
                  data-value={o.due_date ?? ""}
                >
                  {o.due_date
                    ? fmtDate(o.due_date, lang)
                    : o.payment_terms === "credit30"
                      ? t(lang, "duePending")
                      : "–"}
                </td>
                <td
                  data-testid={`order-total-${o.order_no}`}
                  data-value={o.total_amount}
                >
                  {fmtMoney(o.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
