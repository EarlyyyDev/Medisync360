"use client";

import { useEffect, useState } from "react";

interface AuditEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  outcome: string;
  createdAt: string;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void fetch(`${apiUrl}/api/v1/audit`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: AuditEvent[]; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to load audit events.");
        setEvents(body.data ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load audit events."));
  }, []);

  return (
    <main className="shell">
      <section className="page-heading">
        <div><p className="eyebrow">Audit</p><h1>Audit and reports</h1><p className="purpose">Authorized security and integration activity.</p></div>
      </section>
      {error ? <p className="table-state error-state" role="alert">{error}</p> : events.length === 0 ? (
        <p className="table-state">No audit events found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Action</th><th>Resource</th><th>Outcome</th><th>Time</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}><td>{event.action}</td><td>{event.resourceType}</td><td>{event.outcome}</td><td>{event.createdAt}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
