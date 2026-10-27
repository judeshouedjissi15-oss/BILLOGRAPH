// BILLOGRAPH — Notifications in-app (ventes, paiements, retraits).
// Écriture : fire-and-forget sûr — une notification ne doit JAMAIS casser le
// flux métier qui la déclenche (paiement, retrait...). Lecture : /api/notifications.
import "server-only";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/constants";

export type NotificationType = "SALE" | "PAYMENT" | "WITHDRAWAL" | "WITHDRAWAL_REQUEST" | "SYSTEM";

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link ?? null,
      },
    });
  } catch (err) {
    console.error(
      "[notifications] échec d'écriture:",
      err instanceof Error ? err.message : err,
    );
  }
}

// Notifie tous les administrateurs actifs (ex : nouvelle demande de retrait).
export async function notifyAdmins(params: {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: ROLES.ADMIN, status: "ACTIVE" },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await db.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link ?? null,
      })),
    });
  } catch (err) {
    console.error(
      "[notifications] échec de notification des admins:",
      err instanceof Error ? err.message : err,
    );
  }
}
