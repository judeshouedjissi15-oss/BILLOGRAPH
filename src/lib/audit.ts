// Journal d'audit — trace les événements importants (login, paiements, actions admin...).
import { db } from "@/lib/db";

export async function logAudit(params: {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (err) {
    // L'audit ne doit jamais casser le flux métier — mais l'erreur est loguée.
    console.error("[audit] échec d'écriture:", err);
  }
}
