"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { setCsrfToken } from "@/lib/auth";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const notice = searchParams.get("passwordChanged") === "1"
    ? "Password updated. Sign in with your new password."
    : "";

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void fetch(`${apiUrl}/api/v1/auth/me`, {
      credentials: "include",
      cache: "no-store",
    }).then((response) => {
      if (response.ok) router.replace("/dashboard");
    }).catch(() => undefined);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryAfter > 0) {
      setError(`Too many sign-in attempts. Try again in ${retryAfter} seconds.`);
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1/auth/login`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
      );
      const body = (await response.json()) as {
        data?: { csrfToken?: string };
        error?: { message?: string };
      };

      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Number(response.headers.get("retry-after") ?? 60);
          setRetryAfter(Number.isFinite(seconds) ? seconds : 60);
          setError(`Too many sign-in attempts. Please wait ${seconds} seconds.`);
          window.setTimeout(() => setRetryAfter(0), (Number.isFinite(seconds) ? seconds : 60) * 1000);
        } else {
        setError(body.error?.message ?? "Unable to sign in.");
        }
        return;
      }

      setCsrfToken(body.data?.csrfToken ?? null);
      router.replace("/dashboard");
    } catch {
      setError("Unable to reach the authentication service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <aside className="login-brand">
        <div className="login-logo"><div className="brand-mark" aria-hidden="true"><span>+</span></div><strong>MediSync 360</strong></div>
        <div className="login-copy">
          <h2>Healthcare intelligence, unified.</h2>
          <p>Bring synthetic clinical, laboratory, billing, and insurance records into one auditable operational workspace.</p>
        </div>
        <div className="login-benefits"><span>Role-based access</span><span>Source provenance</span><span>Audit trail</span></div>
      </aside>
      <section className="login-main">
        <div className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">Authorized staff</p>
          <h1 id="login-title">Sign in to MediSync</h1>
          <p className="purpose">Synthetic healthcare operations environment</p>
          {notice ? <p className="success-message" role="status">{notice}</p> : null}
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button type="submit" disabled={submitting || retryAfter > 0}>
              {submitting ? "Signing in..." : retryAfter > 0 ? `Try again in ${retryAfter}s` : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-loading" role="status">Loading sign in...</main>}>
      <LoginPageContent />
    </Suspense>
  );
}
