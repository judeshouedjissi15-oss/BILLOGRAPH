// Configuration de l'URL PUBLIQUE du site (siteUrl) via l'API admin — pour
// que tous les liens des emails (confirmation de compte, etc.) pointent vers
// l'URL réellement joignable par les utilisateurs, en HTTPS.
// Usage : PUBLIC_URL="https://…" bun scripts/set-public-url.ts
// (défaut : URL de prévisualisation publique de la session courante).
import { config } from "dotenv";
config({ path: ".env" });

const BASE = process.env.PUBLIC_URL?.trim() || "https://preview-chat-328233eb-2bb5-4ab1-a640-ade15e3b3068.space-z.ai";
const API = "http://localhost:3000";

async function main() {
  // ── 1. Connexion admin (3 barrières) ──────────────────────────────────────
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "judeshouedjissi2@gmail.com",
      password: (process.env.OWNER_PASSWORD as string),
    }),
  });
  if (!loginRes.ok) throw new Error(`login: HTTP ${loginRes.status} ${await loginRes.text()}`);
  const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

  const step1 = await fetch(`${API}/api/auth/admin-challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: challengeToken, code: "AM-Joyce" }),
  });
  if (!step1.ok) throw new Error(`étape 1: HTTP ${step1.status}`);
  const { challengeToken: token2 } = (await step1.json()) as { challengeToken: string };

  const step2 = await fetch(`${API}/api/auth/admin-challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: token2, code: "GNAGUENON Monique" }),
  });
  if (!step2.ok) throw new Error(`étape 2: HTTP ${step2.status}`);
  const cookie = (step2.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("cookie de session admin absent");

  // ── 2. État actuel ────────────────────────────────────────────────────────
  const before = await fetch(`${API}/api/admin/smtp`, { headers: { cookie } });
  const beforeJson = (await before.json()) as { siteUrl?: string };
  console.log("siteUrl avant :", JSON.stringify(beforeJson.siteUrl));

  // ── 3. PATCH : provider brevo conservé (clé omise = inchangée) + siteUrl ──
  const patchRes = await fetch(`${API}/api/admin/smtp`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      provider: "brevo",
      fromName: "BILLOGRAPH",
      fromEmail: "judeshouedjissi2@gmail.com",
      siteUrl: BASE,
    }),
  });
  if (!patchRes.ok) throw new Error(`PATCH: HTTP ${patchRes.status} ${await patchRes.text()}`);
  console.log("PATCH OK —", ((await patchRes.json()) as { message: string }).message);

  // ── 4. Vérification ───────────────────────────────────────────────────────
  const after = await fetch(`${API}/api/admin/smtp`, { headers: { cookie } });
  const afterJson = (await after.json()) as { siteUrl?: string; brevo?: { configured: boolean; apiKeySet: boolean } };
  console.log("siteUrl après :", JSON.stringify(afterJson.siteUrl));
  console.log("brevo conservé :", JSON.stringify(afterJson.brevo));
  if (afterJson.siteUrl !== BASE) throw new Error("siteUrl non persisté !");
  console.log("\n✅ URL publique configurée :", BASE);
}

main().catch((e) => {
  console.error("ÉCHEC:", e instanceof Error ? e.message : e);
  process.exit(1);
});
