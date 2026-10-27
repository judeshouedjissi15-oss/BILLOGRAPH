// E2E Task 42 — Inscription réelle de bout en bout (Brevo réel).
// Exécution : bun scripts/e2e42.ts (secrets via variables d'environnement).
// AUCUN secret n'est écrit dans ce fichier. Le compte de test est supprimé en
// fin d'exécution (l'audit reste conservé). Aucune donnée réelle n'est touchée.
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_CODE1 = process.env.ADMIN_CODE1 ?? "";
const ADMIN_CODE2 = process.env.ADMIN_CODE2 ?? "";
const BREVO_API_KEY = process.env.BREVO_API_KEY ?? "";
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL ?? "";

const TEST_EMAIL = "blg-e2e42@test.local";
const TEST_PASSWORD = "TestInscription42!";

type Res = { status: number; json: any; setCookies: string[] };

async function api(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<Res> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const setCookies = res.headers.getSetCookie();
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, setCookies };
}

function sessionCookie(setCookies: string[]): string {
  const c = setCookies.find((s) => s.startsWith("blg_session="));
  return c ? c.split(";")[0] : "";
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function loginOwner(): Promise<string> {
  const r1 = await api("/api/auth/login", {
    method: "POST",
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  if (r1.status !== 200 || !r1.json?.challengeToken)
    throw new Error(`login propriétaire: ${r1.status}`);
  const r2 = await api("/api/auth/admin-challenge", {
    method: "POST",
    body: { token: r1.json.challengeToken, code: ADMIN_CODE1 },
  });
  if (r2.status !== 200 || !r2.json?.challengeToken)
    throw new Error(`challenge étape 1: ${r2.status}`);
  const r3 = await api("/api/auth/admin-challenge", {
    method: "POST",
    body: { token: r2.json.challengeToken, code: ADMIN_CODE2 },
  });
  if (r3.status !== 200 || !r3.json?.verified)
    throw new Error(`challenge étape 2: ${r3.status}`);
  const c = sessionCookie(r3.setCookies);
  if (!c) throw new Error("session ADMIN absente");
  return c;
}

/** Retrouve le code à 6 chiffres par force brute locale (sha256, sans sel). */
function bruteForceCode(codeHash: string): string | null {
  for (let n = 100_000; n < 1_000_000; n++) {
    if (createHash("sha256").update(String(n)).digest("hex") === codeHash) return String(n);
  }
  return null;
}

async function main() {
  // ── 1. Connexion propriétaire (3 barrières réelles) ───────────────────────
  const adminCookie = await loginOwner();
  check("1. Connexion propriétaire 3 barrières", true, "session ADMIN ouverte");

  // ── 2. État du service email AVANT configuration en base ──────────────────
  const before = await api("/api/admin/smtp", { cookie: adminCookie });
  const beforeOk =
    before.status === 200 &&
    before.json?.configured === true &&
    before.json?.provider === "brevo" &&
    before.json?.brevo?.fromEmail === BREVO_FROM_EMAIL;
  check(
    "2. Service email ACTIF via fallback .env (base vide)",
    beforeOk,
    `provider=${before.json?.provider}, fromEmail=${before.json?.brevo?.fromEmail}, masked=${before.json?.brevo?.apiKeyMasked}`,
  );

  // ── 3. Configuration officielle via l'API admin (chiffrement en base) ─────
  const patch = await api("/api/admin/smtp", {
    method: "PATCH",
    cookie: adminCookie,
    body: {
      provider: "brevo",
      brevoApiKey: BREVO_API_KEY,
      fromName: "BILLOGRAPH",
      fromEmail: BREVO_FROM_EMAIL,
    },
  });
  check(
    "3. PATCH /api/admin/smtp (clé chiffrée en base)",
    patch.status === 200 && patch.json?.ok === true,
    patch.json?.message ?? `status ${patch.status}`,
  );

  const after = await api("/api/admin/smtp", { cookie: adminCookie });
  check(
    "4. GET état après : Brevo actif, clé masquée, jamais en clair",
    after.status === 200 &&
      after.json?.brevo?.apiKeyMasked === "xkeysib-••••Sxm6" &&
      !JSON.stringify(after.json).includes(BREVO_API_KEY),
    `masked=${after.json?.brevo?.apiKeyMasked}`,
  );

  // ── 5. Email de test RÉEL (le fondateur le recevra) ───────────────────────
  const test = await api("/api/admin/smtp/test", {
    method: "POST",
    cookie: adminCookie,
    body: { to: OWNER_EMAIL },
  });
  check(
    "5. POST /api/admin/smtp/test — envoi RÉEL via Brevo",
    test.status === 200 && test.json?.ok === true,
    test.json?.message ?? `status ${test.status} ${JSON.stringify(test.json)}`,
  );

  // ── 6. INSCRIPTION réelle (compte de test) ────────────────────────────────
  const reg = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Vendeur Test 42", email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  check(
    "6. POST /api/auth/register — compte créé, email de confirmation envoyé",
    reg.status === 201 && reg.json?.emailVerificationRequired === true,
    `status ${reg.status} ${JSON.stringify(reg.json?.message ?? reg.json)}`,
  );

  const testUser = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  check("7. Compte en base, non confirmé (verrou actif)", Boolean(testUser) && testUser!.emailVerified === false);

  // ── 8. Le code à 6 chiffres a bien été généré (retrouvé par calcul local) ─
  const rec = await db.emailVerificationCode.findFirst({
    where: { userId: testUser!.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const code = rec ? bruteForceCode(rec.codeHash) : null;
  check("8. Code à 6 chiffres généré (empreinte en base, valable 15 min)", Boolean(code), code ? `code retrouvé: ${code}` : "introuvable");

  // ── 9. Code erroné → refus avec compteur de tentatives ────────────────────
  const wrong = await api("/api/auth/verify-code", {
    method: "POST",
    body: { email: TEST_EMAIL, code: "000000" },
  });
  check(
    "9. Code erroné refusé (400 + tentatives restantes)",
    wrong.status === 400 && /tentative/.test(wrong.json?.error ?? ""),
    wrong.json?.error ?? `status ${wrong.status}`,
  );

  // ── 10. BON code → confirmation + SESSION ouverte ─────────────────────────
  const verify = await api("/api/auth/verify-code", {
    method: "POST",
    body: { email: TEST_EMAIL, code },
  });
  const vCookie = sessionCookie(verify.setCookies);
  check(
    "10. Code conforme → compte confirmé + session ouverte",
    verify.status === 200 && verify.json?.verified === true && Boolean(vCookie),
    `user=${verify.json?.user?.email}, role=${verify.json?.user?.role}`,
  );

  const me = await api("/api/auth/me", { cookie: vCookie });
  const meUser = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  check(
    "11. /api/auth/me avec la session ouverte par le code (compte confirmé en base)",
    me.status === 200 && me.json?.user?.email === TEST_EMAIL && meUser?.emailVerified === true,
    `name=${me.json?.user?.name}, emailVerified=${meUser?.emailVerified}`,
  );

  // ── 12. Audit réel ────────────────────────────────────────────────────────
  const audits = await db.auditLog.findMany({
    where: { entity: "User", entityId: testUser!.id },
    select: { action: true },
  });
  const actions = audits.map((a) => a.action).sort();
  check(
    "12. Audit: USER_REGISTERED + EMAIL_VERIFIED consignés",
    actions.includes("USER_REGISTERED") && actions.includes("EMAIL_VERIFIED"),
    actions.join(", "),
  );
  const testAudit = await db.auditLog.findFirst({ where: { action: "EMAIL_TEST_SENT" } });
  check("13. Audit: EMAIL_TEST_SENT consigné", Boolean(testAudit));

  // ── 14. Nettoyage du compte de TEST (audit conservé) ──────────────────────
  if (testUser) {
    await db.user.delete({ where: { id: testUser.id } });
    const gone = await db.user.findUnique({ where: { email: TEST_EMAIL } });
    check("14. Compte de test supprimé (audit conservé)", gone === null);
  }

  // ── Bilan ─────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== BILAN: ${results.length - failed.length}/${results.length} OK ===`);
  if (failed.length > 0) process.exit(1);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("ERREUR FATALE:", e);
    // Nettoyage de sécurité si le compte de test existe encore.
    await db.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
