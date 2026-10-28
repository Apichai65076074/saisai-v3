"use client";
import Link from "next/link";
import BottleSpin from "@/components/three/BottleSpin";
import { useState } from "react";
import { colorName, t, type Lang } from "@/lib/i18n";
import { fmtMoney, fmtInt } from "@/lib/money";
import type { Product } from "@/lib/server/products";
export default function Products({
  lang,
  products,
}: {
  lang: Lang;
  products: Product[];
}) {
  const [model, setModel] = useState(""),
    [color, setColor] = useState("");
  const shown = products.filter(
    (p) => (!model || p.model === model) && (!color || p.color === color),
  );
  return (
    <>
      <h1>{t(lang, "productsTitle")}</h1>
      <p>{t(lang, "productsIntro")}</p>
      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <div>
          <label htmlFor="filter-model">{t(lang, "model")}</label>
          <select
            id="filter-model"
            data-testid="product-model-filter"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">{lang === "th" ? "ทุกรุ่น" : "All models"}</option>
            {Array.from(new Set(products.map((p) => p.model))).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-color">{t(lang, "color")}</label>
          <select
            id="filter-color"
            data-testid="product-color-filter"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            <option value="">{lang === "th" ? "ทุกสี" : "All colors"}</option>
            {["clear", "amber", "green"].map((c) => (
              <option key={c} value={c}>
                {colorName(lang, c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="grid"
        data-testid="product-list"
        data-count={shown.length}
      >
        {shown.map((p) => (
          <article
            className="card"
            key={p.code}
            data-testid="product-card"
            data-slug={p.slug}
            data-model={p.model}
            data-color={p.color}
          >
            <div
              data-testid={`product-card-${p.slug}`}
              data-model={p.model}
              data-color={p.color}
            >
              <img
                style={{ height: 220, width: "100%", objectFit: "contain" }}
                src={p.imagePath}
                alt={t(lang, "bottleAlt", {
                  model: p.model,
                  color: colorName(lang, p.color),
                  size: p.sizeMl,
                })}
                data-testid={`product-image-${p.slug}`}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div data-slot="bottle-spin" data-slug={p.slug}><BottleSpin model={p.model} color={p.color} lang={lang} /></div>
              <h2 data-testid={`product-name-${p.slug}`}>
                {p.model} · {colorName(lang, p.color)}
              </h2>
              <p data-testid={`product-size-${p.slug}`}>
                {p.code} · {p.sizeMl} ml
              </p>
              <strong
                data-testid={`product-price-${p.slug}`}
                data-value={p.unitPrice}
              >
                {fmtMoney(p.unitPrice)} {t(lang, "perBottle")}
              </strong>
              <p data-testid={`product-min-${p.slug}`}>
                {t(lang, "minimum", { n: fmtInt(p.minQty) })}
              </p>
              <Link
                className="btn"
                data-testid={`product-order-${p.slug}`}
                href={`/order?model=${p.model}&color=${p.color}`}
              >
                {t(lang, "orderThis")}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
