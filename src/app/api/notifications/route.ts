// GET /api/notifications — liste des notifications de l'utilisateur connecté
// (20 plus récentes) + nombre de non lues. Auth requise.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();

    const [items, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    return jsonOk({
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
