"use client";

import { useEffect, useState } from "react";
import { ensureCsrfToken } from "@/lib/auth";

interface Issue {
  id: string;
  issueType: string;
  severity: string;
  status: string;
  createdAt: string;
}

export default function QualityPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void fetch(`${apiUrl}/api/v1/quality/issues`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: Issue[]; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to load issues.");
        setIssues(body.data ?? []);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to load issues.");
      });
  }, []);

  async function resolveIssue(issueId: string, decision: "resolve" | "dismiss") {
    setProcessingId(issueId);
    setError("");
    setMessage("");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    try {
      const csrfToken = await ensureCsrfToken(apiUrl);
      if (!csrfToken) throw new Error("Your secure session expired. Sign in again.");
      const response = await fetch(`${apiUrl}/api/v1/quality/issues/${issueId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          decision,
          reason: decision === "resolve"
            ? "Issue reviewed and resolved by authorized demo staff."
            : "Issue reviewed and dismissed because no action is required.",
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to update data quality issue.");
      setIssues((current) => current.filter((issue) => issue.id !== issueId));
      setMessage(`Issue ${decision === "resolve" ? "resolved" : "dismissed"} successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update data quality issue.");
    } finally {
      setProcessingId("");
    }
  }

  return (
    <main className="shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Data quality</p>
          <h1>Reconciliation review</h1>
          <p className="purpose">Review synthetic duplicate, conflict, and mapping issues.</p>
        </div>
      </section>
      {message ? <p className="success-message" role="status">{message}</p> : null}
      {error ? <p className="table-state error-state" role="alert">{error}</p> : issues.length === 0 ? (
        <p className="table-state">No open data quality issues.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Issue</th><th>Severity</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>{issue.issueType}</td>
                  <td>{issue.severity}</td>
                  <td>{issue.status}</td>
                  <td>{new Date(issue.createdAt).toLocaleString()}</td>
                  <td>
                    {issue.status === "open" ? (
                      <>
                        <button type="button" disabled={processingId === issue.id} onClick={() => void resolveIssue(issue.id, "resolve")}>Resolve</button>
                        <button type="button" className="secondary-button" disabled={processingId === issue.id} onClick={() => void resolveIssue(issue.id, "dismiss")}>Dismiss</button>
                      </>
                    ) : "Reviewed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
