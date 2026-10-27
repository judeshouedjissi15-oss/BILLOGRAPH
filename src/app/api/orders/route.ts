// POST /api/orders — Checkout public (achat invité).
//
// Flux paiements RÉELS via FedaPay :
// - Produit PAYANT : création de la commande puis initiation d'une transaction
//   FedaPay → le client est redirigé vers la page de paiement hébergée
//   (checkout.fedapay.com, XOF). La confirmation ne passe JAMAIS par le client :
//   webhook signé + re-vérification API (POST /api/webhooks/payment) ou polling
//   serveur (POST /api/payments/verify).
// - Produit GRATUIT (total 0) : rien à encaisser — la commande et le paiement
//   ("FREE") sont créés puis confirmés immédiatement côté serveur via
//   confirmOrderPayment : la livraison numérique s'active sur-le-champ.
//
// Rate-limit : 10/min par IP. Idempotence anti double-clic : une commande
// PENDING < 10 min pour le même email + produit est RÉUTILISÉE (200) au lieu
// d'être dupliquée — on ré-initie une transaction FedaPay pour CETTE commande
// (nouveau token, l'ancien pouvant avoir expiré).
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { checkoutSchema } from "@/lib/validation";
import { PAYMENT_METHODS } from "@/lib/constants";
import { getProvider, publicOrigin, type PaymentProvider } from "@/lib/payments";
import { confirmOrderPayment } from "@/lib/order-confirm";
import { newOrderReference } from "@/lib/slug";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { Order, Payment } from "@prisma/client";

const IDEMPOTENCE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const NOT_CONFIGURED_MESSAGE =
  "Les paiements ne sont pas encore activés sur la plateforme. L'administrateur doit connecter FedaPay dans Réglages → Paiements.";

function orderView(order: Order) {
  return {
    reference: order.reference,
    status: order.status,
    totalXOF: order.totalXOF,
    paymentMethod: order.paymentMethod,
  };
}

