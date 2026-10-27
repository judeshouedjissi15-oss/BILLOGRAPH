// Purge des données de test E2E (utilisateurs, sessions, config SMTP de test).
// Les comptes propriétaires sont conservés et restent pré-confirmés.
import { db } from "../src/lib/db";

for (const email of ["test-acheteur@example.com", "ui-test@example.com"]) {
  const u = await db.user.findUnique({ where: { email } });
  if (u) {
    await db.user.delete({ where: { id: u.id } }); // cascade tokens + sessions
    console.log(`utilisateur de test supprimé: ${email}`);
  }
}

const s = await db.session.deleteMany({});
const c = await db.adminChallenge.deleteMany({});
console.log(`sessions: ${s.count}, challenges: ${c.count}`);

// La config SMTP de test (localhost:1025) est retirée : le propriétaire
// configurera son VRAI service d'envoi dans Admin → Paramètres.
await db.platformSettings.update({ where: { id: "main" }, data: { smtpConfig: null, siteUrl: null } });
console.log("config SMTP de test purgée (à reconfigurer avec le vrai service)");

const owners = await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true, emailVerified: true } });
console.log("proprios:", JSON.stringify(owners));
await db.$disconnect();
