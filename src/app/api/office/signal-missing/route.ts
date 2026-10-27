// POST /api/office/signal-missing — un compte SANS office signale au
// propriétaire qu'il devrait en recevoir un (réel : notification + audit).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/office-server";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await readJson(req)) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : null;

    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    for (const admin of admins) {
      await notifyUser({
        userId: admin.id,
        type: "SYSTEM",
        title: "Module professionnel manquant signalé",
        body: `${user.name} (${user.email}) signale qu'aucun office n'est attribué à son compte.${message ? ` Message : ${message}` : ""}`,
        link: "#/admin",
      });
    }
    await logAudit({
      actorUserId: user.id,
      action: "OFFICE_MISSING_SIGNALED",
      entity: "User",
      entityId: user.id,
      metadata: { message: message?.slice(0, 200) ?? null },
    });
    return jsonOk({ ok: true }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
