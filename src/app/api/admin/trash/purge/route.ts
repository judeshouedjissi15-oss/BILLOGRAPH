// POST /api/admin/trash/purge — PURGE DÉFINITIVE depuis la corbeille
// (propriétaire uniquement, jamais le greffier). Corps : { entity, id }.
// Le détail de l'élément est conservé dans l'audit avant destruction réelle.
import { NextRequest } from "next/server";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { purgeTrashItem } from "@/lib/trash";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole("ADMIN");
    const body = (await readJson(req)) as { entity?: unknown; id?: unknown };
    if (typeof body.entity !== "string" || typeof body.id !== "string") {
      return jsonOk({ ok: false, error: "Paramètres invalides" }, 422);
    }
    await purgeTrashItem({ entity: body.entity, id: body.id, actorId: admin.id });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
