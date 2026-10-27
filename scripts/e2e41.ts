// E2E Task 41 — Tests A→G du prompt du fondateur (offices multi-rôles).
// Exécution : bun scripts/e2e41.ts (secrets via variables d'environnement).
// AUCUN secret n'est écrit dans ce fichier. Les comptes de test sont créés
// puis supprimés en fin d'exécution (l'audit reste conservé).
import { randomBytes, scryptSync } from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_CODE1 = process.env.ADMIN_CODE1 ?? "";
const ADMIN_CODE2 = process.env.ADMIN_CODE2 ?? "";

const VENDOR_EMAIL = "blg-e2e41-vendeur@test.local";
const VENDOR_PASSWORD = "TestVendeur41!";
const ADJ_PASSWORD = "AdjointTest41!";
const adjEmails = [1, 2, 3, 4, 5].map((i) => `blg-e2e41-adj${i}@test.local`);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

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

async function loginVendor(): Promise<string> {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: { email: VENDOR_EMAIL, password: VENDOR_PASSWORD },
  });
  if (r.status !== 200) throw new Error(`login vendeur ${r.status}: ${JSON.stringify(r.json)}`);
  return sessionCookie(r.setCookies);
}

async function loginAdmin(): Promise<string> {
  const r1 = await api("/api/auth/login", {
    method: "POST",
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  if (!r1.json?.challengeRequired) throw new Error(`login owner: ${r1.status}`);
  const r2 = await api("/api/auth/admin-challenge", {
    method: "POST",
    body: { token: r1.json.challengeToken, code: ADMIN_CODE1 },
  });
  if (!r2.json?.challengeToken) throw new Error(`challenge étape 1: ${r2.status}`);
  const r3 = await api("/api/auth/admin-challenge", {
    method: "POST",
    body: { token: r2.json.challengeToken, code: ADMIN_CODE2 },
  });
  if (r3.json?.user?.role !== "ADMIN") throw new Error(`challenge étape 2: ${r3.status}`);
  return sessionCookie(r3.setCookies);
}

async function main() {
  console.log("— Préparation des comptes de test —");
  // Nettoyage d'un éventuel run précédent (idempotence du script lui-même).
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });

  const vendor = await db.user.create({
    data: {
      email: VENDOR_EMAIL,
      passwordHash: hashPassword(VENDOR_PASSWORD),
      name: "Vendeur Test 41",
      role: "VENDEUR",
      status: "ACTIVE",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  for (const email of adjEmails) {
    await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(ADJ_PASSWORD),
        name: `Adjoint Test ${email.match(/adj(\d)/)?.[1]}`,
        role: "CLIENT",
        status: "ACTIVE",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  // État AVANT (Test G — conservation).
  const before = {
    users: await db.user.count(),
    stores: await db.store.count(),
    products: await db.product.count(),
    orders: await db.order.count(),
    settings: await db.platformSettings.count(),
    ownerAccounts: await db.user.count({ where: { role: "ADMIN" } }),
  };
  console.log(`État avant : ${JSON.stringify(before)}`);

  // ————— TEST A — Compte vendeur sans office —————
  console.log("\n— TEST A : vendeur sans office —");
  const vCookie = await loginVendor();
  const storeRes = await api("/api/stores", {
    method: "POST",
    cookie: vCookie,
    body: { name: "Boutique Test 41", slug: "boutique-test-41", description: "Boutique de test E2E" },
  });
  check("A1 — création boutique", storeRes.status === 201 || storeRes.status === 200, `status ${storeRes.status}`);
  const mine = await api("/api/stores/mine", { cookie: vCookie });
  check("A2 — boutique accessible", mine.status === 200 && mine.json?.store?.slug === "boutique-test-41");
  const stats = await api("/api/stats/vendor", { cookie: vCookie });
  check("A3 — stats vendeur 200 (espace vendeur fonctionnel)", stats.status === 200);
  const meA = await api("/api/auth/me", { cookie: vCookie });
  check(
    "A4 — me : rôle de base VENDEUR + aucun office",
    meA.json?.user?.role === "VENDEUR" && Array.isArray(meA.json?.offices) && meA.json.offices.length === 0,
  );

  // ————— TEST B — Attribution d'un office —————
  console.log("\n— TEST B : attribution d'un office (Comptable) —");
  const adminCookie = await loginAdmin();
  const assignB = await api("/api/admin/staff", {
    method: "POST",
    cookie: adminCookie,
    body: { role: "COMPTABLE", email: VENDOR_EMAIL, note: "e2e" },
  });
  check(
    "B1 — attribution 201, compte existant, PAS de 2e utilisateur",
    assignB.status === 201 && assignB.json?.mode === "existing",
    `status ${assignB.status} mode ${assignB.json?.mode}`,
  );
  check(
    "B2 — réponse : rôle de base VENDEUR CONSERVÉ",
    assignB.json?.user?.baseRole === "VENDEUR",
    `baseRole=${assignB.json?.user?.baseRole}`,
  );
  const vendorAfter = await db.user.findUnique({ where: { email: VENDOR_EMAIL } });
  check("B3 — DB : user.role inchangé (VENDEUR)", vendorAfter?.role === "VENDEUR");
  const userCountAfterB = await db.user.count();
  check("B4 — DB : aucun utilisateur créé lors de l'attribution", userCountAfterB === before.users);
  const statsB = await api("/api/stats/vendor", { cookie: vCookie });
  check("B5 — espace vendeur ENCORE fonctionnel après office", statsB.status === 200);
  const meB = await api("/api/auth/me", { cookie: vCookie });
  check(
    "B6 — me : office COMPTABLE actif + permission finance.read chargée",
    meB.json?.offices?.some((o: any) => o.role === "COMPTABLE" && o.status === "ACTIVE") &&
      meB.json?.permissions?.includes("finance.read"),
  );
  const finB = await api("/api/staff/finance", { cookie: vCookie });
  check(
    "B7 — espace pro finances 200 (données réelles, permissions exécutées)",
    finB.status === 200 && typeof finB.json?.totals?.revenueXOF === "number",
  );
  const notifB = await api("/api/notifications", { cookie: vCookie });
  check(
    "B8 — notification « Nouveau poste » reçue",
    notifB.json?.items?.some((n: any) => n.title?.includes("Comptable")),
  );
  const auditB = await db.auditLog.findFirst({ where: { action: "STAFF_OFFICE_ASSIGNED" } });
  check("B9 — audit STAFF_OFFICE_ASSIGNED consigné", Boolean(auditB));

  // ————— TEST C — Actualisation et reconnexion —————
  console.log("\n— TEST C : actualisation et reconnexion —");
  const meRefresh = await api("/api/auth/me", { cookie: vCookie });
  check(
    "C1 — refresh (actualisation) : offices rechargés",
    meRefresh.json?.offices?.length === 1 && meRefresh.json?.user?.role === "VENDEUR",
  );
  await api("/api/auth/logout", { method: "POST", cookie: vCookie });
  const vCookie2 = await loginVendor();
  const meC = await api("/api/auth/me", { cookie: vCookie2 });
  check(
    "C2 — reconnexion : office conservé, rôle de base conservé",
    meC.json?.offices?.some((o: any) => o.role === "COMPTABLE") && meC.json?.user?.role === "VENDEUR",
  );
  const finC = await api("/api/staff/finance", { cookie: vCookie2 });
  check("C3 — accès pro après reconnexion", finC.status === 200);

  // ————— TEST D — Plusieurs offices + idempotence + délégation —————
  console.log("\n— TEST D : plusieurs offices, idempotence, tâches —");
  const assignD = await api("/api/admin/staff", {
    method: "POST",
    cookie: adminCookie,
    body: { role: "GREFFIER_PRINCIPAL", email: VENDOR_EMAIL },
  });
  check("D1 — 2e office attribué sans remplacer le 1er", assignD.status === 201);
  const meD = await api("/api/auth/me", { cookie: vCookie2 });
  check(
    "D2 — me : 2 offices actifs, permissions en UNION (finance.read ET users.manage)",
    meD.json?.offices?.length === 2 &&
      meD.json?.permissions?.includes("finance.read") &&
      meD.json?.permissions?.includes("users.manage"),
  );
  const again = await api("/api/admin/staff", {
    method: "POST",
    cookie: adminCookie,
    body: { role: "GREFFIER_PRINCIPAL", email: VENDOR_EMAIL },
  });
  const greffierCount = await db.userRole.count({
    where: { role: "GREFFIER_PRINCIPAL", userId: vendor.id },
  });
  check(
    "D3 — ré-attribution idempotente (200 alreadyActive, aucun doublon)",
    again.status === 200 && again.json?.alreadyActive === true && greffierCount === 1,
  );
  const usersD = await api("/api/staff/users", { cookie: vCookie2 });
  check("D4 — module comptes accessible (users.read du Greffier)", usersD.status === 200);
  const taskAdmin = await api("/api/admin/staff-tasks", {
    method: "POST",
    cookie: adminCookie,
    body: { title: "Rapprochement des ventes de la semaine", assigneeId: vendor.id, priority: "HIGH" },
  });
  check("D5 — propriétaire crée une tâche réelle", taskAdmin.status === 201);
  const myTasks = await api("/api/staff/tasks", { cookie: vCookie2 });
  check("D6 — tâche visible dans l'espace pro", myTasks.json?.tasks?.length >= 1);
  const taskId = myTasks.json?.tasks?.[0]?.id;
  const patchTask = await api(`/api/staff/tasks/${taskId}`, {
    method: "PATCH",
    cookie: vCookie2,
    body: { status: "IN_PROGRESS" },
  });
  check("D7 — l'officier fait avancer l'état réel de la tâche", patchTask.status === 200 && patchTask.json?.task?.status === "IN_PROGRESS");
  const delegateTask = await api("/api/staff/tasks", {
    method: "POST",
    cookie: vCookie2,
    body: { title: "Note interne de test", assigneeId: vendor.id, priority: "LOW" },
  });
  check("D8 — délégation permise (tasks.delegate du Greffier)", delegateTask.status === 201);

  // ————— TEST E — Retrait d'un office —————
  console.log("\n— TEST E : retrait d'un office —");
  const listE = await api("/api/admin/staff", { cookie: adminCookie });
  const comptableAttr = listE.json?.attributions?.find(
    (a: any) => a.role === "COMPTABLE" && a.user?.email === VENDOR_EMAIL,
  );
  const delE = await api(`/api/admin/staff/${comptableAttr.id}`, { method: "DELETE", cookie: adminCookie });
  check("E1 — retrait OK", delE.status === 200);
  const finE = await api("/api/staff/finance", { cookie: vCookie2 });
  check("E2 — accès finances immédiatement retiré (403)", finE.status === 403);
  const statsE = await api("/api/stats/vendor", { cookie: vCookie2 });
  check("E3 — espace vendeur TOUJOURS actif après retrait", statsE.status === 200);
  const meE = await api("/api/auth/me", { cookie: vCookie2 });
  check("E4 — compte vendeur intact (rôle VENDEUR, 1 office restant)", meE.json?.user?.role === "VENDEUR" && meE.json?.offices?.length === 1);
  const auditE = await db.auditLog.findFirst({ where: { action: "STAFF_OFFICE_REVOKED" } });
  check("E5 — historique conservé dans l'audit", Boolean(auditE));

  // ————— TEST F — Sécurité —————
  console.log("\n— TEST F : sécurité —");
  const f1 = await api("/api/admin/staff", { method: "POST", cookie: vCookie2, body: { role: "COMPTABLE", email: VENDOR_EMAIL } });
  check("F1 — un officier ne peut PAS s'attribuer un office (route admin)", f1.status === 403);
  const f2 = await api("/api/admin/users", { cookie: vCookie2 });
  check("F2 — route admin interdite à l'officier", f2.status === 403);
  const f3 = await api("/api/admin/staff", {
    method: "POST",
    cookie: adminCookie,
    body: { role: "COMPTABLE", email: OWNER_EMAIL },
  });
  check("F3 — le propriétaire ne reçoit pas d'office (409)", f3.status === 409);
  const f4 = await api("/api/admin/staff", {
    method: "POST",
    cookie: adminCookie,
    body: { role: "SUPER_ADMIN", email: adjEmails[0] },
  });
  check("F4 — SUPER_ADMIN hors catalogue (422)", f4.status === 422);
  const adj1 = await db.user.findUnique({ where: { email: adjEmails[0] } });
  const f5 = await api(`/api/staff/users/${adj1!.id}`, { method: "PATCH", cookie: vCookie2, body: { status: "SUSPENDED" } });
  check("F5 — gestion de compte exécutée côté serveur (users.manage du Greffier)", f5.status === 200);
  const f5b = await api(`/api/staff/users/${adj1!.id}`, { method: "PATCH", cookie: vCookie2, body: { status: "ACTIVE" } });
  check("F5b — réactivation par l'officier", f5b.status === 200);
  const owner = await db.user.findFirst({ where: { role: "ADMIN" } });
  const f6 = await api(`/api/staff/users/${owner!.id}`, { method: "PATCH", cookie: vCookie2, body: { status: "SUSPENDED" } });
  check("F6 — le compte propriétaire est intouchable par un officier", f6.status === 409);

  // ————— Plafond 5 adjoints par poste (directive) —————
  console.log("\n— Plafond d'effectif : 5 adjoints par poste —");
  let assigned5 = 0;
  for (const email of adjEmails) {
    const r = await api("/api/admin/staff", { method: "POST", cookie: adminCookie, body: { role: "SECRETARIAT", email } });
    if (r.status === 201) assigned5++;
  }
  check("G1 — 5 adjoints créés au poste Secrétariat", assigned5 === 5, `${assigned5}/5`);
  const g2 = await api("/api/admin/staff", { method: "POST", cookie: adminCookie, body: { role: "SECRETARIAT", email: VENDOR_EMAIL } });
  check("G2 — 6e adjoint refusé (409 + message de directive)", g2.status === 409 && String(g2.json?.error || "").includes("5"));
  const listG = await api("/api/admin/staff", { cookie: adminCookie });
  const secretaireEffectif = listG.json?.effectifs?.find((e: any) => e.role === "SECRETARIAT");
  check("G3 — effectif du poste affiché 5/5", secretaireEffectif?.activeCount === 5 && secretaireEffectif?.max === 5);
  const adjAttr = listG.json?.attributions?.find((a: any) => a.role === "SECRETARIAT" && a.user?.email === adjEmails[0]);
  await api(`/api/admin/staff/${adjAttr.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "SUSPENDED" } });
  const g4 = await api("/api/admin/staff", { method: "POST", cookie: adminCookie, body: { role: "SECRETARIAT", email: VENDOR_EMAIL } });
  check("G4 — suspendre libère la place → nouvelle attribution 201", g4.status === 201);
  const reactivate = await api(`/api/admin/staff/${adjAttr.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } });
  check("G5 — réactivation refusée poste complet (409)", reactivate.status === 409);

  // ————— TEST G — Conservation des comptes —————
  console.log("\n— TEST G : conservation —");
  const after = {
    users: await db.user.count(),
    stores: await db.store.count(),
    products: await db.product.count(),
    orders: await db.order.count(),
    settings: await db.platformSettings.count(),
    ownerAccounts: await db.user.count({ where: { role: "ADMIN" } }),
  };
  check(
    "G6 — propriétaire unique intact (2 comptes ADMIN d'origine)",
    after.ownerAccounts === before.ownerAccounts,
  );
  check("G7 — produits/commandes/paramètres intacts", after.products === before.products && after.orders === before.orders && after.settings === before.settings);
  check("G8 — boutiques : +1 uniquement (boutique de test)", after.stores === before.stores + 1, `${before.stores} → ${after.stores}`);
  check(
    "G9 — comptes réels : aucun perdu, aucun créé hors tests (snapshot inclut déjà les comptes test)",
    after.users === before.users,
    `${before.users} → ${after.users}`,
  );
  const noStaffRoleBase = await db.user.count({
    where: { role: { notIn: ["CLIENT", "VENDEUR", "ADMIN"] } },
  });
  check("G10 — AUCUN rôle de base écrasé (aucun rôle hors catalogue de base)", noStaffRoleBase === 0);

  // ————— Résumé —————
  const failed = results.filter((r) => !r.ok);
  console.log(`\n========== RÉSULTAT : ${results.length - failed.length}/${results.length} OK ==========`);
  if (failed.length > 0) {
    console.log("Échecs :");
    for (const f of failed) console.log(`  ❌ ${f.name} ${f.detail}`);
  }

  // ————— Nettoyage des comptes de test (l'audit reste conservé) —————
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  const afterCleanup = await db.user.count();
  console.log(`Nettoyage : comptes de test supprimés (${afterCleanup} utilisateurs restants, données réelles intactes).`);

  await db.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("ERREUR FATALE E2E:", err);
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } }).catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
