"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/money";
import { Errors, type UiError } from "../../_components/common";
export default function Reschedule({
  no,
  current,
  earliest,
  lang,
}: {
  no: string;
  current: string;
  earliest: string;
  lang: Lang;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(current),
    [errors, setErrors] = useState<UiError[]>([]),
    [done, setDone] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${no}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pickupDate: date }),
      });
      const b = await r.json();
      if (!r.ok) {
        setErrors(b.errors);
        return;
      }
      setDone(date);
      setErrors([]);
      setOpen(false);
      router.refresh();
    } catch {
      setErrors([{ code: "SERVER_ERROR" }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        data-testid="reschedule-button"
        onClick={() => setOpen(!open)}
      >
        {t(lang, "reschedule")}
      </button>
      {open && (
        <fieldset data-testid="reschedule-dialog">
          <legend>{t(lang, "reschedule")}</legend>
          <label htmlFor="reschedule-date">{t(lang, "pickupDate")}</label>
          <input
            id="reschedule-date"
            type="date"
            min={earliest}
            data-testid="reschedule-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            data-testid="reschedule-confirm"
            disabled={busy}
            onClick={submit}
          >
            {t(lang, "rescheduleConfirm")}
          </button>
          <Errors errors={errors} lang={lang} id="reschedule-error" />
        </fieldset>
      )}
      {done && (
        <p data-testid="reschedule-done">
          {t(lang, "rescheduleDone", { code: no, date: fmtDate(done, lang) })}
        </p>
      )}
    </>
  );
}
