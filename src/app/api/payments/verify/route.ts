// POST /api/payments/verify — vérification serveur du statut d'une commande (public).
//
// Polling de complément au webhook : le serveur re-interroge LUI-MÊME l'API
// FedaPay (jamais le client) et confirme via confirmOrderPayment si le paiement
// est tranché. Rate-limit : 30/min par IP.
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { paymentVerifySchema } from "@/lib/validation";
import { getProvider } from "@/lib/payments";
import { confirmOrderPayment } from "@/lib/order-confirm";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Statuts pour lesquels plus aucune action de paiement n'est nécessaire.
const TERMINAL_ORDER_STATUSES = ["PAID", "DELIVERED", "FAILED", "CANCELLED", "REFUNDED"];

export async function POST(req: Request) {
  try {
    rateLimit(`payments-verify:${clientIp(req)}`, 30, 60 * 1000);

    const body = paymentVerifySchema.parse(await readJson(req));

    const order = await db.order.findUnique({
      where: { reference: body.reference },
      include: { payment: true },
    });
    if (!order) throw new HttpError(404, "Commande introuvable");

    // Déjà tranchée → état courant, rien à faire.
    if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
      return jsonOk({ order: { reference: order.reference, status: order.status } });
    }

    // Produit gratuit resté en attente (échec entre création et confirmation) :
    // rien à encaisser → confirmation immédiate côté serveur (idempotente).
    if (order.payment?.provider === "FREE") {
      const { order: confirmed } = await confirmOrderPayment({
        reference: order.reference,
        outcome: "SUCCESS",
        provider: "FREE",
      });
      return jsonOk({ order: { reference: confirmed.reference, status: confirmed.status } });
    }

    // Paiement FedaPay en attente → re-vérification directe auprès de l'API.
    if (order.payment?.provider === "FEDAPAY" && order.payment.providerRef) {
      const provider = await getProvider("FEDAPAY");
      if (provider) {
        // Une erreur 502 ici est volontairement propagée : le front l'affiche
        // comme une information bénigne ("vérification momentanément
        // impossible") sans jamais considérer la commande comme payée.
        const verification = await provider.verifyTransaction(order.payment.providerRef);
        if (verification.outcome === "SUCCESS" || verification.outcome === "FAILED") {
          const { order: confirmed } = await confirmOrderPayment({
            reference: order.reference,
            outcome: verification.outcome,
            provider: "FEDAPAY",
            providerRef: order.payment.providerRef,
          });
          return jsonOk({ order: { reference: confirmed.reference, status: confirmed.status } });
        }
      }
    }

    // Toujours en attente (ou prestataire momentanément non configuré).
    return jsonOk({ order: { reference: order.reference, status: "PENDING" } });
  } catch (err) {
    return handleApiError(err);
  }
}
