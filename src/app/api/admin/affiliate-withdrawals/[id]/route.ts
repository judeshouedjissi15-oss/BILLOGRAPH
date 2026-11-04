import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createAffiliatePayout,
  markAffiliateWithdrawalPaid,
  retrieveAffiliatePayout,
  sendAffiliatePayout,
} from "@/lib/affiliate-payouts";

type AdminAction = "payout" | "sync" | "manual" | "manual_paid" | "reject";

function parseAction(body: unknown): { action: AdminAction; providerRef?: string; adminNote?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(422, "Décision invalide.");
  }
  const input = body as Record<string, unknown>;
  const actions: AdminAction[] = ["payout", "sync", "manual", "manual_paid", "reject"];
  if (typeof input.action !== "string" || !actions.includes(input.action as AdminAction)) {
    throw new HttpError(422, "Action de retrait invalide.");
  }
  if (input.providerRef !== undefined && (typeof input.providerRef !== "string" || input.providerRef.trim().length > 160)) {
    throw new HttpError(422, "La référence du transfert est invalide.");
  }
  if (input.adminNote !== undefined && (typeof input.adminNote !== "string" || input.adminNote.trim().length > 500)) {
    throw new HttpError(422, "La note administrateur est invalide.");
  }
  return {
    action: input.action as AdminAction,
    providerRef: typeof input.providerRef === "string" ? input.providerRef.trim() : undefined,
    adminNote: typeof input.adminNote === "string" ? input.adminNote.trim() : undefined,
  };
}

