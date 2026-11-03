import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, listUserSessions, requireUser, revokeUserSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const user = await requireUser();
    const sessions = await listUserSessions(user.id);
    return jsonOk({
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.current,
        device: session.userAgent?.slice(0, 160) ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const revokeSchema = z.object({ sessionId: z.string().min(1).max(64) });

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    rateLimit(`session-revoke:${user.id}`, 10, 60_000);
    const { sessionId } = revokeSchema.parse(await readJson(req));
    const deleted = await revokeUserSession(user.id, sessionId);
    if (!deleted) throw new HttpError(404, "Session introuvable.");
    await logAudit({
      actorUserId: user.id,
      action: "SESSION_REVOKED",
      entity: "Session",
      entityId: sessionId,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
