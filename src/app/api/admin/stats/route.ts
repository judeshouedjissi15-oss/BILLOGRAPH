// GET /api/admin/stats — vue d'ensemble plateforme (rôle ADMIN requis).
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

const PAID_STATUSES = ["PAID", "DELIVERED"] as const;

export async function GET() {
  try {
    await requireAdminViewer();

    const [users, stores, products, ordersCount, pendingCount, paidCount, sums, recentAudit] =
      await Promise.all([
        db.user.count(),
        db.store.count(),
        db.product.count({ where: { deletedAt: null } }),
        db.order.count(),
        db.order.count({ where: { status: "PENDING" } }),
        db.order.count({ where: { status: { in: [...PAID_STATUSES] } } }),
        db.order.aggregate({
          where: { status: { in: [...PAID_STATUSES] } },
          _sum: { totalXOF: true, commissionXOF: true },
        }),
        db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { actor: { select: { name: true, email: true } } },
        }),
      ]);

    return jsonOk({
      users,
      stores,
      products,
      orders: { count: ordersCount, pendingCount, paidCount },
      gmvXOF: sums._sum.totalXOF ?? 0,
      commissionXOF: sums._sum.commissionXOF ?? 0,
      recentAudit: recentAudit.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        metadata: l.metadata,
        createdAt: l.createdAt,
        actor: l.actor ? { name: l.actor.name, email: l.actor.email } : null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
