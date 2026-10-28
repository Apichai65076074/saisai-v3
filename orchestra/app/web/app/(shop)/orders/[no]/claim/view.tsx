"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { t, type Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/money";
import { Errors, type UiError } from "../../../_components/common";
export default function ClaimForm({
  no,
  remaining,
  ordered,
  lastDay,
  lang,
}: {
  no: string;
  remaining: number;
  ordered: number;
  lastDay: string;
  lang: Lang;
}) {
  const [photos, setPhotos] = useState<File[]>([]),
    [errors, setErrors] = useState<UiError[]>([]),
    [claimNo, setNo] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const body = new FormData(e.currentTarget);
    body.set("orderNo", no);
    body.delete("photos");
    photos.forEach((p) => body.append("photos", p));
    try {
      const r = await fetch("/api/claims", { method: "POST", body });
      const b = await r.json();
      if (!r.ok) {
        setErrors(b.errors);
        return;
      }
      setNo(b.claimNo);
    } catch {
      setErrors([{ code: "SERVER_ERROR" }]);
    } finally {
      setBusy(false);
    }
  }
  if (claimNo)
    return (
      <div data-testid="claim-success">
        {t(lang, "claimPlaced")}{" "}
        <strong data-testid="claim-no">{claimNo}</strong>
        <p>
          <Link data-testid="view-claim-link" href={`/claims/${claimNo}`}>
            {t(lang, "viewClaim")}
          </Link>
        </p>
      </div>
    );
  return (
    <form className="card" data-testid="claim-form" onSubmit={submit}>
      <p data-testid="claim-until" data-value={lastDay}>
        {fmtDate(lastDay, lang)}
      </p>
      <p data-testid="claim-remaining" data-value={remaining}>
        {t(lang, "claimRemaining", { n: remaining, ordered })}
      </p>
      <label htmlFor="lot">{t(lang, "lotNo")}</label>
      <input
        id="lot"
        name="lotNo"
        data-testid="lot-input"
        placeholder="LOT-000000"
      />
      <Errors
        lang={lang}
        errors={errors.filter((e) => e.field === "lotNo")}
        id="error-lot"
      />
      <label htmlFor="claim-quantity">{t(lang, "quantity")}</label>
      <input
        id="claim-quantity"
        name="quantity"
        inputMode="numeric"
        defaultValue="1"
        data-testid="claim-quantity-input"
      />
      <Errors
        lang={lang}
        errors={errors.filter((e) => e.field === "quantity")}
        id="error-claim-quantity"
      />
      <label htmlFor="description">{t(lang, "description")}</label>
      <textarea
        id="description"
        name="description"
        data-testid="claim-description-input"
      />
      <label htmlFor="photos">{t(lang, "photos")}</label>
      <input
        id="photos"
        type="file"
        multiple
        accept="image/jpeg,image/png"
        data-testid="photo-input"
        onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
      />
      <p data-testid="photo-hint">{t(lang, "photos")}</p>
      <ul data-testid="photo-list" data-count={photos.length}>
        {photos.map((p, i) => (
          <li key={i} data-testid={`photo-item-${i + 1}`}>
            <span data-user-content="true">{p.name}</span>{" "}
            <button
              type="button"
              data-testid={`photo-remove-${i + 1}`}
              onClick={() => setPhotos(photos.filter((_, j) => i !== j))}
            >
              {t(lang, "removeItem")}
            </button>
          </li>
        ))}
      </ul>
      <Errors
        lang={lang}
        errors={errors.filter((e) => e.field === "photos")}
        id="error-photos"
      />
      <Errors
        lang={lang}
        errors={errors.filter((e) => !e.field)}
        id="error-claim"
      />
      <button
        className="btn-primary"
        data-testid="submit-claim"
        disabled={busy}
      >
        {t(lang, "submitClaim")}
      </button>
    </form>
  );
}
