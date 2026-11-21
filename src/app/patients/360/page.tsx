"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Patient360EntryPage() {
  const router = useRouter();

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    void fetch(`${apiUrl}/api/v1/patients?page=1&pageSize=1`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to open Patient 360.");
        const body = (await response.json()) as {
          data?: { items?: Array<{ id: string }> };
        };
        const patient = body.data?.items?.[0];
        router.replace(patient ? `/patients/${patient.id}` : "/patients");
      })
      .catch(() => router.replace("/patients"));
  }, [router]);

  return (
    <main className="auth-loading" role="status">
      Opening Patient 360...
    </main>
  );
}
