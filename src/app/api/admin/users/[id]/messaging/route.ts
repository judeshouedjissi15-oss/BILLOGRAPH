import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), hours: z.number().int().min(1).max(720), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("restore") }),
]);

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    rateLimit(`admin-message-control:${admin.id}`, 60, 60_000);
    const { id } = await params;
    if (id === admin.id) throw new HttpError(422, "Vous ne pouvez pas suspendre votre propre messagerie.");
    const body = schema.parse(await readJson(req));
    const target = await db.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
    if (!target) throw new HttpError(404, "Utilisateur introuvable.");
    if (target.role === "ADMIN") throw new HttpError(403, "La suspension de messagerie ne s’applique pas aux comptes administrateurs.");
    const until = body.action === "suspend" ? new Date(Date.now() + body.hours * 60 * 60_000) : null;
    await db.user.update({ where: { id }, data: { messagingSuspendedUntil: until } });
    await logAudit({
      actorUserId: admin.id,
      action: body.action === "suspend" ? "USER_MESSAGING_SUSPENDED" : "USER_MESSAGING_RESTORED",
      entity: "User",
      entityId: id,
      metadata: body.action === "suspend" ? { until: until?.toISOString(), reason: body.reason } : {},
    });
    return jsonOk({ ok: true, messagingSuspendedUntil: until?.toISOString() ?? null, user: target });
  } catch (err) {
    return handleApiError(err);
  }
}
