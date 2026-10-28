"use client";
import { fmtMoney, fmtInt } from "@/lib/money";
import { t, errorMessage, type Lang } from "@/lib/i18n";
export type UiError = {
  code: string;
  field?: string;
  params?: Record<string, string | number>;
  message?: string;
};
export type Lines = {
  unitPrice: string;
  quantity: number;
  logo: boolean;
  logoUnitPrice: string;
  bottles: string;
  discountRate: string;
  discount: string;
  logoAmount: string;
  shipping: string;
  trips: number;
  subtotal: string;
  vat: string;
  total: string;
};
export function Errors({
  errors,
  lang,
  id = "submit-error",
}: {
  errors: UiError[];
  lang: Lang;
  id?: string;
}) {
  return (
    <div role="alert">
      {errors.map((e, i) => (
        <p
          className="error"
          key={i}
          data-testid={id}
          data-code={e.code}
          data-error-code={e.code}
        >
          {errorMessage(lang, e.code, e.params)}
        </p>
      ))}
    </div>
  );
}
export function PriceLines({ lines: l, lang }: { lines: Lines; lang: Lang }) {
  const rows = [
    [
      "bottles",
      t(lang, "lineBottles", {
        qty: fmtInt(l.quantity),
        unit: fmtMoney(l.unitPrice),
      }),
      l.bottles,
    ],
    [
      "discount",
      t(lang, "lineDiscount", { rate: Number(l.discountRate) * 100 }),
      l.discount,
    ],
    [
      "logo",
      t(lang, "lineLogo", {
        qty: fmtInt(l.quantity),
        unit: fmtMoney(l.logoUnitPrice),
        amount: fmtMoney(l.logoAmount),
      }),
      l.logoAmount,
    ],
    ["shipping", t(lang, "lineShipping", { trips: l.trips }), l.shipping],
    ["subtotal", t(lang, "lineSubtotal"), l.subtotal],
    ["vat", t(lang, "lineVat"), l.vat],
    ["total", t(lang, "lineTotal"), l.total],
  ];
  return (
    <table data-testid="price-lines">
      <tbody>
        {rows.map(([key, label, value]) => (
          <tr key={key} data-testid={`row-${key}`}>
            <th data-testid={`line-${key}-label`}>{label}</th>
            <td
              className="num money"
              data-testid={`line-${key}`}
              data-value={value}
              data-trips={key === "shipping" ? l.trips : undefined}
            >
              {fmtMoney(value, { negative: key === "discount" })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function Credit({
  credit,
  lang,
  terms = credit.terms,
}: {
  credit: { terms: string; remaining: number; shipped: number };
  terms?: string;
  lang: Lang;
}) {
  return (
    <div className="card" data-testid="credit-card">
      <h3>{t(lang, "creditStatus")}</h3>
      <p
        data-testid="credit-status"
        data-value={credit.remaining}
        data-terms={credit.terms}
      >
        {credit.terms === "credit30"
          ? t(lang, "termsCredit")
          : t(
              lang,
              credit.remaining === 1 ? "creditPrepayOne" : "creditPrepay",
              { n: credit.remaining },
            )}
      </p>
      <p data-testid="shipped-count" data-value={credit.shipped}>
        {t(lang, "creditShipped", { n: credit.shipped })}
      </p>
      <p data-testid="payment-terms" data-value={terms}>
        {t(lang, terms === "credit30" ? "termsCredit" : "termsPrepay")}
      </p>
      <p data-testid="bank-account">
        {t(lang, "bankAccount", {
          name:
            lang === "th" ? "บจก. ใสใส กลาสแวร์" : "SaiSai Glassware Co., Ltd.",
          bank: lang === "th" ? "ธนาคารทดสอบ" : "Test Bank",
          acc: "000-0-00000-0",
        })}
      </p>
    </div>
  );
}
