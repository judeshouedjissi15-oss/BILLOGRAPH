// GET /api/vendor/wallet — portefeuille du vendeur connecté : solde disponible,
// commissions, revenus nets + historique des retraits. Requiert une boutique.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { getStoreWallet } from "@/lib/wallet";

export async function GET() {
  try {
    const user = await requireRole("VENDEUR", "ADMIN");

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) throw new HttpError(404, "Aucune boutique trouvée pour votre compte");

    const [wallet, withdrawals] = await Promise.all([
      getStoreWallet(store.id),
      db.withdrawal.findMany({
        where: { storeId: store.id },
        orderBy: { requestedAt: "desc" },
        take: 50,
      }),
    ]);

    return jsonOk({
      wallet,
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        amountXOF: w.amountXOF,
        method: w.method,
        destination: w.destination,
        status: w.status,
        providerRef: w.providerRef,
        adminNote: w.adminNote,
        requestedAt: w.requestedAt.toISOString(),
        processedAt: w.processedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
