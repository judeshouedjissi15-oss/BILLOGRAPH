// AMORÇAGE DU COMPTE PROPRIÉTAIRE — script serveur idempotent.
// Garantit l'existence, en base, des comptes propriétaires reconnus par
// src/lib/owner.ts (OWNER_EMAILS), avec le rôle ADMIN et le mot de passe
// fixé ci-dessous (jamais exposé dans l'interface ni dans les logs).
//
// Usage : bun --conditions react-server scripts/ensure-owner.ts
// Ré-exécutable sans effet de bord : ne touche qu'aux comptes listés ici.

import { OWNER_BOOT_PASSWORD } from "../src/lib/owner";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { OWNER_EMAILS } from "../src/lib/owner";
import { normalizeIdentifier } from "../src/lib/owner";

// Mot de passe du fondateur (haché scrypt avant insertion — jamais stocké en clair).
// Il vit UNIQUEMENT dans .env (OWNER_PASSWORD) : jamais dans le code source.
const OWNER_PASSWORD = (process.env.OWNER_PASSWORD as string | undefined) ?? OWNER_BOOT_PASSWORD;
const OWNER_NAME = "HOUEDJISSI Judes B.";

async function main() {
  if (!OWNER_PASSWORD) {
    console.error("[ensure-owner] OWNER_PASSWORD absente du .env — recréation impossible (comptes existants intacts).");
    process.exit(1);
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
          // Compte d'amorçage : email pré-confirmé (la plateforme doit rester
          // accessible même avant la configuration SMTP).
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`[ensure-owner] Compte propriétaire CRÉÉ : ${normalized}`);
    } else if (existing.role !== "ADMIN" || existing.status !== "ACTIVE" || !existing.emailVerified) {
      // Réparation défensive : un compte propriétaire reconnu doit toujours
      // être ADMIN, actif et email confirmé (sans jamais toucher au mot de passe).
      await db.user.update({
        where: { id: existing.id },
        data: {
          role: "ADMIN",
          status: "ACTIVE",
          ...(existing.emailVerified ? {} : { emailVerified: true, emailVerifiedAt: new Date() }),
        },
      });
      console.log(`[ensure-owner] Compte propriétaire RÉPARÉ (rôle/statut/email) : ${normalized}`);
    } else {
      console.log(`[ensure-owner] Compte propriétaire déjà présent : ${normalized}`);
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error("[ensure-owner] Échec :", err);
    await db.$disconnect();
    process.exit(1);
  });
