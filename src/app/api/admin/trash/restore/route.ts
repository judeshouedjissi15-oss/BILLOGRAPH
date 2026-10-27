// POST /api/admin/trash/restore — RESTAURATION depuis la corbeille
// (propriétaire uniquement). Corps : { entity, id }. Audité : *_RESTORED.
import { NextRequest } from "next/server";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { restoreTrashItem } from "@/lib/trash";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole("ADMIN");
    const body = (await readJson(req)) as { entity?: unknown; id?: unknown };
    if (typeof body.entity !== "string" || typeof body.id !== "string") {
      return jsonOk({ ok: false, error: "Paramètres invalides" }, 422);
    }
    await restoreTrashItem({ entity: body.entity, id: body.id, actorId: admin.id });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
