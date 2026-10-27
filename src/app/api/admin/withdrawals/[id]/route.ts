// POST /api/admin/withdrawals/[id] — décision de l'administrateur sur une
// demande de retrait :
//   - approve    : PENDING → APPROVED (pré-validation avant transfert)
//   - mark_paid  : PENDING/APPROVED → PAID (référence du transfert RÉEL requise
//                  dans providerRef — le versement est effectué hors plateforme)
//   - reject     : PENDING/APPROVED → REJECTED (motif requis, fonds libérés)
// Chaque transition est auditée et notifiée au vendeur. Idempotence refusée :
// un retrait déjà traité (PAID/REJECTED) ne peut plus changer d'état.
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { withdrawalDecisionSchema } from "@/lib/validation";
import { formatXOF } from "@/lib/format";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const input = withdrawalDecisionSchema.parse(await readJson(req));
    let storeSlug: string | null = null;

    const result = await db.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id },
        include: { store: { select: { id: true, name: true, slug: true, ownerId: true } } },
      });
      if (!withdrawal) throw new HttpError(404, "Demande de retrait introuvable");
      storeSlug = withdrawal.store.slug;

      if (withdrawal.status === "PAID" || withdrawal.status === "REJECTED") {
        throw new HttpError(
          409,
          `Ce retrait est déjà traité (${withdrawal.status === "PAID" ? "versé" : "rejeté"}).`,
        );
      }

      if (input.action === "approve") {
        if (withdrawal.status !== "PENDING") {
          throw new HttpError(409, "Seule une demande en attente peut être pré-validée.");
        }
        return tx.withdrawal.update({
          where: { id },
          data: { status: "APPROVED", processedAt: new Date(), processedBy: admin.id },
        });
      }

      if (input.action === "mark_paid") {
        const providerRef = input.providerRef?.trim();
        if (!providerRef) {
          throw new HttpError(
            422,
            "La référence du transfert réel est requise pour marquer le retrait comme versé.",
          );
        }
        return tx.withdrawal.update({
          where: { id },
          data: {
            status: "PAID",
            providerRef,
            adminNote: input.adminNote?.trim() || withdrawal.adminNote,
            processedAt: new Date(),
            processedBy: admin.id,
          },
        });
      }

      // reject — motif obligatoire ; le solde redevient disponible (le retrait
      // rejeté ne compte plus dans la somme bloquée).
      const adminNote = input.adminNote?.trim();
      if (!adminNote) {
        throw new HttpError(422, "Un motif de rejet est requis.");
      }
      return tx.withdrawal.update({
        where: { id },
        data: {
          status: "REJECTED",
          adminNote,
          processedAt: new Date(),
          processedBy: admin.id,
        },
      });
    });

    await logAudit({
      actorUserId: admin.id,
      action:
        input.action === "mark_paid"
          ? "WITHDRAWAL_PAID"
          : input.action === "approve"
            ? "WITHDRAWAL_APPROVED"
            : "WITHDRAWAL_REJECTED",
      entity: "Withdrawal",
      entityId: result.id,
      metadata: {
        storeSlug,
        amountXOF: result.amountXOF,
        status: result.status,
        providerRef: result.providerRef ?? null,
      },
    });

    // Notification vendeur sur la décision (hors transaction).
    const store = await db.store
      .findUnique({
        where: { id: result.storeId },
        select: { ownerId: true, name: true },
      })
      .catch(() => null);
    if (store) {
      const titleByAction: Record<string, string> = {
        approve: "Retrait pré-validé",
        mark_paid: "Retrait versé",
        reject: "Retrait refusé",
      };
      const bodyByAction: Record<string, string> = {
        approve: `Votre demande de retrait de ${formatXOF(result.amountXOF)} est validée. Le versement va être effectué.`,
        mark_paid: `Votre retrait de ${formatXOF(result.amountXOF)} a été versé${result.providerRef ? ` (réf. ${result.providerRef})` : ""}.`,
        reject: `Votre demande de retrait de ${formatXOF(result.amountXOF)} a été refusée. Motif : ${result.adminNote ?? "non précisé"}. Le montant est de nouveau dans votre solde.`,
      };
      await createNotification({
        userId: store.ownerId,
        type: "WITHDRAWAL",
        title: titleByAction[input.action] ?? "Mise à jour de retrait",
        body: bodyByAction[input.action] ?? "",
        link: "#/dashboard",
      });
    }

    return jsonOk({
      ok: true,
      withdrawal: {
        id: result.id,
        amountXOF: result.amountXOF,
        method: result.method,
        destination: result.destination,
        status: result.status,
        providerRef: result.providerRef,
        adminNote: result.adminNote,
        requestedAt: result.requestedAt.toISOString(),
        processedAt: result.processedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
