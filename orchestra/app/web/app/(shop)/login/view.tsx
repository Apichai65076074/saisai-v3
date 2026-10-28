"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
export default function Login({ lang }: { lang: Lang }) {
  const router = useRouter(),
    params = useSearchParams();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(f)),
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b.errors?.[0]?.message);
        return;
      }
      const next = params.get("next");
      router.push(
        next?.startsWith("/") && !next.startsWith("//") ? next : b.redirect,
      );
      router.refresh();
    } catch {
      setError(
        lang === "th" ? "เกิดข้อผิดพลาด กรุณาลองใหม่" : "Please try again",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
      <h1>{t(lang, "loginTitle")}</h1>
      <p>{t(lang, "loginHint")}</p>
      <form data-testid="login-form" onSubmit={submit}>
        <label htmlFor="email">{t(lang, "email")}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          data-testid="login-email"
          required
        />
        <label htmlFor="password">{t(lang, "password")}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          data-testid="login-password"
          required
        />
        {error && (
          <p role="alert" className="error" data-testid="login-error">
            {error}
          </p>
        )}
        <p>
          <button
            className="btn-primary"
            data-testid="login-submit"
            disabled={busy}
          >
            {t(lang, "login")}
          </button>
        </p>
      </form>
    </div>
  );
}
