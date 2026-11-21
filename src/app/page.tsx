import { Suspense } from "react";
import Link from "next/link";

async function getApiStatus() {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/api/v1/health/live`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return { status: "unavailable", detail: "The API returned an error." };
    }

    const body = (await response.json()) as {
      data?: { status?: string };
    };
    return {
      status: body.data?.status === "live" ? "live" : "unavailable",
      detail: "Express API is reachable.",
    };
  } catch {
    return {
      status: "unavailable",
      detail: "The Express API is not currently reachable.",
    };
  }
}

async function ApiStatusCard() {
  const api = await getApiStatus();

  return (
    <article className="status-card">
      <p className="status-label">Express API</p>
      <p className="status-value">
        <span
          className={`status-dot ${api.status === "live" ? "live" : "off"}`}
          aria-hidden="true"
        />
        {api.status === "live" ? "Connected" : "Unavailable"}
      </p>
      <p className="status-detail">{api.detail}</p>
    </article>
  );
}

export default function Home() {
  return (
    <main className="shell">
      <section className="foundation" aria-labelledby="foundation-title">
        <div>
          <p className="eyebrow">MediSync 360</p>
          <h1 id="foundation-title">Clinical operations overview</h1>
          <p className="purpose">
            Synthetic healthcare data integration and consolidated patient records.
          </p>
        </div>
        <span className="environment">Demo environment</span>
      </section>

      <section className="status-grid" aria-label="Foundation status">
        <Suspense
          fallback={
            <article className="status-card" aria-busy="true">
              <p className="status-label">Express API</p>
              <p className="status-value">Checking connection</p>
              <p className="status-detail">Waiting for the API health response.</p>
            </article>
          }
        >
          <ApiStatusCard />
        </Suspense>
        <article className="status-card">
          <p className="status-label">Data sources</p>
          <p className="status-value">Not initialized</p>
          <p className="status-detail">EMR, LIS, billing, and insurance remain simulated.</p>
        </article>
      </section>
      <nav className="primary-nav" aria-label="Primary">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/patients">Open patient registry</Link>
        <Link href="/integrations">Data integration center</Link>
        <Link href="/quality">Data quality</Link>
        <Link href="/audit">Audit and reports</Link>
        <Link href="/login">Staff sign in</Link>
      </nav>
    </main>
  );
}

