// GET /api/admin/audit?limit=100 — journal d'audit, ordre descendant (ADMIN).
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await requireAdminViewer();

    const url = new URL(req.url);
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 100 : limitRaw, 1), 500);

    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { actor: { select: { name: true, email: true } } },
    });

    return jsonOk({
      logs: logs.map((l) => ({
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
