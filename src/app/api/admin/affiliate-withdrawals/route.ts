import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

const STATUSES = ["PENDING", "APPROVED", "PROCESSING", "PAID", "FAILED", "REJECTED"];

export async function GET(request: Request) {
  try {
    await requireAdminViewer();
    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status");
    const status = requestedStatus && STATUSES.includes(requestedStatus) ? requestedStatus : undefined;
    const [withdrawals, counts, commissions] = await Promise.all([
      db.affiliateWithdrawal.findMany({
        where: status ? { status } : undefined,
        include: {
          user: { select: { name: true, email: true } },
          processedByUser: { select: { name: true } },
        },
        orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
        take: 200,
      }),
      db.affiliateWithdrawal.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountXOF: true } }),
      db.affiliateCommission.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { amountXOF: true, paidAmountXOF: true },
      }),
    ]);

    return jsonOk({
      counts: Object.fromEntries(STATUSES.map((key) => [
        key.toLowerCase(),
        counts.find((item) => item.status === key)?._count._all ?? 0,
      ])),
      commissionTotals: commissions.map((item) => ({
        status: item.status,
        count: item._count._all,
        amountXOF: item._sum.amountXOF ?? 0,
        paidXOF: item._sum.paidAmountXOF ?? 0,
      })),
      withdrawals: withdrawals.map((item) => ({
        id: item.id,
        amountXOF: item.amountXOF,
        countryCode: item.countryCode,
        operator: item.operator,
        phoneNumber: item.phoneNumber,
        status: item.status,
        payoutId: item.payoutId,
        payoutStatus: item.payoutStatus,
        providerRef: item.providerRef,
        isManual: item.isManual,
        adminNote: item.adminNote,
        requestedAt: item.requestedAt,
        processedAt: item.processedAt,
        processedByName: item.processedByUser?.name ?? null,
        affiliate: item.user,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
