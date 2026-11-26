"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface SourceRecord {
  id: string;
  sourceRecordId: string;
  encounterType?: string;
  encounterAt?: string;
  status?: string;
  testCode?: string;
  testName?: string;
  specimenCollectedAt?: string | null;
  sourceStatus?: string;
  invoiceNumber?: string;
  currency?: string;
  totalAmount?: string;
  paidAmount?: string;
  balanceAmount?: string;
  issuedAt?: string;
  payerName?: string;
  memberReference?: string;
  coverageStatus?: string;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  importedAt?: string;
}

interface Patient360Data {
  patient: {
    firstName: string;
    lastName: string;
    internalCode: string;
    dateOfBirth: string;
    sex?: string;
  };
  domains: {
    emr: SourceRecord[];
    lis: SourceRecord[];
    billing: SourceRecord[];
    insurance: SourceRecord[];
  };
}

function Patient360Content() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Patient360Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void fetch(`${apiUrl}/api/v1/patients/${params.id}/360`, {
      credentials: "include",
    })
      .then(async (response) => {
        const body = (await response.json()) as { data?: Patient360Data; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to load Patient 360.");
        setData(body.data ?? null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to load Patient 360.");
      });
  }, [params.id]);

  if (error) {
    return (
      <main className="shell">
        <Link className="back-link" href="/patients">Back to patient registry</Link>
        <p className="table-state error-state" role="alert">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="shell">
        <Link className="back-link" href="/patients">Back to patient registry</Link>
        <p className="table-state" role="status">Loading Patient 360...</p>
      </main>
    );
  }

  const domains = [
    ["EMR", data.domains.emr],
    ["LIS", data.domains.lis],
    ["Billing", data.domains.billing],
    ["Insurance", data.domains.insurance],
  ] as const;

  function recordTitle(name: string, record: SourceRecord) {
    if (name === "EMR") return record.encounterType ?? "Clinical encounter";
    if (name === "LIS") return record.testName ?? record.testCode ?? "Laboratory order";
    if (name === "Billing") return record.invoiceNumber ?? "Synthetic invoice";
    return record.payerName ?? "Synthetic coverage";
  }

  return (
    <main className="shell">
      <Link className="back-link" href="/patients">Back to patient registry</Link>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Synthetic Patient 360</p>
          <h1>{data.patient.firstName} {data.patient.lastName}</h1>
          <p className="purpose">{data.patient.internalCode} · Source records shown separately</p>
        </div>
        <span className="environment">Demo environment</span>
      </section>
      <section className="patient-summary" aria-label="Synthetic patient summary">
        <div><span>Internal ID</span><strong>{data.patient.internalCode}</strong></div>
        <div><span>Date of birth</span><strong>{data.patient.dateOfBirth}</strong></div>
        <div><span>Sex</span><strong>{data.patient.sex ?? "Not recorded"}</strong></div>
      </section>
      <section className="patient-domains">
        {domains.map(([name, records]) => (
          <article className="patient-domain-card" key={name}>
            <div className="domain-heading">
              <p className="status-label">{name}</p>
              <span className="record-count">{records.length}</span>
            </div>
            {records.length === 0 ? (
              <p className="status-detail">No linked record found.</p>
            ) : (
              records.slice(0, 5).map((record) => (
                <div className="source-record" key={record.id}>
                  <strong>{recordTitle(name, record)}</strong>
                  <span>Source record: {record.sourceRecordId}</span>
                  {name === "EMR" ? (
                    <span>{record.encounterAt ? new Date(record.encounterAt).toLocaleString() : "Date unavailable"} · {record.status ?? "Status unavailable"}</span>
                  ) : null}
                  {name === "LIS" ? (
                    <span>{record.testCode ?? "No test code"} · {record.sourceStatus ?? "Status unavailable"}{record.specimenCollectedAt ? ` · ${new Date(record.specimenCollectedAt).toLocaleString()}` : ""}</span>
                  ) : null}
                  {name === "Billing" ? (
                    <span>{record.currency ?? "PHP"} {record.totalAmount ?? "0.00"} · Paid {record.paidAmount ?? "0.00"} · Balance {record.balanceAmount ?? "0.00"} · {record.status ?? "Status unavailable"}</span>
                  ) : null}
                  {name === "Insurance" ? (
                    <span>{record.memberReference ?? "No member reference"} · {record.coverageStatus ?? "Status unavailable"}{record.coverageStart ? ` · ${record.coverageStart}` : ""}{record.coverageEnd ? ` to ${record.coverageEnd}` : ""}</span>
                  ) : null}
                  <small>Simulated source · Imported {record.importedAt ? new Date(record.importedAt).toLocaleString() : "time unavailable"}</small>
                </div>
              ))
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

export default function Patient360Page() {
  return (
    <Suspense fallback={
      <main className="shell">
        <Link className="back-link" href="/patients">Back to patient registry</Link>
        <p className="table-state" role="status">Loading Patient 360...</p>
      </main>
    }>
      <Patient360Content />
    </Suspense>
  );
}
