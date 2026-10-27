// POST /api/auth/logout — Détruit la session en base et supprime le cookie.
// Idempotent : renvoie { ok: true } même sans session active.
import { destroySession, getSessionUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST() {
  try {
    const user = await getSessionUser(); // optionnel — sert uniquement à l'audit
    await destroySession();
    if (user) {
      await logAudit({
        actorUserId: user.id,
        action: "USER_LOGOUT",
        entity: "User",
        entityId: user.id,
      });
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
