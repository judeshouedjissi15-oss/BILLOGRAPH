// ADMIN — EXPORT DU PROJET COMPLET (ZIP, téléchargement réel).
//  GET /api/admin/export/project → renvoie l'archive ZIP du SaaS
//  (code source + base de données + migrations + fichiers vendeurs + guides).
// L'archive est stockée dans storage/exports/ — HORS du dossier public :
// seul un administrateur connecté (session ADMIN) peut la télécharger.
// Chaque téléchargement est journalisé dans l'audit (jamais le contenu).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { handleApiError } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Archive générée par l'export (storage/ n'est ni servi ni versionné).
const ARCHIVE_PATH = path.join(process.cwd(), "storage", "exports", "billograph-saas.zip");

export async function GET() {
  try {
    const admin = await requireRole("ADMIN");

    let archive: Buffer;
    try {
      archive = await readFile(ARCHIVE_PATH);
    } catch {
      throw new HttpError(
        404,
        "L'archive d'export n'est pas disponible sur ce serveur. Demandez sa régénération au support.",
      );
    }

    await logAudit({
      actorUserId: admin.id,
      action: "PROJECT_EXPORT_DOWNLOADED",
      entity: "PlatformSettings",
      entityId: "main",
      metadata: { bytes: archive.byteLength },
    });

    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(archive.byteLength),
        "Content-Disposition": 'attachment; filename="billograph-saas.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
