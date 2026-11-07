const COOKIE_NAME = "blg_buyer_ref";
const ATTRIBUTION_DAYS = 30;

export function rememberBuyerReferral(code: string): void {
  const cleaned = code.trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(cleaned)) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(cleaned)}; Max-Age=${ATTRIBUTION_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
}

export function getBuyerReferral(): string | null {
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  try {
    const code = decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)).toUpperCase();
    return /^[A-F0-9]{12}$/.test(code) ? code : null;
  } catch (error) {
    console.error("[referral] impossible de lire le code de parrainage:", error);
    return null;
  }
}
