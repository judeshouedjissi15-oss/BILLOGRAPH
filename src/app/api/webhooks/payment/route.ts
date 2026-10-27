// POST /api/webhooks/payment — réception du webhook FedaPay.
//
// SÉCURITÉ (deux verrous indépendants) :
// 1. Signature : le corps BRUT est lu (req.text()) AVANT tout parsing ; la
//    signature HMAC-SHA256 de l'en-tête "x-fedapay-signature" est vérifiée
//    contre le secret configuré (comparaison à temps constant).
// 2. Vérité : le statut annoncé par le payload n'est JAMAIS cru — la
//    transaction est re-vérifiée directement auprès de l'API FedaPay
//    (GET /v1/transactions/{id}). Seul ce résultat déclenche
//    confirmOrderPayment (source de vérité unique, idempotente).
import { db } from "@/lib/db";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { getPaymentConfig, getProvider, verifyWebhookSignature } from "@/lib/payments";
import { confirmOrderPayment } from "@/lib/order-confirm";
import { logAudit } from "@/lib/audit";

// Extraction défensive de l'identifiant de transaction FedaPay (nombre) —
// les shapes de payload pouvant varier selon les versions : entity.id,
// data.id, transaction.id ou id racine.
function extractTransactionId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const candidates = [
    (obj.entity as Record<string, unknown> | undefined)?.id,
    (obj.data as Record<string, unknown> | undefined)?.id,
    (obj.transaction as Record<string, unknown> | undefined)?.id,
    obj.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) return candidate;
  }
  return null;
}

// Retrouve la référence BILLOGRAPH : priorité à la paiement liée au providerRef,
// sinon custom_data / description contenant "BLG-XXXXXX".
async function findReference(
  transactionId: string,
  json: unknown,
): Promise<{ reference: string | null; paymentId: string | null }> {
  const payment = await db.payment.findFirst({
    where: { provider: "FEDAPAY", providerRef: transactionId },
    include: { order: true },
  });
  if (payment) return { reference: payment.order.reference, paymentId: payment.id };

  // Fallback : référence figurant dans custom_data (JSON stringifié) ou
  // dans la description de la transaction.
  const haystack = safeStringify(json);
  const match = haystack.match(/BLG-[A-Z0-9]{6}/);
  if (!match) return { reference: null, paymentId: null };
  const order = await db.order.findUnique({
    where: { reference: match[0] },
    include: { payment: true },
  });
  if (!order) return { reference: null, paymentId: null };
  return { reference: order.reference, paymentId: order.payment?.id ?? null };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    // Corps BRUT — la signature est calculée dessus, avant tout parsing.
    const rawBody = await req.text();
    const header = req.headers.get("x-fedapay-signature");

    // Parse défensif (utilisé pour tracer les rejets et retrouver la commande).
    let json: unknown = null;
    try {
      json = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      json = null;
    }
    const transactionId = extractTransactionId(json);

    const config = await getPaymentConfig();

    // Verrou 1 : signature obligatoire (secret configuré + HMAC valide).
    if (!config.webhookSecret || !verifyWebhookSignature(rawBody, header, config.webhookSecret)) {
      const { reference, paymentId } = transactionId
        ? await findReference(transactionId, json)
        : { reference: null, paymentId: null };
      if (paymentId) {
        await db.paymentEvent.create({
          data: {
            paymentId,
            type: "WEBHOOK_REJECTED",
            payload: rawBody.slice(0, 2000),
            signatureValid: false,
          },
        });
      }
      await logAudit({
        action: "WEBHOOK_REJECTED",
        entity: "Payment",
        entityId: paymentId,
        metadata: { reference, transactionId, reason: "signature_invalide" },
      });
      return jsonError(403, "Signature webhook invalide");
    }

    // Identifiant de transaction introuvable dans un payload pourtant signé.
    if (!transactionId) {
      const match = rawBody.match(/BLG-[A-Z0-9]{6}/);
      let paymentId: string | null = null;
      if (match) {
        const order = await db.order.findUnique({
          where: { reference: match[0] },
          include: { payment: true },
        });
        paymentId = order?.payment?.id ?? null;
      }
      if (paymentId) {
        await db.paymentEvent.create({
          data: {
            paymentId,
            type: "WEBHOOK_UNPARSABLE",
            payload: rawBody.slice(0, 2000),
            signatureValid: true,
          },
        });
      }
      throw new HttpError(422, "Webhook FedaPay illisible : identifiant de transaction absent");
    }

    // Verrou 2 : la commande doit exister côté plateforme.
    const { reference, paymentId } = await findReference(transactionId, json);
    if (!reference || !paymentId) throw new HttpError(404, "Paiement introuvable");

    // Trace de réception (payload brut tronqué — aucune donnée sensible).
    await db.paymentEvent.create({
      data: {
        paymentId,
        type: "WEBHOOK_RECEIVED",
        payload: rawBody.slice(0, 2000),
        signatureValid: true,
      },
    });

    // Verrou 3 : re-vérification de la transaction auprès de l'API FedaPay —
    // on ne fait AUCUNE confiance au statut contenu dans le payload.
    const provider = await getProvider("FEDAPAY");
    if (!provider) throw new HttpError(502, "Vérification du paiement impossible pour le moment");
    const verification = await provider.verifyTransaction(transactionId);

    // Toujours en attente chez FedaPay → aucune confirmation prématurée.
    if (verification.outcome === "PENDING") {
      return jsonOk({ ok: true, order: { reference, status: "PENDING" } });
    }

    const { order: confirmed } = await confirmOrderPayment({
      reference,
      outcome: verification.outcome,
      provider: "FEDAPAY",
      providerRef: transactionId,
    });

    return jsonOk({
      ok: true,
      order: { reference: confirmed.reference, status: confirmed.status },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
