"use client";
import { useState, type FormEvent } from "react";
import { colorName, t, type Lang } from "@/lib/i18n";
import { fmtMoney, fmtDate } from "@/lib/money";
import type { Product } from "@/lib/server/products";
import type { getSamples } from "@/lib/server/samples";
import { Errors, type UiError } from "../_components/common";
type Item = { model: string; color: string; quantity: string };
export default function Samples({
  lang,
  products,
  initial,
}: {
  lang: Lang;
  products: Product[];
  initial: Awaited<ReturnType<typeof getSamples>>;
}) {
  const [items, setItems] = useState<Item[]>([
      { model: products[0].model, color: products[0].color, quantity: "1" },
    ]),
    [state, setState] = useState(initial),
    [errors, setErrors] = useState<UiError[]>([]),
    [no, setNo] = useState(""),
    [busy, setBusy] = useState(false);
  function update(i: number, key: keyof Item, value: string) {
    setItems(
      items.map((item, j) => {
        if (i !== j) return item;
        const next = { ...item, [key]: value };
        if (
          key === "model" &&
          !products.some((p) => p.model === value && p.color === item.color)
        )
          next.color = products.find((p) => p.model === value)!.color;
        return next;
      }),
    );
    setNo("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const r = await fetch("/api/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const b = await r.json();
      if (!r.ok) {
        setErrors(b.errors);
        return;
      }
      setNo(b.requestNo);
      const fresh = await fetch("/api/samples");
      setState(await fresh.json());
    } catch {
      setErrors([{ code: "SERVER_ERROR" }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{t(lang, "samplesTitle")}</h1>
      <p>{t(lang, "samplesIntro")}</p>
      <section className="card" data-testid="sample-quota">
        <h2>{t(lang, "quotaLeft")}</h2>
        {Object.entries(state.left).map(([m, n]) => (
          <p key={m} data-testid={`quota-${m}`} data-value={n}>
            {m}: {n}
          </p>
        ))}
      </section>
      <form className="card" data-testid="sample-form" onSubmit={submit}>
        {items.map((item, i) => (
          <fieldset key={i} data-testid={`sample-item-${i + 1}`}>
            <legend>
              {t(lang, "items")} {i + 1}
            </legend>
            <label htmlFor={`model-${i}`}>{t(lang, "model")}</label>
            <select
              id={`model-${i}`}
              data-testid={`sample-model-${i + 1}`}
              value={item.model}
              onChange={(e) => update(i, "model", e.target.value)}
            >
              {Array.from(new Set(products.map((p) => p.model))).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <label htmlFor={`color-${i}`}>{t(lang, "color")}</label>
            <select
              id={`color-${i}`}
              data-testid={`sample-color-${i + 1}`}
              value={item.color}
              onChange={(e) => update(i, "color", e.target.value)}
            >
              {products
                .filter((p) => p.model === item.model)
                .map((p) => (
                  <option key={p.color} value={p.color}>
                    {colorName(lang, p.color)}
                  </option>
                ))}
            </select>
            <label htmlFor={`quantity-${i}`}>{t(lang, "quantity")}</label>
            <input
              id={`quantity-${i}`}
              data-testid={`sample-quantity-${i + 1}`}
              inputMode="numeric"
              value={item.quantity}
              onChange={(e) => update(i, "quantity", e.target.value)}
            />
            <button
              type="button"
              data-testid={`sample-remove-${i + 1}`}
              onClick={() => setItems(items.filter((_, j) => i !== j))}
            >
              {t(lang, "removeItem")}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          data-testid="sample-add-item"
          onClick={() =>
            setItems([
              ...items,
              {
                model: products[0].model,
                color: products[0].color,
                quantity: "1",
              },
            ])
          }
        >
          {t(lang, "addItem")}
        </button>
        <Errors lang={lang} errors={errors} id="error-sample" />
        <div data-testid="sample-totals">
          {(["subtotal", "vat", "total"] as const).map((k) => (
            <p key={k} data-testid={`sample-${k}`} data-value={state.totals[k]}>
              {t(lang, `line${k[0].toUpperCase()}${k.slice(1)}` as "lineTotal")}
              : {fmtMoney(state.totals[k])}
            </p>
          ))}
        </div>
        <button
          className="btn-primary"
          data-testid="submit-sample"
          disabled={busy}
        >
          {t(lang, "submitSample")}
        </button>
        {no && (
          <p data-testid="sample-success">
            {t(lang, "samplePlaced")}{" "}
            <strong data-testid="sample-no">{no}</strong>
          </p>
        )}
      </form>
      <section data-testid="sample-requests">
        <h2>{t(lang, "sampleHistory")}</h2>
        {state.requests.map((r) => (
          <div
            className="card"
            key={r.request_no}
            data-testid={`sample-request-${r.request_no}`}
          >
            <strong>{r.request_no}</strong> · {fmtDate(r.request_date, lang)} ·{" "}
            {fmtMoney(r.total_amount)}
            <ul>
              {r.items.map((it: Item, i: number) => (
                <li key={i}>
                  {it.model} {colorName(lang, it.color)} × {it.quantity}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
