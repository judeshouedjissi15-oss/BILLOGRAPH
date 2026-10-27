// Purge des données de démonstration — remet la plateforme à zéro (compte ADMIN conservé).
// Usage : bun prisma/purge-demo.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Purge des données de démonstration…");

  // Ordre FK-safe : d'abord les tables filles.
  const tokens = await db.downloadToken.deleteMany({});
  const events = await db.paymentEvent.deleteMany({});
  const payments = await db.payment.deleteMany({});
  const items = await db.orderItem.deleteMany({});
  const orders = await db.order.deleteMany({});
  const customers = await db.customer.deleteMany({});
  const products = await db.product.deleteMany({});
  const stores = await db.store.deleteMany({});
  const sessions = await db.session.deleteMany({});
  const adminChallenges = await db.adminChallenge.deleteMany({});
  const reviews = await db.review.deleteMany({});
  const audits = await db.auditLog.deleteMany({});
  const users = await db.user.deleteMany({ where: { role: { not: "ADMIN" } } });

  // Réglages : on garde la commission, on efface toute config paiement de test.
  await db.platformSettings.updateMany({ data: { paymentConfig: null } });

  console.log({
    downloadTokens: tokens.count,
    paymentEvents: events.count,
    payments: payments.count,
    orderItems: items.count,
    orders: orders.count,
    customers: customers.count,
    products: products.count,
    stores: stores.count,
    sessions: sessions.count,
    adminChallenges: adminChallenges.count,
    reviews: reviews.count,
    auditLogs: audits.count,
    nonAdminUsers: users.count,
  });

  const remaining = await db.user.findMany({ select: { email: true, role: true } });
  console.log("Comptes conservés :", remaining);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
