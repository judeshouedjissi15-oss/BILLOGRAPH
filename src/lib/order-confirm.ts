// BILLOGRAPH — Confirmation de paiement (SOURCE DE VÉRITÉ UNIQUE).
//
// ⚠️ RÈGLE DE PRODUCTION : aucune route ne doit marquer une commande PAYÉE ou
// FAILED sans passer par cette fonction. Elle est appelée :
//   - par /api/webhooks/payment (webhook FedaPay authentifié par signature
//     HMAC, puis re-vérification du statut via l'API du prestataire) ;
//   - par /api/payments/verify (polling serveur pour les commandes en attente) ;
//   - par /api/orders pour les produits gratuits (provider "FREE", rien à
//     encaisser).
//
// Garanties :
//   - Transaction Prisma : Order + Payment sont rechargés DANS la transaction
//     et re-vérifiés (protection contre les webhooks concurrents).
//   - Idempotence : si la commande est déjà dans un état terminal, le résultat
//     est ignoré proprement (état courant retourné, PaymentEvent
//     "DUPLICATE_IGNORED" journalisé hors transaction) — jamais de
//     double-remise de jetons ni de double restock.
//   - SUCCESS → payment SUCCESS + order PAID + jetons de téléchargement pour
//     chaque article numérique doté d'un fichier stocké.
//   - FAILED  → payment FAILED + order FAILED + restock des produits physiques.
//
// Note de conception : un ordre FAILED n'est jamais « ressuscité » par un
// SUCCESS tardif (risque d'incohérence de stock : le restock a déjà eu lieu).
// Une nouvelle tentative de paiement = une nouvelle commande.
import "server-only";
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { DOWNLOAD_MAX_COUNT, DOWNLOAD_TTL_DAYS } from "@/lib/constants";
import { formatXOF } from "@/lib/format";

export type PaymentOutcome = "SUCCESS" | "FAILED";

type TxClient = Prisma.TransactionClient;

function loadOrder(client: TxClient, reference: string) {
  return client.order.findUnique({
    where: { reference },
    include: { payment: true, items: { include: { product: true } } },
  });
}

export async function confirmOrderPayment(params: {
  reference: string;
  outcome: PaymentOutcome;
  provider: string;
  providerRef?: string;
  actorUserId?: string;
}) {
  const { reference, outcome, provider, providerRef, actorUserId } = params;

  const initial = await loadOrder(db, reference);
  if (!initial) throw new HttpError(404, "Commande introuvable");
  if (!initial.payment) {
    throw new HttpError(409, "Aucun paiement initié pour cette commande");
  }

  const result = await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, reference);
    if (!order || !order.payment) throw new HttpError(404, "Commande introuvable");
    const payment = order.payment;

    // Idempotence : état terminal déjà atteint (payée, échouée, annulée...) →
    // on ne retraite PAS, quel que soit le résultat annoncé.
    const alreadyTerminal =
      payment.status === "SUCCESS" ||
      payment.status === "FAILED" ||
      order.status !== "PENDING";
    if (alreadyTerminal) {
      return { skipped: true as const, order };
    }

    if (outcome === "SUCCESS") {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          confirmedAt: new Date(),
          providerRef: providerRef ?? payment.providerRef,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      // Jetons de téléchargement : uniquement les articles numériques dont le
      // produit possède réellement un fichier dans le stockage privé.
      for (const item of order.items) {
        if (!item.productId || !item.product) continue;
        if (item.product.type !== "DIGITAL" || !item.product.fileKey) continue;
        await tx.downloadToken.create({
          data: {
            token: randomBytes(32).toString("hex"),
            orderId: order.id,
            productId: item.productId,
            expiresAt: new Date(Date.now() + DOWNLOAD_TTL_DAYS * 24 * 3600 * 1000),
            maxDownloads: DOWNLOAD_MAX_COUNT,
          },
        });
      }
    } else {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          providerRef: providerRef ?? payment.providerRef,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "FAILED" },
      });
      // Restock : le stock des produits physiques avait été décrémenté au
      // checkout → on le restitue de la quantité commandée.
      for (const item of order.items) {
        if (!item.productId || !item.product) continue;
        if (item.product.type !== "PHYSICAL") continue;
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    const updated = await loadOrder(tx, reference);
    if (!updated) throw new HttpError(404, "Commande introuvable");
    return { skipped: false as const, order: updated };
  });

  if (result.skipped) {
    // Journalisation hors transaction de l'ignorance du doublon (best effort).
    await db.paymentEvent
      .create({
        data: {
          paymentId: initial.payment.id,
          type: "DUPLICATE_IGNORED",
          payload: JSON.stringify({
            reference,
            outcome,
            provider,
            orderStatus: result.order.status,
            paymentStatus: result.order.payment?.status ?? null,
          }).slice(0, 2000),
          signatureValid: true,
        },
      })
      .catch(() => {});
    return {
      order: result.order,
      payment: result.order.payment ?? initial.payment,
      duplicated: true,
    };
  }

  await logAudit({
    actorUserId: actorUserId ?? null,
    action: outcome === "SUCCESS" ? "PAYMENT_CONFIRMED" : "PAYMENT_FAILED",
    entity: "Order",
    entityId: result.order.id,
    metadata: {
      reference,
      provider,
      providerRef: providerRef ?? null,
      amountXOF: result.order.totalXOF,
    },
  });

  // Notification vendeur (hors transaction, jamais bloquante) : chaque
  // confirmation ou échec de paiement est signalé au propriétaire de la
  // boutique — ventes et paiements visibles en temps réel via la cloche.
  {
    const store = await db.store
      .findUnique({
        where: { id: result.order.storeId },
        select: { ownerId: true, name: true },
      })
      .catch(() => null);
    if (store) {
      const netXOF = result.order.totalXOF - result.order.commissionXOF;
      const isFree = result.order.totalXOF === 0;
      await createNotification({
        userId: store.ownerId,
        type: outcome === "SUCCESS" ? "SALE" : "PAYMENT",
        title:
          outcome === "SUCCESS"
            ? isFree
              ? "Nouvelle commande (gratuite)"
              : "Nouvelle vente confirmée"
            : `Paiement échoué — ${reference}`,
        body:
          outcome === "SUCCESS"
            ? isFree
              ? `Commande gratuite ${reference} sur « ${store.name} ». Aucun montant à encaisser.`
              : `Commande ${reference} payée sur « ${store.name} » : ${formatXOF(result.order.totalXOF)} bruts, ${formatXOF(netXOF)} nets pour vous.`
            : `Le paiement de la commande ${reference} sur « ${store.name} » a échoué. La commande est annulée.`,
        link: outcome === "SUCCESS" ? `#/dashboard/commande/${reference}` : "#/dashboard",
      });
    }
  }

  return {
    order: result.order,
    payment: result.order.payment ?? initial.payment,
    duplicated: false,
  };
}
