// TEST D'INTÉGRATION (pré-lancement) — simule la confirmation d'un paiement
// FedaPay en appelant la VRAIE fonction confirmOrderPayment (source de vérité
// unique, identique aux chemins webhook + polling). Crée une commande + un
// paiement INITIATED exactement comme le ferait le checkout, puis confirme.
//
// Usage : bun scripts/launch-test-order.ts <productTitleMarker>
// Affiche la référence de commande sur stdout (dernière ligne : REF=BLG-XXXXXX).

import { randomBytes } from "crypto";
import { db } from "../src/lib/db";
import { confirmOrderPayment } from "../src/lib/order-confirm";
import { newOrderReference } from "../src/lib/slug";

const marker = process.argv[2];
if (!marker) throw new Error("Usage: bun scripts/launch-test-order.ts <productTitleMarker>");

async function main() {
  const product = await db.product.findFirst({
    where: { title: { contains: marker } },
    include: { store: true },
    orderBy: { createdAt: "desc" },
  });
  if (!product) throw new Error(`Produit test introuvable (marqueur: ${marker})`);

  const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
  const commissionPercent = settings?.commissionPercent ?? 8;

  const quantity = 1;
  const totalXOF = product.priceXOF * quantity;
  const commissionXOF = Math.round((totalXOF * commissionPercent) / 100);
  const reference = newOrderReference();
  const providerRef = `test-txn-${randomBytes(4).toString("hex")}`;

  const customer = await db.customer.create({
    data: {
      email: `acheteur-${randomBytes(3).toString("hex")}@test-billograph.local`,
      name: "Acheteur Test Pré-lancement",
      phone: "+2290197000001",
    },
  });

  await db.order.create({
    data: {
      reference,
      storeId: product.storeId,
      customerId: customer.id,
      status: "PENDING",
      totalXOF,
      commissionXOF,
      paymentMethod: "FEDAPAY",
      items: {
        create: {
          productId: product.id,
          titleSnapshot: product.title,
          unitPriceXOF: product.priceXOF,
          quantity,
        },
      },
      payment: {
        create: {
          provider: "FEDAPAY",
          providerRef,
          status: "INITIATED",
          amountXOF: totalXOF,
        },
      },
    },
  });

  console.log(`Commande ${reference} créée : ${totalXOF} FCFA, commission ${commissionXOF} FCFA (${commissionPercent} %), providerRef=${providerRef}`);

  // Chemin RÉEL : même fonction que webhook authentifié + polling verify.
  const result = await confirmOrderPayment({
    reference,
    outcome: "SUCCESS",
    provider: "FEDAPAY",
    providerRef,
  });

  const tokens = await db.downloadToken.count({ where: { orderId: result.order.id } });
  const payment = await db.payment.findUnique({ where: { orderId: result.order.id } });
  const vendorNotified = await db.notification.findFirst({
    where: { link: `#/dashboard/commande/${reference}` },
  });

  console.log(`order.status=${result.order.status}`);
  console.log(`payment.status=${payment?.status}`);
  console.log(`downloadTokens=${tokens}`);
  console.log(`vendorNotified=${vendorNotified ? vendorNotified.type : "NO"}`);
  console.log(`duplicated=${result.duplicated}`);
  console.log(`REF=${reference}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ÉCHEC:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
