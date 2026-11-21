"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Patient {
  id: string;
  internalCode: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  active: boolean;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${apiUrl}/api/v1/patients?page=1&pageSize=20`, {
      credentials: "include",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: { items?: Patient[] };
          error?: { code?: string; message?: string };
        };
        if (!response.ok) {
          throw new Error(
            body.error?.code === "AUTHENTICATION_REQUIRED"
              ? "Sign in with an authorized synthetic staff account."
              : body.error?.message ?? "Unable to load the patient registry.",
          );
        }
        setPatients(body.data?.items ?? []);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to load patients.");
      })
      .finally(() => setLoading(false));
  }, []);

  const visiblePatients = patients.filter((patient) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${patient.internalCode} ${patient.firstName} ${patient.lastName}`.toLowerCase().includes(term);
  });

  return (
    <main className="shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Synthetic records</p>
          <h1>Patient registry</h1>
          <p className="purpose">Internal synthetic patient identifiers and source-ready profiles.</p>
        </div>
        <div className="registry-actions">
          <label className="search-field" htmlFor="patient-search">
            <span>Search patients</span>
            <input id="patient-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or internal ID" />
          </label>
        </div>
      </section>

      {loading ? (
        <p className="table-state" role="status">Loading patients...</p>
      ) : error ? (
        <div className="table-state error-state" role="alert">
          <p>{error}</p>
          <a href="/login">Go to staff sign in</a>
        </div>
      ) : visiblePatients.length === 0 ? (
        <p className="table-state">No patients found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Internal ID</th>
                <th>Patient</th>
                <th>Date of birth</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visiblePatients.map((patient) => (
                <tr key={patient.id}>
                  <td><Link href={`/patients/${patient.id}`}>{patient.internalCode}</Link></td>
                  <td>{patient.firstName} {patient.lastName}</td>
                  <td>{patient.dateOfBirth}</td>
                  <td>{patient.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
