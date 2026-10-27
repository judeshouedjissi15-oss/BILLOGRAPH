// POST /api/admin/orders/[reference]/confirm-bank — confirmation manuelle d'un
// virement bancaire reçu. 🔒 ADMIN requis.
//
// RÉEL et explicite : l'administrateur confirme UNIQUEMENT après constatation
// du virement sur le compte (l'acheteur a fourni une référence sur la page de
// suivi ou contacté la plateforme). Aucune confirmation automatique n'est
// possible pour un virement — c'est voulu et documenté.
// Passe par confirmOrderPayment (source de vérité unique) : jetons de
// téléchargement, commission, notifications vendeur… traités comme un
// paiement en ligne.
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { confirmOrderPayment } from "@/lib/order-confirm";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ reference: string }> };

const bodySchema = z.object({
  // Référence du virement constaté (extraite par la banque / fournie par le client).
  providerRef: z.string().trim().min(3, "Référence du virement requise").max(120),
});

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { reference } = await ctx.params;
    const body = bodySchema.parse(await readJson(req));

    const order = await db.order.findUnique({
      where: { reference },
      include: { payment: true },
    });
    if (!order) throw new HttpError(404, "Commande introuvable");
    if (!order.payment || order.payment.provider !== "BANK_ACCOUNT") {
      throw new HttpError(409, "Cette commande n'a pas été payée par virement bancaire");
    }
    if (order.status !== "PENDING") {
      throw new HttpError(409, "Seule une commande en attente peut être confirmée");
    }

    const { order: confirmed } = await confirmOrderPayment({
      reference,
      outcome: "SUCCESS",
      provider: "BANK_ACCOUNT",
      providerRef: body.providerRef,
    });

    await logAudit({
      actorUserId: admin.id,
      action: "BANK_TRANSFER_CONFIRMED",
      entity: "Order",
      entityId: order.id,
      metadata: { reference, transferReference: body.providerRef },
    });

    return jsonOk({ order: { reference: confirmed.reference, status: confirmed.status } });
  } catch (err) {
    return handleApiError(err);
  }
}
