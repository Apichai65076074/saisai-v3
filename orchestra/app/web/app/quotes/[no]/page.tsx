import Link from "next/link";
import { notFound } from "next/navigation";
import { getLang, getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { now } from "@/lib/clock";
import { colorName, t } from "@/lib/i18n";
import { fmtDate, fmtInt } from "@/lib/money";
import { bangkokDate } from "@/lib/rules";
import { getQuoteForCompany } from "@/lib/server/quotes";
import { priceFromInput } from "@/lib/server/pricing";
import { PriceLines, type Lines } from "../../(shop)/_components/common";
import QuoteActions from "./actions";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: { no: string } }) {
  const s = await getSession();
  if (!s?.companyId) return null;
  const lang = await getLang();
  const th = lang === "th";
  const at = await now(pool);
  const q = await getQuoteForCompany(pool, params.no, s.companyId, at);
  if (!q) notFound();
  const company = (
    await pool.query<{ code: string; name: string; name_en: string }>(
      "SELECT code,name,name_en FROM companies WHERE id=$1",
      [s.companyId],
    )
  ).rows[0];
  const address = q.input.addressCode
    ? (
        await pool.query<{ label: string; label_en: string; distance_km: number }>(
          "SELECT label,label_en,distance_km FROM delivery_addresses WHERE code=$1 AND company_id=$2",
          [q.input.addressCode, s.companyId],
        )
      ).rows[0]
    : undefined;
  // วันรับของเร็วสุด ณ วันนี้ (ใช้เป็นค่าเริ่มต้นตอนแปลง)
  const fresh = q.canConvert
    ? await priceFromInput(pool, q.input, { now: at, companyId: s.companyId })
    : null;
  return (
    <article data-testid="quote-detail" data-quote-no={q.quoteNo}>
      <div className="quote-paper">
        <header className="quote-head">
          <div className="quote-shop">
            <strong>{th ? "บจก. ใสใส กลาสแวร์" : "SaiSai Glassware Co., Ltd."}</strong>
            <p>
              {th ? "โทร" : "Tel"} 02-000-0000 · LINE @saisai-test
            </p>
            <p data-testid="quote-bank">
              {t(lang, "bankAccount", {
                name: th ? "บจก. ใสใส กลาสแวร์" : "SaiSai Glassware Co., Ltd.",
                bank: th ? "ธนาคารทดสอบ" : "Test Bank",
                acc: "000-0-00000-0",
              })}
            </p>
          </div>
          <div className="quote-meta">
            <h1>{th ? "ใบเสนอราคา" : "Quotation"}</h1>
            <p>
              {th ? "เลขที่" : "No."}{" "}
              <strong data-testid="quote-no">{q.quoteNo}</strong>
            </p>
            <p data-testid="quote-created-at" data-value={bangkokDate(q.createdAt)}>
              {th ? "วันที่ออก" : "Issued"}: {fmtDate(bangkokDate(q.createdAt), lang)}
            </p>
            <p data-testid="quote-valid-until" data-value={q.validUntil}>
              {th ? "ใช้ได้ถึง" : "Valid until"}: {fmtDate(q.validUntil, lang)}
            </p>
          </div>
        </header>
        <section>
          <p data-testid="quote-customer" data-value={company?.code}>
            {th ? "ลูกค้า" : "Customer"}: {th ? company?.name : company?.name_en}
          </p>
          <p data-testid="quote-product">
            {q.input.model} · {colorName(lang, q.input.color)} ·{" "}
            <span data-testid="quote-quantity" data-value={q.input.quantity}>
              {fmtInt(q.input.quantity)}
            </span>
          </p>
          <p data-testid="quote-delivery">
            {address
              ? `${th ? address.label : address.label_en} · ${t(lang, "km", { n: address.distance_km })}`
              : t(lang, "km", { n: q.input.distanceKm ?? 0 })}
          </p>
          {q.input.pickupDate && (
            <p data-testid="quote-pickup" data-value={q.input.pickupDate}>
              {t(lang, "pickupDate")}: {fmtDate(q.input.pickupDate, lang)}
            </p>
          )}
        </section>
        <PriceLines lines={q.lines as unknown as Lines} lang={lang} />
        <p className="muted">
          {th
            ? "ราคานี้รวม VAT 7% · ใบเสนอราคามีอายุ 7 วันนับจากวันที่ออก"
            : "Prices include 7% VAT · This quotation is valid for 7 days from the issue date"}
        </p>
      </div>
      {q.expired && !q.convertedOrderNo && (
        <p className="quote-expired" data-testid="quote-expired" data-value={q.validUntil}>
          {th
            ? `ใบเสนอราคานี้หมดอายุแล้ว (ใช้ได้ถึง ${fmtDate(q.validUntil, lang)}) กรุณาขอใบเสนอราคาใหม่`
            : `This quote has expired (valid until ${fmtDate(q.validUntil, lang)}). Please request a new quote`}
        </p>
      )}
      {q.convertedOrderNo && (
        <p data-testid="quote-converted" data-value={q.convertedOrderNo}>
          {th ? "แปลงเป็นออเดอร์แล้ว" : "Converted to order"}{" "}
          <Link href={`/orders/${q.convertedOrderNo}`}>{q.convertedOrderNo}</Link>
        </p>
      )}
      <QuoteActions
        no={q.quoteNo}
        lang={lang}
        canConvert={q.canConvert}
        pickupDate={q.input.pickupDate ?? fresh?.earliestPickup ?? ""}
        earliest={fresh?.earliestPickup ?? ""}
      />
      <p className="no-print">
        <Link data-testid="back-to-quotes" href="/quotes">
          {th ? "ใบเสนอราคาทั้งหมด" : "All quotes"}
        </Link>
      </p>
    </article>
  );
}
