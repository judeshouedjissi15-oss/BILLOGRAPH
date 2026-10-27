// DOCTEUR DE LA PLATEFORME — diagnostic et auto-réparation.
// Idempotent : exécutable à tout moment sans risque (bun --conditions react-server scripts/doctor.ts).
//
// Il garantit que BILLOGRAPH reste utilisable même après une réinitialisation
// de l'environnement (qui a déjà effacé la base une fois) :
//   1. Réglages plateforme présents (commission par défaut appliquée).
//   2. Comptes propriétaires présents (ADMIN, actifs, email pré-confirmé).
// Les sauvegardes de la base sont gérées par le fournisseur PostgreSQL.
//
// La même garantie s'exécute AUTOMATIQUEMENT au démarrage du serveur
// (src/instrumentation.ts) — ce script reste utile pour une vérification manuelle.

import { OWNER_BOOT_PASSWORD } from "../src/lib/owner";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { OWNER_EMAILS, normalizeIdentifier } from "../src/lib/owner";
import { COMMISSION_DEFAULT } from "../src/lib/site-content";

const OWNER_PASSWORD = (process.env.OWNER_PASSWORD as string | undefined) ?? OWNER_BOOT_PASSWORD;
const OWNER_NAME = "HOUEDJISSI Judes B.";
async function ensureSettings(): Promise<void> {
  const settings = await db.platformSettings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main", commissionPercent: COMMISSION_DEFAULT },
  });
  // Garde-fou : la commission ne doit jamais rester à une valeur absurde.
  if (
    settings.commissionPercent === null ||
    settings.commissionPercent < 0 ||
    settings.commissionPercent > 50
  ) {
    await db.platformSettings.update({
      where: { id: "main" },
      data: { commissionPercent: COMMISSION_DEFAULT },
    });
  }
  console.log(
    `[doctor] Réglages OK — commission ${settings.commissionPercent ?? COMMISSION_DEFAULT} %`,
  );
}

async function ensureOwners(): Promise<void> {
  if (!OWNER_PASSWORD) {
    console.warn("[doctor] OWNER_PASSWORD absente du .env — recréation des comptes propriétaires désactivée (comptes existants intacts).");
    return;
  }
  for (const email of OWNER_EMAILS) {
    const normalized = normalizeIdentifier(email);
    const existing = await db.user.findUnique({ where: { email: normalized } });
    if (!existing) {
      await db.user.create({
        data: {
          email: normalized,
          name: OWNER_NAME,
          passwordHash: hashPassword(OWNER_PASSWORD),
          role: "ADMIN",
          status: "ACTIVE",
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`[doctor] Compte propriétaire CRÉÉ : ${normalized}`);
    } else if (
      existing.role !== "ADMIN" ||
      existing.status !== "ACTIVE" ||
      !existing.emailVerified
    ) {
      await db.user.update({
        where: { id: existing.id },
        data: {
          role: "ADMIN",
          status: "ACTIVE",
          ...(existing.emailVerified ? {} : { emailVerified: true, emailVerifiedAt: new Date() }),
        },
      });
      console.log(`[doctor] Compte propriétaire RÉPARÉ : ${normalized}`);
    } else {
      console.log(`[doctor] Compte propriétaire OK : ${normalized}`);
    }
  }
}

async function main(): Promise<void> {
  await ensureSettings();
  await ensureOwners();
  const counts = {
    utilisateurs: await db.user.count(),
    boutiques: await db.store.count(),
    produits: await db.product.count(),
    commandes: await db.order.count(),
  };
  console.log(`[doctor] État : ${JSON.stringify(counts)}`);
  console.log("[doctor] Terminé — la plateforme est utilisable.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(
      "[doctor] ÉCHEC :",
      err instanceof Error ? err.message : err,
      "\n— Si les tables manquent, appliquez les migrations : bun run db:migrate:deploy",
    );
    await db.$disconnect();
    process.exit(1);
  });
