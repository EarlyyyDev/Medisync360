"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ensureCsrfToken } from "@/lib/auth";

interface Batch {
  id: string;
  status: string;
  fileName: string;
  totalRows: string;
  acceptedRows: string;
  rejectedRows: string;
}

interface BatchPagination {
  page: number;
  pageSize: number;
  total: number;
}

interface PreviewRow {
  rowNumber: string;
  status: string;
  sourceRecordId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  details: Record<string, string>;
}

interface BatchPreview extends Batch {
  createdAt: string;
  sourceSystemName: string;
  sourceType: string;
  rows: PreviewRow[];
}

function isSuccessfulStatus(status: string) {
  return ["ready", "accepted", "completed"].includes(status);
}

export default function IntegrationsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [pagination, setPagination] = useState<BatchPagination>({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [sourceCode, setSourceCode] = useState("SIM_EMR");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loadingPreviewId, setLoadingPreviewId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmBatch, setConfirmBatch] = useState<Batch | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const templateName =
    sourceCode === "SIM_PATIENT" ? "patient" :
    sourceCode === "SIM_EMR" ? "emr" :
    sourceCode === "SIM_LIS" ? "lis" :
    sourceCode === "SIM_BILLING" ? "billing" : "insurance";

  const loadBatches = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/integrations/batches?page=${page}&pageSize=${pagination.pageSize}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Unable to load integration batches.");
      }
      const body = (await response.json()) as {
        data?: { items?: Batch[]; pagination?: BatchPagination };
      };
      if (!body.data || !Array.isArray(body.data.items) || !body.data.pagination) {
        throw new Error("Import history response was incomplete.");
      }
      setBatches(body.data.items);
      setPagination(body.data.pagination);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiUrl, pagination.pageSize]);

  useEffect(() => {
    void (async () => {
      try {
        await loadBatches(1);
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : "Unable to load imports.");
      }
    })();
  }, [loadBatches]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV file.");
      return;
    }
    setProcessing(true);
    setError("");
    setMessage("");
    try {
      const csrfToken = await ensureCsrfToken(apiUrl);
      if (!csrfToken) throw new Error("Your secure session expired. Sign in again.");
      const form = new FormData();
      form.set("file", file);
      form.set("sourceCode", sourceCode);
      const response = await fetch(`${apiUrl}/api/v1/integrations/batches`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
        body: form,
      });
      const body = (await response.json()) as {
        data?: { batchId: string; acceptedRows: number; rejectedRows: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Upload failed.");
      setMessage(
        `Batch ${body.data?.batchId} validated: ${body.data?.acceptedRows ?? 0} accepted, ${body.data?.rejectedRows ?? 0} rejected.`,
      );
      await loadBatches(1);
      if (body.data?.batchId) await review(body.data.batchId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function review(batchId: string) {
    setLoadingPreviewId(batchId);
    setError("");
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/integrations/batches/${batchId}/preview`,
        { credentials: "include" },
      );
      const body = (await response.json()) as {
        data?: {
          batch: Omit<BatchPreview, "rows">;
          rows: PreviewRow[];
        };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to load batch preview.");
      if (body.data) setPreview({ ...body.data.batch, rows: body.data.rows });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load batch preview.");
    } finally {
      setLoadingPreviewId("");
    }
  }

  async function confirm(batchId: string) {
    setProcessing(true);
    setError("");
    setMessage("");
    try {
      const csrfToken = await ensureCsrfToken(apiUrl);
      if (!csrfToken) throw new Error("Your secure session expired. Sign in again.");
      const response = await fetch(
        `${apiUrl}/api/v1/integrations/batches/${batchId}/confirm`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "x-csrf-token": csrfToken,
          },
        },
      );
      const body = (await response.json()) as {
        data?: { accepted: number; rejected: number; status: string };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Confirmation failed.");
      setMessage(
        `Processing ${body.data?.status}: ${body.data?.accepted ?? 0} accepted, ${body.data?.rejected ?? 0} rejected.`,
      );
      setConfirmBatch(null);
      setPreview(null);
      await loadBatches(pagination.page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Confirmation failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function goToHistoryPage(page: number) {
    setError("");
    try {
      await loadBatches(page);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to load import history.");
    }
  }

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(pagination.total / pagination.pageSize),
  );
  const firstHistoryItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastHistoryItem = Math.min(
    pagination.page * pagination.pageSize,
    pagination.total,
  );

  return (
    <main className="shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Demo ETL</p>
          <h1>Data integration center</h1>
          <p className="purpose">Upload, validate, review, and confirm synthetic CSV imports.</p>
        </div>
        <span className="environment">Demo / Simulated</span>
      </section>

      <form className="login-panel integration-form" onSubmit={upload}>
        <label htmlFor="source">Source system</label>
        <select id="source" value={sourceCode} onChange={(event) => setSourceCode(event.target.value)}>
          <option value="SIM_PATIENT">Patient Registry</option>
          <option value="SIM_EMR">Simulated EMR</option>
          <option value="SIM_LIS">Simulated LIS</option>
          <option value="SIM_BILLING">Simulated Billing</option>
          <option value="SIM_INSURANCE">Simulated Insurance</option>
        </select>
        <label htmlFor="csv-file">CSV file</label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={processing}>Validate CSV</button>
      </form>

      <aside className="integration-guide" aria-label="Patient import workflow">
        <div>
          <strong>Recommended workflow</strong>
          <p>
            1. Import Patient Registry first to create or match the patient.
            2. The patient file links EMR, LIS, billing, and insurance source IDs to that patient.
            3. Then import each domain CSV. Domain rows with unmapped IDs will be rejected and sent to Data Quality.
          </p>
        </div>
        <a
          href={`${apiUrl}/api/v1/integrations/templates/${templateName}.csv`}
          download
        >
          Download {templateName === "patient" ? "patient" : templateName.toUpperCase()} template
        </a>
      </aside>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}

      <section className="table-wrap" aria-labelledby="batches-title">
        <h2 id="batches-title" className="table-title">Import history</h2>
        {historyLoading && batches.length === 0 ? (
          <p className="table-state" role="status">Loading import history...</p>
        ) : batches.length === 0 ? (
          <p className="table-state">No import batches found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>{batch.fileName}</td>
                  <td>{batch.status}</td>
                  <td>
                    {batch.totalRows} total / {batch.acceptedRows}{" "}
                    {batch.status === "ready" ? "ready" : "accepted"} / {batch.rejectedRows} rejected
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={processing || loadingPreviewId === batch.id}
                      onClick={() => review(batch.id)}
                    >
                      {loadingPreviewId === batch.id ? "Loading..." : "Review"}
                    </button>
                    {batch.status === "ready" && preview?.id === batch.id ? (
                      <button type="button" disabled={processing} onClick={() => setConfirmBatch(batch)}>
                        Confirm import
                      </button>
                    ) : null}
                    {Number(batch.rejectedRows) > 0 ? (
                      <a href={`${apiUrl}/api/v1/integrations/batches/${batch.id}/errors.csv`} target="_blank" rel="noreferrer">
                        Download errors
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pagination.total > 0 ? (
          <nav className="history-pagination" aria-label="Import history pages">
            <p>
              Showing {firstHistoryItem}–{lastHistoryItem} of {pagination.total} import batches
              {historyLoading ? " · Updating..." : ""}
            </p>
            <div className="history-pagination-controls">
              <button
                type="button"
                disabled={historyLoading || pagination.page <= 1}
                onClick={() => void goToHistoryPage(pagination.page - 1)}
              >
                Previous
              </button>
              <span aria-live="polite">
                Page {pagination.page} of {totalHistoryPages}
              </span>
              <button
                type="button"
                disabled={historyLoading || pagination.page >= totalHistoryPages}
                onClick={() => void goToHistoryPage(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        ) : null}
      </section>

      {preview ? (
        <section className="import-preview" aria-labelledby="preview-title">
          <div className="preview-heading">
            <div>
              <p className="eyebrow">Validation preview</p>
              <h2 id="preview-title">Review import details</h2>
              <p className="purpose">
                {preview.fileName} · {preview.sourceSystemName} · {preview.sourceType} ·
                {" "}Uploaded {new Date(preview.createdAt).toLocaleString()}
              </p>
            </div>
            <span className={`preview-status ${isSuccessfulStatus(preview.status) ? "is-ready" : ""}`}>
              {preview.status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="preview-summary">
            <div><span>Total rows</span><strong>{preview.totalRows}</strong></div>
            <div>
              <span>{preview.status === "ready" ? "Ready to import" : "Accepted"}</span>
              <strong>{preview.acceptedRows}</strong>
            </div>
            <div><span>Rejected</span><strong>{preview.rejectedRows}</strong></div>
          </div>
          <div className="preview-rows">
            {preview.rows.map((row) => (
              <article className="preview-row" key={`${preview.id}-${row.rowNumber}`}>
                <div className="preview-row-heading">
                  <h3>Row {row.rowNumber}</h3>
                  <span className={`preview-status ${isSuccessfulStatus(row.status) ? "is-ready" : ""}`}>
                    {row.status.replaceAll("_", " ")}
                  </span>
                </div>
                {row.errorMessage ? (
                  <p className="preview-error">
                    {row.errorCode ? `${row.errorCode}: ` : ""}{row.errorMessage}
                  </p>
                ) : null}

                <dl className="preview-fields">
                  {Object.entries(row.details).map(([field, value]) => (
                    <div key={field}>
                      <dt>{field.replaceAll("_", " ")}</dt>
                      <dd>{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          {preview.rows.length < Number(preview.totalRows) ? (
            <p className="preview-limit">Showing the first 100 rows.</p>
          ) : null}
        </section>
      ) : null}

      {confirmBatch ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmBatch(null);
        }}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <p className="eyebrow">Final confirmation</p>
            <h2 id="confirm-title">Process import batch?</h2>
            <p>
              Confirming <strong>{confirmBatch.fileName}</strong> will add {confirmBatch.acceptedRows} validated
              {" "}row(s) to the synthetic source records.
            </p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" disabled={processing} onClick={() => setConfirmBatch(null)}>
                Cancel
              </button>
              <button type="button" disabled={processing} onClick={() => void confirm(confirmBatch.id)}>
                {processing ? "Processing..." : "Confirm import"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
