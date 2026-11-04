import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";

const OPERATORS = ["mtn_open", "moov", "sbin"] as const;
const ACTIVE_WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "PROCESSING"] as const;

function parseProfile(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(422, "Informations de versement invalides.");
  }
  const body = value as Record<string, unknown>;
  if (body.countryCode !== undefined && body.countryCode !== "BJ") {
    throw new HttpError(422, "Seuls les versements au Bénin sont actuellement disponibles.");
  }
  if (typeof body.operator !== "string" || !OPERATORS.includes(body.operator as (typeof OPERATORS)[number])) {
    throw new HttpError(422, "Opérateur Mobile Money invalide.");
  }
  if (typeof body.phoneNumber !== "string") {
    throw new HttpError(422, "Le numéro Mobile Money est requis.");
  }
  const digits = body.phoneNumber.replace(/[^\d]/g, "");
  const nationalNumber = digits.startsWith("229") && digits.length === 11 ? digits.slice(3) : digits;
  if (!/^\d{8}$/.test(nationalNumber)) {
    throw new HttpError(422, "Saisissez un numéro béninois valide de 8 chiffres.");
  }
  return {
    countryCode: "BJ",
    operator: body.operator,
    phoneNumber: `+229${nationalNumber}`,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const [profile, commissions, withdrawals] = await Promise.all([
      db.affiliatePayoutProfile.findUnique({ where: { userId: user.id } }),
      db.affiliateCommission.findMany({
        where: { affiliateUserId: user.id },
        include: {
          order: { select: { reference: true, createdAt: true } },
          allocations: {
            where: { withdrawal: { status: { in: [...ACTIVE_WITHDRAWAL_STATUSES] } } },
            select: { amountXOF: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.affiliateWithdrawal.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          amountXOF: true,
          operator: true,
          phoneNumber: true,
          status: true,
          payoutStatus: true,
          providerRef: true,
          isManual: true,
          requestedAt: true,
          processedAt: true,
        },
        orderBy: { requestedAt: "desc" },
        take: 50,
      }),
    ]);

    const availableXOF = commissions.reduce((sum, commission) => {
      if (commission.status !== "AVAILABLE") return sum;
      const reservedXOF = commission.allocations.reduce((total, allocation) => total + allocation.amountXOF, 0);
      return sum + Math.max(0, commission.amountXOF - commission.paidAmountXOF - reservedXOF);
    }, 0);

    return jsonOk({
      profile: profile
        ? {
            countryCode: profile.countryCode,
            operator: profile.operator,
            phoneNumber: profile.phoneNumber,
          }
        : null,
      summary: {
        generatedXOF: commissions
          .filter((commission) => commission.status !== "CANCELLED")
          .reduce((sum, commission) => sum + commission.amountXOF, 0),
        pendingXOF: commissions
          .filter((commission) => commission.status === "PENDING" || commission.status === "VALIDATED")
          .reduce((sum, commission) => sum + commission.amountXOF, 0),
        availableXOF,
        paidXOF: commissions.reduce((sum, commission) => sum + commission.paidAmountXOF, 0),
      },
      commissions: commissions.map((commission) => ({
        id: commission.id,
        orderReference: commission.order.reference,
        amountXOF: commission.amountXOF,
        ratePercent: commission.ratePercent,
        status: commission.status,
        createdAt: commission.createdAt,
        validatedAt: commission.validatedAt,
        availableAt: commission.availableAt,
      })),
      withdrawals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const profile = parseProfile(await readJson(request));
    const saved = await db.affiliatePayoutProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profile },
      update: profile,
    });
    return jsonOk({
      profile: {
        countryCode: saved.countryCode,
        operator: saved.operator,
        phoneNumber: saved.phoneNumber,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
