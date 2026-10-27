// POST /api/vendor/withdrawals — demande de retrait du solde disponible.
// Le montant est bloqué immédiatement (statut PENDING) : il ne peut plus être
// redemandé tant que l'administrateur n'a pas versé (PAID) ou rejeté la
// demande. Le solde est re-vérifié DANS la transaction (anti course concurrente).
// Les administrateurs actifs sont notifiés. Rate-limit anti-abus.
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { getStoreWallet } from "@/lib/wallet";
import { notifyAdmins } from "@/lib/notifications";
import { withdrawalRequestSchema } from "@/lib/validation";
import { formatXOF } from "@/lib/format";

export async function POST(req: Request) {
  try {
    const user = await requireRole("VENDEUR", "ADMIN");
    rateLimit(`withdrawal:ip:${clientIp(req)}`, 5, 60_000);

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) throw new HttpError(404, "Aucune boutique trouvée pour votre compte");
    if (store.status !== "ACTIVE") {
      throw new HttpError(403, "Votre boutique est suspendue : retrait impossible.");
    }

    const input = withdrawalRequestSchema.parse(await readJson(req));

    const withdrawal = await db.$transaction(async (tx) => {
      // Re-vérification du solde dans la transaction : deux demandes
      // concurrentes ne peuvent pas dépasser le solde disponible.
      const fresh = await getStoreWallet(store.id, tx);
      if (input.amountXOF > fresh.availableXOF) {
        throw new HttpError(
          422,
          `Solde insuffisant : ${formatXOF(fresh.availableXOF)} disponibles pour un retrait de ${formatXOF(input.amountXOF)}.`,
        );
      }
      return tx.withdrawal.create({
        data: {
          storeId: store.id,
          amountXOF: input.amountXOF,
          method: input.method,
          destination: input.destination,
          status: "PENDING",
        },
      });
    });

    await logAudit({
      actorUserId: user.id,
      action: "WITHDRAWAL_REQUESTED",
      entity: "Withdrawal",
      entityId: withdrawal.id,
      metadata: {
        storeSlug: store.slug,
        amountXOF: withdrawal.amountXOF,
        method: withdrawal.method,
      },
    });

    await notifyAdmins({
      type: "WITHDRAWAL_REQUEST",
      title: "Nouvelle demande de retrait",
      body: `${store.name} demande ${formatXOF(withdrawal.amountXOF)} (${withdrawal.method === "BANK_TRANSFER" ? "virement" : "Mobile Money"} vers ${withdrawal.destination}).`,
      link: "#/admin",
    });

    return jsonOk(
      {
        ok: true,
        withdrawal: {
          id: withdrawal.id,
          amountXOF: withdrawal.amountXOF,
          method: withdrawal.method,
          destination: withdrawal.destination,
          status: withdrawal.status,
          providerRef: withdrawal.providerRef,
          adminNote: withdrawal.adminNote,
          requestedAt: withdrawal.requestedAt.toISOString(),
          processedAt: withdrawal.processedAt?.toISOString() ?? null,
        },
      },
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
