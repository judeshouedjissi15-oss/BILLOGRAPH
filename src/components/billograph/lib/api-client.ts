// Client HTTP centralisé du frontend BILLOGRAPH.
// - fetch avec cookies same-origin (session httpOnly `blg_session`)
// - parse le JSON et lève une Error portant le message de l'API ({ "error": "..." })

export type ApiError = Error & { status?: number; body?: Record<string, unknown> };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null; // corps non JSON — traité comme vide
    }
  }

  if (!res.ok) {
    const body =
      data !== null && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
    const apiMessage =
      body && "error" in body && typeof body.error === "string" ? body.error : null;
    const error: ApiError = new Error(apiMessage ?? "Une erreur est survenue. Réessayez.");
    error.status = res.status;
    error.body = body; // payload complet (ex : emailVerificationRequired)
    throw error;
  }

  return data as T;
}

/** Construit une URL d'API avec query string en ignorant les paramètres vides. */
export function apiUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
