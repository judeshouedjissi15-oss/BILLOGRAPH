// GET /api/admin/trash?q= — Contenu de la CORBEILLE D'ADMINISTRATION.
// Le propriétaire (ADMIN) voit tout. Le GREFFIER en fonction voit tout
// également (directive : « le greffier peut voir tout ce que le super admin
// peut voir ») — mais toute action de restauration/purge reste ADMIN.
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";
import { listTrash } from "@/lib/trash";

export async function GET(req: Request) {
  try {
    await requireAdminViewer();
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    const items = await listTrash({ q });
    return jsonOk({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
