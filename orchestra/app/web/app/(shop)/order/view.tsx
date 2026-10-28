"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { colorName, t, type Lang } from "@/lib/i18n";
import { fmtDate, fmtMoney, fmtInt } from "@/lib/money";
import type { Product } from "@/lib/server/products";
import {
  Credit,
  Errors,
  PriceLines,
  type Lines,
  type UiError,
} from "../_components/common";
type Address = {
  code: string;
  label: string;
  labelEn: string;
  distanceKm: number;
  isPrimary: boolean;
};
type Preview = {
  ok: boolean;
  errors: UiError[];
  lines: Lines | null;
  earliestPickup: string;
  credit: { terms: string; remaining: number; shipped: number };
  upsell: { targetQty: number; ratePercent: number; saving: string } | null;
};
export default function Order({
  lang,
  products,
  addresses,
}: {
  lang: Lang;
  products: Product[];
  addresses: Address[];
}) {
  const params = useSearchParams();
  const initial =
    products.find(
      (p) => p.model === params.get("model") && p.color === params.get("color"),
    ) ?? products[0];
  const [model, setModel] = useState(initial.model),
    [color, setColor] = useState(initial.color),
    [quantity, setQuantity] = useState(String(initial.minQty)),
    [logo, setLogo] = useState(false),
    [addressCode, setAddress] = useState(
      addresses.find((a) => a.isPrimary)?.code ?? "",
    ),
    [distanceKm, setDistance] = useState("0"),
    [pickupDate, setPickup] = useState(""),
    [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null),
    [pending, setPending] = useState(true),
    [errors, setErrors] = useState<UiError[]>([]),
    [busy, setBusy] = useState(false),
    [orderNo, setOrderNo] = useState("");
  const input = {
    model,
    color,
    quantity,
    logo,
    addressCode,
    distanceKm,
    pickupDate,
    note,
    reorderOf: params.get("reorder") ?? undefined,
  };
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    const reorder = params.get("reorder");
    if (!reorder) return;
    let active = true;
    fetch(`/api/orders/${encodeURIComponent(reorder)}`)
      .then((r) => r.json())
      .then((b) => {
        if (!active || !b.order) return;
        const o = b.order;
        setModel(o.model);
        setColor(o.color);
        setQuantity(String(o.quantity));
        setLogo(o.logo);
        setAddress(o.addressCode ?? "");
        setDistance(String(o.distance_km));
      });
    return () => {
      active = false;
    };
  }, [params]);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: inputKey,
          signal: controller.signal,
        });
        const b = await r.json();
        if (!controller.signal.aborted) setPreview(b);
      } catch {
        if (!controller.signal.aborted) setPreview(null);
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputKey, lang]);
  function chooseModel(m: string) {
    const p =
      products.find((p) => p.model === m && p.color === color) ??
      products.find((p) => p.model === m)!;
    setModel(m);
    setColor(p.color);
    setQuantity(String(p.minQty));
    setErrors([]);
  }
  const quantityErrors =
    preview?.errors?.filter((e) => e.field === "quantity") ?? [];
  const locked = !preview || quantityErrors.length > 0;
  const sales = preview?.errors?.some((e) =>
    ["DISTANCE_TOO_FAR", "QTY_MAX"].includes(e.code),
  );
  const canConfirm = !pending && preview?.ok && pickupDate !== "";
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    setErrors([]);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, quotedTotal: preview?.lines?.total }),
      });
      const b = await r.json();
      if (!r.ok) {
        setErrors(b.errors ?? [{ code: "SERVER_ERROR" }]);
        return;
      }
      setOrderNo(b.orderNo);
    } catch {
      setErrors([{ code: "SERVER_ERROR" }]);
    } finally {
      setBusy(false);
    }
  }
  async function requestQuote() {
    setBusy(true);
    setErrors([]);
    try {
      const r = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const b = await r.json();
      if (r.ok && b.quoteNo) window.location.assign(`/quotes/${b.quoteNo}`);
      else setErrors(b.errors ?? [{ code: "BAD_REQUEST" }]);
    } catch {
      setErrors([{ code: "SERVER_ERROR" }]);
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (field: string, id: string) => (
    <Errors
      lang={lang}
      errors={preview?.errors?.filter((e) => e.field === field) ?? []}
      id={id}
    />
  );
  if (orderNo)
    return (
      <div className="card" data-testid="order-success">
        <h1>{t(lang, "orderPlaced")}</h1>
        <strong data-testid="order-no">{orderNo}</strong>
        <p>
          <Link data-testid="view-order-link" href={`/orders/${orderNo}`}>
            {t(lang, "viewOrder")}
          </Link>
        </p>
      </div>
    );
  return (
    <>
      <h1>{t(lang, "orderTitle")}</h1>
      {params.get("reorder") && (
        <p data-testid="reorder-note">
          {t(lang, "reorderNote", { no: params.get("reorder")! })}
        </p>
      )}
      <form data-testid="order-form" onSubmit={submit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: 24,
          }}
        >
          <div>
            <fieldset data-testid="step-model">
              <legend>{t(lang, "stepModel")}</legend>
              {Array.from(new Set(products.map((p) => p.model))).map((m) => (
                <label
                  key={m}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginRight: 16,
                    gap: 6,
                  }}
                >
                  <input
                    style={{ width: "auto" }}
                    data-testid={`model-${m}`}
                    type="radio"
                    name="model"
                    checked={model === m}
                    onChange={() => chooseModel(m)}
                  />
                  {m}
                </label>
              ))}
            </fieldset>
            <fieldset data-testid="step-color">
              <legend>{t(lang, "stepColor")}</legend>
              <div data-testid="color-options">
                {products
                  .filter((p) => p.model === model)
                  .map((p) => (
                    <label
                      key={p.color}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        marginRight: 16,
                        gap: 6,
                      }}
                    >
                      <input
                        style={{ width: "auto" }}
                        type="radio"
                        name="color"
                        data-testid={`color-${p.color}`}
                        checked={color === p.color}
                        onChange={() => setColor(p.color)}
                      />
                      {colorName(lang, p.color)}
                    </label>
                  ))}
              </div>
              {fieldError("product", "error-product")}
            </fieldset>
            <fieldset data-testid="step-quantity">
              <legend>{t(lang, "stepQty")}</legend>
              <label htmlFor="quantity">{t(lang, "quantity")}</label>
              <input
                id="quantity"
                data-testid="quantity-input"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              {fieldError("quantity", "error-quantity")}
              {preview?.upsell && (
                <p className="warning" data-testid="upsell-warning">
                  {lang === "th"
                    ? `ถ้าสั่ง ${fmtInt(preview.upsell.targetQty)} ใบ จะได้ลด ${preview.upsell.ratePercent}% จ่ายน้อยลง ${fmtMoney(preview.upsell.saving)} (ก่อน VAT)`
                    : `If you order ${fmtInt(preview.upsell.targetQty)} bottles, you get ${preview.upsell.ratePercent}% off and pay ${fmtMoney(preview.upsell.saving)} less (before VAT)`}
                </p>
              )}
            </fieldset>
            <fieldset data-testid="step-logo" disabled={locked}>
              <legend>{t(lang, "stepLogo")}</legend>
              <label style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ width: "auto" }}
                  type="checkbox"
                  data-testid="logo-checkbox"
                  checked={logo}
                  onChange={(e) => setLogo(e.target.checked)}
                />
                {t(lang, "logoOption")}
              </label>
              {fieldError("logo", "error-logo")}
            </fieldset>
            <fieldset data-testid="step-address" disabled={locked}>
              <legend>{t(lang, "stepAddress")}</legend>
              <label htmlFor="address">{t(lang, "address")}</label>
              <select
                id="address"
                data-testid="address-select"
                value={addressCode}
                onChange={(e) => setAddress(e.target.value)}
              >
                <option value="">{t(lang, "addressNone")}</option>
                {addresses.map((a) => (
                  <option key={a.code} value={a.code}>
                    {lang === "th" ? a.label : a.labelEn} ({a.distanceKm} km)
                  </option>
                ))}
              </select>
              <label htmlFor="distance">{t(lang, "distance")}</label>
              <input
                id="distance"
                data-testid="distance-input"
                disabled={!!addressCode}
                inputMode="numeric"
                value={
                  addressCode
                    ? addresses.find((a) => a.code === addressCode)?.distanceKm
                    : distanceKm
                }
                onChange={(e) => setDistance(e.target.value)}
              />
              {fieldError("distance", "error-distance")}
              {fieldError("address", "error-distance")}
            </fieldset>
            <fieldset data-testid="step-pickup" disabled={locked}>
              <legend>{t(lang, "stepPickup")}</legend>
              <p
                data-testid="earliest-pickup"
                data-value={preview?.earliestPickup}
              >
                {t(lang, "earliestPickup", {
                  date: fmtDate(preview?.earliestPickup, lang),
                })}
              </p>
              <label htmlFor="pickup">{t(lang, "pickupDate")}</label>
              <input
                id="pickup"
                type="date"
                data-testid="pickup-date-input"
                value={pickupDate}
                onChange={(e) => setPickup(e.target.value)}
              />
              {fieldError("pickupDate", "error-pickup")}
              <label htmlFor="note">{t(lang, "note")}</label>
              <textarea
                id="note"
                data-testid="note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </fieldset>
          </div>
          <section>
            <div
              className="card"
              data-testid="order-summary"
              data-pending={pending}
            >
              <h2>{t(lang, "stepSummary")}</h2>
              <p data-testid="summary-product">
                {model} · {colorName(lang, color)} · {fmtInt(quantity)}
              </p>
              <p data-testid="summary-pickup">{fmtDate(pickupDate, lang)}</p>
              {pending && <p role="status">{t(lang, "calculating")}</p>}
              {preview?.lines ? (
                <PriceLines lines={preview.lines} lang={lang} />
              ) : (
                <p data-testid="summary-empty">—</p>
              )}
              {sales && (
                <p className="warning" data-testid="sales-contact">
                  {t(lang, "salesContact", {
                    phone: "02-000-0000",
                    line: "@saisai-test",
                  })}
                </p>
              )}
              <Errors errors={errors} lang={lang} />
              {errors.find((e) => e.code === "DUPLICATE_ORDER") && (
                <p data-testid="order-error" data-error-code="DUPLICATE_ORDER">
                  <Link
                    data-testid="existing-order-link"
                    href={`/orders/${errors.find((e) => e.code === "DUPLICATE_ORDER")?.params?.code}`}
                  >
                    {
                      errors.find((e) => e.code === "DUPLICATE_ORDER")?.params
                        ?.code
                    }
                  </Link>
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 20,
                  flexWrap: "wrap",
                }}
              >
                <button
                  data-testid="order-confirm"
                  className="btn-primary"
                  disabled={!canConfirm || busy}
                >
                  {t(lang, busy ? "confirming" : "confirmOrder")}
                </button>
                <button
                  type="button"
                  data-testid="quote-request"
                  className="btn-secondary"
                  disabled={!!sales || pending || busy || !preview?.ok}
                  onClick={requestQuote}
                >
                  {lang === "th" ? "ขอใบเสนอราคา" : "Request a quote"}
                </button>
              </div>
            </div>
            {preview?.credit && <Credit credit={preview.credit} lang={lang} />}
          </section>
        </div>
      </form>
    </>
  );
}
