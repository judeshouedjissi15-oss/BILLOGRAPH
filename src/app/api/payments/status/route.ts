// GET /api/payments/status — état public de la configuration des paiements.
// Permet au front d'adapter l'interface (bouton de paiement, message
// d'activation) sans exposer la moindre clé secrète. Réponse jamais cachée.
import { jsonOk, handleApiError } from "@/lib/api";
import { getPaymentConfig, isPaymentsConfigured } from "@/lib/payments";

export async function GET() {
  try {
    const config = await getPaymentConfig();
    const configured = isPaymentsConfigured(config);
    const res = jsonOk({
      configured,
      provider: configured ? ("FEDAPAY" as const) : null,
      environment: config.environment,
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
