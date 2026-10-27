// PURGE DES DONNÉES DE TEST PRÉ-LANCEMENT — supprime les comptes de test
// (cascade : sessions, boutiques, produits, commandes, paiements, retraits,
// notifications) créés par la campagne de tests Task 13.
// Usage : bun scripts/launch-test-purge.ts

import { db } from "../src/lib/db";

const TEST_EMAILS_SUFFIX = "@billograph.test";

async function main() {
  const users = await db.user.findMany({
    where: { email: { endsWith: TEST_EMAILS_SUFFIX } },
    select: { id: true, email: true },
  });
  for (const user of users) {
    await db.user.delete({ where: { id: user.id } });
    console.log(`supprimé: ${user.email}`);
  }

  // Clients invités de test (commandes) + notifications/audit de test.
  const customers = await db.customer.deleteMany({
    where: { email: { endsWith: "@test-billograph.local" } },
  });
  console.log(`clients test supprimés: ${customers.count}`);

  const notifications = await db.notification.deleteMany({
    where: { type: { in: ["WITHDRAWAL_REQUEST", "WITHDRAWAL"] } },
  });
  console.log(`notifications retraits supprimées: ${notifications.count}`);

  // Journal d'audit des actions de test (retraits, commandes de test).
  const audit = await db.auditLog.deleteMany({
    where: { OR: [
      { metadata: { contains: "prelaunch" } },
      { entity: "Withdrawal" },
      { action: { in: ["WITHDRAWAL_REQUESTED", "WITHDRAWAL_APPROVED", "WITHDRAWAL_PAID", "WITHDRAWAL_REJECTED"] } },
    ] },
  });
  console.log(`audit test supprimé: ${audit.count}`);

  const remainingUsers = await db.user.findMany({ select: { email: true, role: true } });
  console.log(`comptes restants: ${remainingUsers.map((u) => `${u.email}(${u.role})`).join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ÉCHEC:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
