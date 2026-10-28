import Link from "next/link";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { now } from "@/lib/clock";
import { colorName } from "@/lib/i18n";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/money";
import { listQuotes } from "@/lib/server/quotes";
export const dynamic = "force-dynamic";
export default async function Page() {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const th = lang === "th";
  const quotes = await listQuotes(pool, s.companyId, await now(pool));
  return (
    <>
      <h1>{th ? "ใบเสนอราคาของฉัน" : "My quotes"}</h1>
      <p>
        <Link className="btn" href="/order" data-testid="quote-new-link">
          {th ? "ขอใบเสนอราคาใหม่ (หน้าสั่งซื้อ)" : "Request a new quote (order page)"}
        </Link>
      </p>
      {quotes.length === 0 ? (
        <p data-testid="quote-list-empty">
          {th ? "ยังไม่มีใบเสนอราคา" : "No quotes yet"}
        </p>
      ) : (
        <table className="quote-list" data-testid="quote-list" data-count={quotes.length}>
          <thead>
            <tr>
              <th>{th ? "เลขที่" : "No."}</th>
              <th>{th ? "สินค้า" : "Product"}</th>
              <th>{th ? "ยอดรวม" : "Total"}</th>
              <th>{th ? "ใช้ได้ถึง" : "Valid until"}</th>
              <th>{th ? "สถานะ" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.quoteNo} data-testid="quote-row" data-no={q.quoteNo}>
                <td>
                  <Link href={`/quotes/${q.quoteNo}`}>{q.quoteNo}</Link>
                </td>
                <td>
                  {q.input.model} · {colorName(lang, q.input.color)} ·{" "}
                  {fmtInt(q.input.quantity)}
                </td>
                <td className="num money" data-value={q.lines.total}>
                  {fmtMoney(q.lines.total)}
                </td>
                <td>{fmtDate(q.validUntil, lang)}</td>
                <td>
                  {q.convertedOrderNo ? (
                    <Link href={`/orders/${q.convertedOrderNo}`}>
                      {q.convertedOrderNo}
                    </Link>
                  ) : q.expired ? (
                    th ? "หมดอายุ" : "Expired"
                  ) : th ? (
                    "ใช้ได้"
                  ) : (
                    "Valid"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
