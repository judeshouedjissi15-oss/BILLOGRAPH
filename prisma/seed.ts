// BILLOGRAPH — Seed de démarrage (bootstrap).
//
// Crée uniquement le compte PROPRIÉTAIRE (administrateur unique) et la ligne
// de réglages "main". AUCUNE donnée de démonstration n'est créée : les
// boutiques, produits et commandes doivent être réels.
//
// SÉCURITÉ :
// - L'email du propriétaire est fixé (OWNER_EMAIL de src/lib/owner.ts) ; il ne
//   s'affiche nulle part dans l'interface.
// - Le mot de passe est fourni par la variable d'environnement OWNER_PASSWORD
//   (OBLIGATOIRE, aucune valeur par défaut). Seul son hachage scrypt (format
//   identique à src/lib/auth.ts) est stocké en base — jamais le mot de passe.
// - L'accès admin exige en plus DEUX codes secrets vérifiés serveur
//   (challenge /api/auth/admin-challenge après la connexion).
//
// Idempotent : peut être relancé sans risque. Usage :
//   OWNER_PASSWORD="…" bun prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

const OWNER_EMAIL = "hjbilede@05"; // identique à OWNER_EMAIL (src/lib/owner.ts)
const OWNER_NAME = "HOUEDJISSI Judes B.";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

async function main() {
  const existing = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!existing) {
    const password = process.env.OWNER_PASSWORD;
    if (!password || password.length < 8) {
      console.error(
        "Refus de créer le compte propriétaire : OWNER_PASSWORD est requis (8 caractères minimum).",
      );
      process.exit(1);
    }
    await db.user.create({
      data: {
        email: OWNER_EMAIL,
        passwordHash: hashPassword(password),
        name: OWNER_NAME,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`Compte propriétaire créé : ${OWNER_EMAIL}`);
  } else {
    console.log(`Compte propriétaire déjà présent : ${OWNER_EMAIL}`);
  }

  await db.platformSettings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
  console.log("Réglages plateforme prêts (commission par défaut : 5 %).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
