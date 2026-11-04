import "server-only";
import { FedaPay, Payout } from "fedapay";
import type { Prisma } from "@prisma/client";
import { getPaymentConfig } from "@/lib/payments";
import { HttpError } from "@/lib/auth";

type TxClient = Prisma.TransactionClient;

let sdkQueue = Promise.resolve();

function withConfiguredSdk<T>(operation: () => Promise<T>): Promise<T> {
  const result = sdkQueue.then(operation, operation);
  sdkQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function configureSdk() {
  const config = await getPaymentConfig();
  if (!config.secretKey || !config.environment) {
    throw new HttpError(503, "La configuration serveur FedaPay est incomplète.");
  }
  FedaPay.setApiKey(config.secretKey);
  FedaPay.setEnvironment(config.environment);
  FedaPay.setApiVersion("v1");
}

export async function createAffiliatePayout(input: {
  amountXOF: number;
  phoneNumber: string;
  operator: string;
  firstName: string;
  lastName: string;
  email: string;
}) {
  return withConfiguredSdk(async () => {
    await configureSdk();
    const payout = await Payout.create({
      amount: input.amountXOF,
      currency: { iso: "XOF" },
      mode: input.operator,
      customer: {
        firstname: input.firstName,
        lastname: input.lastName || input.firstName,
        email: input.email,
        phone_number: {
          number: input.phoneNumber,
          country: "bj",
        },
      },
    });
    const id = typeof payout.id === "string" || typeof payout.id === "number"
      ? String(payout.id)
      : null;
    if (!id) throw new Error("FedaPay a créé un payout sans identifiant.");

    return {
      id,
      status: typeof payout.status === "string" ? payout.status.toLowerCase() : "unknown",
      reference: typeof payout.reference === "string" ? payout.reference : null,
    };
  });
}

export async function sendAffiliatePayout(id: string) {
  return withConfiguredSdk(async () => {
    await configureSdk();
    const payout = await Payout.retrieve(id);
    await payout.sendNow();
    const latest = await Payout.retrieve(id);
    return {
      id,
      status: typeof latest.status === "string" ? latest.status.toLowerCase() : "unknown",
      reference: typeof latest.reference === "string" ? latest.reference : null,
    };
  });
}

export async function retrieveAffiliatePayout(id: string) {
  return withConfiguredSdk(async () => {
    await configureSdk();
    const payout = await Payout.retrieve(id);
    return {
      id,
      status: typeof payout.status === "string" ? payout.status.toLowerCase() : "unknown",
      reference: typeof payout.reference === "string" ? payout.reference : null,
    };
  });
}

export async function markAffiliateWithdrawalPaid(
  tx: TxClient,
  input: {
    withdrawalId: string;
    processedBy: string;
    providerRef: string | null;
    expectedStatus: "APPROVED" | "PROCESSING";
  },
) {
  const withdrawal = await tx.affiliateWithdrawal.findUnique({
    where: { id: input.withdrawalId },
    select: { amountXOF: true, status: true },
  });
  if (!withdrawal) throw new HttpError(404, "Demande de retrait introuvable.");
  if (withdrawal.status === "PAID") return false;
  if (withdrawal.status !== input.expectedStatus) {
    throw new HttpError(409, "Le statut du retrait a changé avant sa confirmation.");
  }
  const changed = await tx.affiliateWithdrawal.updateMany({
    where: { id: input.withdrawalId, status: input.expectedStatus },
    data: {
      status: "PAID",
      providerRef: input.providerRef,
      processedAt: new Date(),
      processedBy: input.processedBy,
    },
  });
  if (changed.count === 0) {
    throw new HttpError(409, "Le statut du retrait a changé avant sa confirmation.");
  }

  const allocations = await tx.affiliateCommissionAllocation.findMany({
    where: { withdrawalId: input.withdrawalId },
    include: { commission: true },
  });
  if (allocations.reduce((sum, allocation) => sum + allocation.amountXOF, 0) !== withdrawal.amountXOF) {
    throw new HttpError(409, "Le montant réservé pour ce retrait est incohérent.");
  }
  for (const allocation of allocations) {
    const newPaidAmount = allocation.commission.paidAmountXOF + allocation.amountXOF;
    if (newPaidAmount > allocation.commission.amountXOF) {
      throw new HttpError(409, "La commission associée à ce retrait a déjà été payée.");
    }
    await tx.affiliateCommission.update({
      where: { id: allocation.commissionId },
      data: {
        paidAmountXOF: { increment: allocation.amountXOF },
        status: newPaidAmount >= allocation.commission.amountXOF ? "PAID" : "AVAILABLE",
      },
    });
  }
  return true;
}
