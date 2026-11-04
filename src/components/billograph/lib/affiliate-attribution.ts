const ATTRIBUTION_DAYS = 30;

function cookieName(productId: string): string {
  return `blg_aff_${productId}`;
}

export function rememberAffiliateReferral(productId: string, code: string): void {
  const cleanedCode = code.trim();
  if (!cleanedCode || cleanedCode.length > 64) return;

  try {
    window.sessionStorage.setItem(`blg:affiliate:${productId}`, cleanedCode);
  } catch {
    // The attribution cookie remains available if session storage is disabled.
  }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${cookieName(productId)}=${encodeURIComponent(cleanedCode)}; Max-Age=${ATTRIBUTION_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
  } catch (error) {
    console.error("[affiliate] impossible d'enregistrer l'attribution dans le navigateur:", error);
  }

  void fetch("/api/affiliates/click", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, code: cleanedCode }),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      console.error("[affiliate] clic non enregistré:", body?.error ?? response.statusText);
    }
  }).catch((error: unknown) => {
    console.error("[affiliate] échec de l'enregistrement du clic:", error);
  });
}

export function getAffiliateReferral(productId: string): string | null {
  const name = cookieName(productId);
  try {
    const value = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    if (value) return decodeURIComponent(value);
  } catch (error) {
    console.error("[affiliate] impossible de lire l'attribution:", error);
  }

  try {
    return window.sessionStorage.getItem(`blg:affiliate:${productId}`);
  } catch {
    return null;
  }
}
