// POST /api/payments/sandbox/confirm — SIMULATION DE PAIEMENT (MODE DÉMO).
//
// ⚠️ MODE DÉMO — CLAIREMENT ÉTIQUETÉ : cette route simule le webhook d'un
// prestataire pour l'environnement de démonstration. AUCUN argent réel n'est
// débité et elle ne constitue PAS un encaissement. La logique métier passe par
// la même fonction de confirmation que le vrai webhook (source de vérité
// unique) : idempotence, audit et jetons de téléchargement identiques.
import { z } from "zod";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { confirmOrderPayment } from "@/lib/order-confirm";

const sandboxConfirmSchema = z.object({
  reference: z.string().trim().min(4, "Référence de commande requise"),
  outcome: z.enum(["success", "fail"]),
});

export async function POST(req: Request) {
  try {
    rateLimit(`sandbox-confirm:${clientIp(req)}`, 20, 60 * 1000);

    const body = sandboxConfirmSchema.parse(await readJson(req));

    const { order } = await confirmOrderPayment({
      reference: body.reference,
      outcome: body.outcome === "success" ? "SUCCESS" : "FAILED",
      provider: "SANDBOX",
    });

    return jsonOk({
      order: { reference: order.reference, status: order.status, paidAt: order.paidAt },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
