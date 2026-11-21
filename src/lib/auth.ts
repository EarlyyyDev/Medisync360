let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
  if (typeof window !== "undefined") {
    if (token) window.sessionStorage.setItem("medisync_csrf", token);
    else window.sessionStorage.removeItem("medisync_csrf");
  }
}

export function getCsrfToken() {
  if (!csrfToken && typeof window !== "undefined") {
    csrfToken = window.sessionStorage.getItem("medisync_csrf");
  }
  return csrfToken;
}

export async function ensureCsrfToken(apiUrl: string) {
  const existing = getCsrfToken();
  if (existing) return existing;

  const response = await fetch(`${apiUrl}/api/v1/auth/csrf`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    data?: { csrfToken?: string };
  };
  const token = body.data?.csrfToken ?? null;
  setCsrfToken(token);
  return token;
}