async function updateProviderStatus(
  id: string,
  adminId: string,
  providerResult: { id: string; status: string; reference: string | null },
) {
  const result = await db.$transaction(async (tx) => {
    const withdrawal = await tx.affiliateWithdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new HttpError(404, "Demande de retrait introuvable.");
    if (withdrawal.status === "PAID") return withdrawal;
    if (providerResult.status === "sent") {
      await tx.affiliateWithdrawal.update({
        where: { id },
        data: { payoutStatus: "sent" },
      });
      await markAffiliateWithdrawalPaid(tx, {
        withdrawalId: id,
        processedBy: adminId,
        providerRef: providerResult.reference ?? providerResult.id,
        expectedStatus: "PROCESSING",
      });
    } else {
      const failed = providerResult.status === "failed";
      await tx.affiliateWithdrawal.update({
        where: { id },
        data: {
          status: failed ? "FAILED" : "PROCESSING",
          payoutStatus: providerResult.status,
          processedAt: failed ? new Date() : withdrawal.processedAt,
          processedBy: adminId,
        },
      });
    }
    return tx.affiliateWithdrawal.findUniqueOrThrow({ where: { id } });
  });
  await logAudit({
    actorUserId: adminId,
    action: result.status === "PAID" ? "AFFILIATE_WITHDRAWAL_PAID" : "AFFILIATE_PAYOUT_STATUS_SYNCED",
    entity: "AffiliateWithdrawal",
    entityId: result.id,
    metadata: { status: result.status, payoutStatus: result.payoutStatus, payoutId: result.payoutId },
  });
  return result;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await context.params;
    const { action, providerRef, adminNote } = parseAction(await readJson(request));
    const current = await db.affiliateWithdrawal.findUnique({
      where: { id },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!current) throw new HttpError(404, "Demande de retrait introuvable.");
    if (current.status === "PAID" || current.status === "REJECTED") {
      throw new HttpError(409, "Cette demande est déjà clôturée.");
    }

    if (action === "manual") {
      const needsFedaPayReconciliation =
        current.status === "PROCESSING" &&
        !current.payoutId &&
        current.payoutStatus === "creation_uncertain";
      if (
        current.status !== "PENDING" &&
        current.status !== "APPROVED" &&
        !needsFedaPayReconciliation
      ) {
        throw new HttpError(409, "Seule une demande en attente peut passer en traitement manuel.");
      }
      if (needsFedaPayReconciliation && !adminNote) {
        throw new HttpError(422, "Vérifiez d'abord le tableau de bord FedaPay et notez le résultat de cette vérification.");
      }
      const changed = await db.affiliateWithdrawal.updateMany({
        where: { id, status: current.status, payoutId: null },
        data: {
          status: "APPROVED",
          isManual: true,
          adminNote: adminNote || current.adminNote,
          processedBy: admin.id,
          processedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new HttpError(409, "Cette demande vient d'être prise en charge.");
      const withdrawal = await db.affiliateWithdrawal.findUniqueOrThrow({ where: { id } });
      await logAudit({
        actorUserId: admin.id,
        action: "AFFILIATE_WITHDRAWAL_MANUAL_APPROVED",
        entity: "AffiliateWithdrawal",
        entityId: id,
        metadata: { amountXOF: withdrawal.amountXOF },
      });
      return jsonOk({ withdrawal });
    }

    if (action === "manual_paid") {
      if (current.status !== "APPROVED" || !current.isManual) {
        throw new HttpError(409, "Cette demande n'est pas approuvée pour un versement manuel.");
      }
      if (!providerRef) throw new HttpError(422, "La référence du transfert vérifié est obligatoire.");
      let result: Awaited<ReturnType<typeof db.affiliateWithdrawal.findUniqueOrThrow>>;
      try {
        result = await db.$transaction(async (tx) => {
          const duplicate = await tx.affiliateWithdrawal.findFirst({
            where: { providerRef, status: "PAID", id: { not: id } },
            select: { id: true },
          });
          if (duplicate) throw new HttpError(409, "Cette référence de transfert est déjà utilisée.");
          await tx.affiliateWithdrawal.update({
            where: { id },
            data: { adminNote: adminNote || current.adminNote },
          });
          await markAffiliateWithdrawalPaid(tx, {
            withdrawalId: id,
            processedBy: admin.id,
            providerRef,
            expectedStatus: "APPROVED",
          });
          return tx.affiliateWithdrawal.findUniqueOrThrow({ where: { id } });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new HttpError(409, "Cette référence de transfert est déjà utilisée.");
        }
        throw error;
      }
      await logAudit({
        actorUserId: admin.id,
        action: "AFFILIATE_WITHDRAWAL_MANUALLY_PAID",
        entity: "AffiliateWithdrawal",
        entityId: id,
        metadata: { amountXOF: result.amountXOF, providerRef },
      });
      return jsonOk({ withdrawal: result });
    }

    if (action === "reject") {
      if (!["PENDING", "APPROVED", "FAILED"].includes(current.status)) {
        throw new HttpError(409, "Ce retrait ne peut plus être refusé.");
      }
      if (!adminNote) throw new HttpError(422, "Un motif de refus est obligatoire.");
      const changed = await db.affiliateWithdrawal.updateMany({
        where: { id, status: current.status },
        data: { status: "REJECTED", adminNote, processedAt: new Date(), processedBy: admin.id },
      });
      if (changed.count !== 1) throw new HttpError(409, "Cette demande vient d'être prise en charge.");
      const withdrawal = await db.affiliateWithdrawal.findUniqueOrThrow({ where: { id } });
      await logAudit({
        actorUserId: admin.id,
        action: "AFFILIATE_WITHDRAWAL_REJECTED",
        entity: "AffiliateWithdrawal",
        entityId: id,
        metadata: { amountXOF: withdrawal.amountXOF },
      });
      return jsonOk({ withdrawal });
    }

    if (action === "sync") {
      if (!current.payoutId) throw new HttpError(409, "Aucun identifiant de payout FedaPay à synchroniser.");
      if (current.status !== "PROCESSING") {
        throw new HttpError(409, "Seul un payout en cours peut être synchronisé.");
      }
      const payout = await retrieveAffiliatePayout(current.payoutId);
      const withdrawal = await updateProviderStatus(id, admin.id, payout);
      return jsonOk({ withdrawal });
    }

    if (current.isManual) throw new HttpError(409, "Cette demande est en traitement manuel.");
    if (current.status !== "PENDING" && current.status !== "APPROVED") {
      throw new HttpError(409, "Cette demande a déjà été soumise à FedaPay; utilisez la synchronisation.");
    }

    const claimed = await db.affiliateWithdrawal.updateMany({
      where: { id, status: current.status, payoutId: null },
      data: {
        status: "PROCESSING",
        payoutStatus: "creating",
        processedBy: admin.id,
        processedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "Cette demande est déjà en cours de traitement.");
    }

    let payout: Awaited<ReturnType<typeof createAffiliatePayout>>;
    try {
      const names = current.user.name.trim().split(/\s+/);
      payout = await createAffiliatePayout({
        amountXOF: current.amountXOF,
        phoneNumber: current.phoneNumber,
        operator: current.operator,
        firstName: names[0] || current.user.name,
        lastName: names.slice(1).join(" "),
        email: current.user.email,
      });
    } catch (error) {
      await db.affiliateWithdrawal.update({
        where: { id },
        data: { status: "PROCESSING", payoutStatus: "creation_uncertain", processedAt: new Date() },
      });
      console.error("[affiliate payout] FedaPay payout creation failed", error instanceof Error ? error.name : "unknown");
      throw new HttpError(502, "La création du payout n'a pas pu être confirmée. Vérifiez FedaPay avant toute nouvelle action; le retrait n'a pas été marqué payé.");
    }

    await db.affiliateWithdrawal.update({
      where: { id },
      data: { payoutId: payout.id, payoutStatus: payout.status },
    });
    let latest;
    try {
      latest = await sendAffiliatePayout(payout.id);
    } catch (error) {
      console.error("[affiliate payout] FedaPay send or status retrieval failed", error instanceof Error ? error.name : "unknown");
      throw new HttpError(502, "Payout créé mais statut non confirmé. Utilisez Synchroniser avant toute autre action.");
    }
    const withdrawal = await updateProviderStatus(id, admin.id, latest);
    return jsonOk({ withdrawal });
  } catch (error) {
    return handleApiError(error);
  }
}
