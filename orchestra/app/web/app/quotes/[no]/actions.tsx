"use client";
import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { fmtMoney } from "@/lib/money";
import { Errors, type UiError } from "../../(shop)/_components/common";
/** ปุ่มพิมพ์ + แปลงเป็นออเดอร์ (ตรวจกฎซ้ำที่ POST /api/quotes/[no]/convert) */
export default function QuoteActions({
  no,
  lang,
  canConvert,
  pickupDate: initialPickup,
  earliest,
}: {
  no: string;
  lang: Lang;
  canConvert: boolean;
  pickupDate: string;
  earliest: string;
}) {
  const th = lang === "th";
  const [pickupDate, setPickup] = useState(initialPickup);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<UiError[]>([]);
  const [newTotal, setNewTotal] = useState("");
  async function convert(acceptTotal?: string) {
    setBusy(true);
    setErrors([]);
    try {
      const r = await fetch(`/api/quotes/${encodeURIComponent(no)}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pickupDate, acceptTotal }),
      });
      const b = await r.json();
      if (r.ok && b.orderNo) {
        window.location.assign(`/orders/${b.orderNo}`);
        return;
      }
      const errs: UiError[] = b.errors ?? [{ code: "SERVER_ERROR" }];
      const changed = errs.find((e) => e.code === "PRICE_CHANGED");
      setNewTotal(changed?.params?.total ? String(changed.params.total) : "");
      setErrors(errs);
    } catch {
      setErrors([{ code: "SERVER_ERROR" }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="quote-actions no-print">
      <button
        type="button"
        className="btn-secondary"
        data-testid="quote-print"
        onClick={() => window.print()}
      >
        🖨️ {th ? "พิมพ์ใบเสนอราคา" : "Print quote"}
      </button>
      <label>
        {th ? "วันรับของ" : "Pickup date"}
        <input
          type="date"
          data-testid="pickup-date-input"
          min={earliest || undefined}
          value={pickupDate}
          disabled={!canConvert || busy}
          onChange={(e) => setPickup(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn-primary"
        data-testid="quote-convert"
        disabled={!canConvert || busy || pickupDate === ""}
        onClick={() => convert()}
      >
        {th ? "แปลงเป็นออเดอร์" : "Convert to order"}
      </button>
      {newTotal && (
        <button
          type="button"
          className="btn-primary"
          data-testid="quote-accept-price"
          data-value={newTotal}
          disabled={busy}
          onClick={() => convert(newTotal)}
        >
          {th
            ? `ยืนยันยอดใหม่ ${fmtMoney(newTotal)} และสั่งซื้อ`
            : `Accept new total ${fmtMoney(newTotal)} and order`}
        </button>
      )}
      <div style={{ flexBasis: "100%" }}>
        <Errors errors={errors} lang={lang} id="quote-error" />
      </div>
    </div>
  );
}
