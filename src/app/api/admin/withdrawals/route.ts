// GET /api/admin/withdrawals — liste des demandes de retrait (toutes boutiques).
// Filtre optionnel ?status=PENDING|APPROVED|PAID|REJECTED. Auth ADMIN requise.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

const VALID_STATUSES = ["PENDING", "APPROVED", "PAID", "REJECTED"];

export async function GET(req: Request) {
  try {
    await requireAdminViewer();

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : null;

    const [withdrawals, counts] = await Promise.all([
      db.withdrawal.findMany({
        where: status ? { status } : undefined,
        orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
        take: 100,
        include: {
          store: { select: { name: true, slug: true, owner: { select: { name: true, email: true } } } },
          processedByUser: { select: { name: true } },
        },
      }),
      db.withdrawal.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const countFor = (s: string) =>
      counts.find((row) => row.status === s)?._count._all ?? 0;

    return jsonOk({
      counts: {
        total: withdrawals.length,
        pending: countFor("PENDING"),
        approved: countFor("APPROVED"),
        paid: countFor("PAID"),
        rejected: countFor("REJECTED"),
      },
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
        processedByName: w.processedByUser?.name ?? null,
        store: {
          name: w.store.name,
          slug: w.store.slug,
          ownerName: w.store.owner.name,
          ownerEmail: w.store.owner.email,
        },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
