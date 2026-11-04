import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { MIN_WITHDRAWAL_XOF } from "@/lib/constants";
import { logAudit } from "@/lib/audit";

const RESERVED_STATUSES = ["PENDING", "APPROVED", "PROCESSING"] as const;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    if (!body || typeof body !== "object" || !("amountXOF" in body)) {
      throw new HttpError(422, "Montant de retrait invalide.");
    }
    const amountXOF = body.amountXOF;
    if (
      typeof amountXOF !== "number" ||
      !Number.isInteger(amountXOF) ||
      amountXOF < MIN_WITHDRAWAL_XOF ||
      amountXOF > 50_000_000
    ) {
      throw new HttpError(422, `Le retrait doit être un montant entier compris entre ${MIN_WITHDRAWAL_XOF} et 50 000 000 FCFA.`);
    }

    const profile = await db.affiliatePayoutProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new HttpError(422, "Enregistrez d'abord votre numéro Mobile Money.");

    let withdrawal;
    try {
      withdrawal = await db.$transaction(async (tx) => {
        const commissions = await tx.affiliateCommission.findMany({
          where: { affiliateUserId: user.id, status: "AVAILABLE" },
          include: {
            allocations: {
              where: { withdrawal: { status: { in: [...RESERVED_STATUSES] } } },
              select: { amountXOF: true },
            },
          },
          orderBy: { availableAt: "asc" },
        });
        const available = commissions.map((commission) => ({
          commission,
          remaining:
            commission.amountXOF -
            commission.paidAmountXOF -
            commission.allocations.reduce((sum, allocation) => sum + allocation.amountXOF, 0),
        })).filter((item) => item.remaining > 0);
        const totalAvailable = available.reduce((sum, item) => sum + item.remaining, 0);
        if (totalAvailable < amountXOF) {
          throw new HttpError(409, `Solde disponible insuffisant (${totalAvailable} FCFA).`);
        }

        const created = await tx.affiliateWithdrawal.create({
          data: {
            userId: user.id,
            amountXOF,
            countryCode: profile.countryCode,
            operator: profile.operator,
            phoneNumber: profile.phoneNumber,
          },
        });
        let toAllocate = amountXOF;
        for (const item of available) {
          if (toAllocate === 0) break;
          const allocationAmount = Math.min(toAllocate, item.remaining);
          await tx.affiliateCommissionAllocation.create({
            data: {
              commissionId: item.commission.id,
              withdrawalId: created.id,
              amountXOF: allocationAmount,
            },
          });
          toAllocate -= allocationAmount;
        }
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new HttpError(409, "Une autre opération vient de modifier votre solde. Actualisez-le puis réessayez.");
      }
      throw error;
    }

    await logAudit({
      actorUserId: user.id,
      action: "AFFILIATE_WITHDRAWAL_REQUESTED",
      entity: "AffiliateWithdrawal",
      entityId: withdrawal.id,
      metadata: { amountXOF, operator: profile.operator },
    });
    return jsonOk({
      withdrawal: {
        id: withdrawal.id,
        amountXOF: withdrawal.amountXOF,
        status: withdrawal.status,
        requestedAt: withdrawal.requestedAt,
      },
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
