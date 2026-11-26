"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void fetch(`${apiUrl}/api/v1/dashboard/summary`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: { counts?: Record<string, number> }; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to load dashboard.");
        setCounts(body.data?.counts ?? {});
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load dashboard."));
  }, []);

  const cards = [
    ["Active patients", counts.patients, "Patient registry"],
    ["EMR encounters", counts.emrEncounters, "Clinical source"],
    ["Laboratory orders", counts.labOrders, "LIS source"],
    ["Invoices", counts.invoices, "Billing source"],
    ["Coverage records", counts.insurancePolicies, "Insurance source"],
    ["Import batches", counts.importBatches, "Integration history"],
  ];

  return (
    <main className="shell">
      <section className="page-heading">
        <div><p className="eyebrow">Operations overview</p><h1>Clinical operations dashboard</h1><p className="purpose">Database-derived synthetic integration summary.</p></div>
        <span className="environment">Demo environment</span>
      </section>
      {error ? <p className="table-state error-state" role="alert">{error}</p> : (
        <section className="patient-domains" aria-label="Dashboard metrics">
          {cards.map(([label, value, detail]) => (
            <article className="status-card" key={String(label)}>
              <p className="status-label">{label}</p>
              <p className="status-value">{value ?? 0}</p>
              <p className="status-detail">{detail}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