export async function POST(req: Request) {
  try {
    rateLimit(`orders:${clientIp(req)}`, 10, 60 * 1000);

    const body = checkoutSchema.parse(await readJson(req));

    const product = await db.product.findUnique({
      where: { slug: body.slug },
      include: { store: true },
    });
    if (!product || product.status !== "PUBLISHED" || product.store.status !== "ACTIVE") {
      throw new HttpError(404, "Produit introuvable ou indisponible à la vente");
    }
    // Un seul moyen d'encaissement réel : FEDAPAY (les produits gratuits ne
    // passent par aucun prestataire).
    if (!PAYMENT_METHODS.some((m) => m.id === body.paymentMethod)) {
      throw new HttpError(422, "Moyen de paiement inconnu");
    }

    // Paramètres plateforme (créés par défaut si absents).
    const settings =
      (await db.platformSettings.findUnique({ where: { id: "main" } })) ??
      (await db.platformSettings.create({ data: { id: "main" } }));

    const totalXOF = product.priceXOF * body.quantity;
    const commissionXOF = Math.round((totalXOF * settings.commissionPercent) / 100);
    const isFree = totalXOF === 0;
    const paymentMethod = isFree ? "FREE" : "FEDAPAY";

    // Prestataire requis uniquement pour un encaissement — vérifié avant tout
    // le reste pour les produits payants.
    const provider = isFree ? null : await getProvider("FEDAPAY");
    if (!isFree && !provider) throw new HttpError(422, NOT_CONFIGURED_MESSAGE);

    const since = new Date(Date.now() - IDEMPOTENCE_WINDOW_MS);
    const baseReuseWhere = {
      createdAt: { gte: since },
      customer: { email: body.customer.email },
      items: { some: { productId: product.id } },
    };
    // Produit gratuit : on récupère aussi la commande déjà confirmée (PAID)
    // du double-clic ; produit payant : uniquement les commandes en attente
    // (une commande FAILED n'est jamais ressuscitée — nouvelle tentative =
    // nouvelle commande).
    const reuseWhere = isFree
      ? { ...baseReuseWhere, status: { in: ["PENDING", "PAID"] } }
      : { ...baseReuseWhere, status: "PENDING" };

    // Réutilisation d'une commande existante (pré-check ou course concurrente).
    // - déjà payée → rien à encaisser, le client est renvoyé vers sa commande ;
    // - gratuite en attente (crash entre création et confirmation) → confirmée
    //   immédiatement (idempotent) ;
    // - payante en attente → nouvelle transaction FedaPay pour CETTE commande.
    const reuseOrder = async (order: Order, payment: Payment): Promise<Response> => {
      if (order.status === "PAID" || order.status === "DELIVERED") {
        return jsonOk(
          { order: orderView(order), checkout: { flow: "free" as const, reference: order.reference } },
          200,
        );
      }
      if (order.totalXOF === 0 && payment.provider === "FREE") {
        const { order: confirmed } = await confirmOrderPayment({
          reference: order.reference,
          outcome: "SUCCESS",
          provider: "FREE",
        });
        return jsonOk(
          {
            order: orderView(confirmed),
            checkout: { flow: "free" as const, reference: confirmed.reference },
          },
          200,
        );
      }
      if (order.totalXOF > 0) {
        const reuseProvider: PaymentProvider | null = provider ?? (await getProvider("FEDAPAY"));
        if (!reuseProvider) throw new HttpError(422, NOT_CONFIGURED_MESSAGE);
        const initiated = await reuseProvider.initiate({
          reference: order.reference,
          amountXOF: order.totalXOF,
          customer: {
            email: body.customer.email,
            name: body.customer.name,
            phone: body.customer.phone ?? null,
          },
          description: `Commande ${order.reference} — ${product.title}`,
          callbackUrl: `${publicOrigin(req)}/#/commande/${order.reference}`,
        });
        await db.payment.update({
          where: { id: payment.id },
          data: { providerRef: initiated.providerRef },
        });
        return jsonOk(
          {
            order: orderView(order),
            checkout: {
              flow: initiated.flow,
              ...(initiated.redirectUrl ? { redirectUrl: initiated.redirectUrl } : {}),
              reference: order.reference,
            },
          },
          200,
        );
      }
      // État incohérent (total nul mais paiement non gratuit) → refus propre.
      throw new HttpError(409, "État de commande incohérent — créez une nouvelle commande");
    };

    // Idempotence anti double-clic — pré-check rapide hors transaction.
    const recent = await db.order.findFirst({
      where: reuseWhere,
      include: { payment: true },
      orderBy: { createdAt: "desc" },
    });
    if (recent?.payment) return reuseOrder(recent, recent.payment);

    const created = await db.$transaction(async (tx) => {
      // Upsert du client par email (nom / téléphone mis à jour).
      const customer = await tx.customer.upsert({
        where: { email: body.customer.email },
        create: {
          email: body.customer.email,
          name: body.customer.name,
          phone: body.customer.phone,
        },
        update: {
          name: body.customer.name,
          phone: body.customer.phone ?? undefined,
        },
      });

      // Re-vérification d'idempotence DANS la transaction (double-clic concurrent).
      const dup = await tx.order.findFirst({
        where: reuseWhere,
        include: { payment: true },
        orderBy: { createdAt: "desc" },
      });
      if (dup?.payment) return { reused: true as const, order: dup, payment: dup.payment };

      // Décrément de stock ATOMIQUE pour les produits physiques :
      // ne réussit que si le stock disponible est suffisant.
      if (product.type === "PHYSICAL") {
        const decrement = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: body.quantity } },
          data: { stock: { decrement: body.quantity } },
        });
        if (decrement.count === 0) throw new HttpError(409, "Stock insuffisant");
      }
      // Produit DIGITAL : stock ignoré.

      const order = await tx.order.create({
        data: {
          reference: newOrderReference(),
          storeId: product.storeId,
          customerId: customer.id,
          status: "PENDING",
          totalXOF,
          commissionXOF,
          paymentMethod,
        },
      });
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          titleSnapshot: product.title,
          unitPriceXOF: product.priceXOF,
          quantity: body.quantity,
        },
      });
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: isFree ? "FREE" : "FEDAPAY",
          status: "INITIATED",
          amountXOF: totalXOF,
        },
      });
      return { reused: false as const, order, payment };
    });

    // Une requête concurrente a gagné la course → on réutilise sa commande.
    if (created.reused) return reuseOrder(created.order, created.payment);

    // Audit ORDER_CREATED — métadonnées sans aucun secret.
    await logAudit({
      action: "ORDER_CREATED",
      entity: "Order",
      entityId: created.order.id,
      metadata: {
        reference: created.order.reference,
        productTitle: product.title,
        quantity: body.quantity,
        totalXOF,
        paymentMethod,
        provider: paymentMethod,
      },
    });

    // Produit gratuit : aucun prestataire — confirmation immédiate côté serveur.
    if (isFree) {
      const { order: confirmed } = await confirmOrderPayment({
        reference: created.order.reference,
        outcome: "SUCCESS",
        provider: "FREE",
      });
      return jsonOk(
        {
          order: orderView(confirmed),
          checkout: { flow: "free" as const, reference: confirmed.reference },
        },
        201,
      );
    }

    // Initiation de la transaction chez FedaPay (encaissement réel en XOF).
    if (!provider) throw new HttpError(422, NOT_CONFIGURED_MESSAGE);
    const initiated = await provider.initiate({
      reference: created.order.reference,
      amountXOF: totalXOF,
      customer: {
        email: body.customer.email,
        name: body.customer.name,
        phone: body.customer.phone ?? null,
      },
      description: `Commande ${created.order.reference} — ${product.title}`,
      callbackUrl: `${publicOrigin(req)}/#/commande/${created.order.reference}`,
    });
    await db.payment.update({
      where: { id: created.payment.id },
      data: { providerRef: initiated.providerRef },
    });

    return jsonOk(
      {
        order: orderView(created.order),
        checkout: {
          flow: initiated.flow,
          ...(initiated.redirectUrl ? { redirectUrl: initiated.redirectUrl } : {}),
          reference: created.order.reference,
        },
      },
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
