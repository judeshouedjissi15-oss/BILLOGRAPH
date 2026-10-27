// GET /api/images/[...key] — Sert UNIQUEMENT les images de couverture du stockage privé.
// Sécurité :
// - whitelist stricte d'extensions (.jpg/.jpeg/.png/.webp/.gif) → tout le reste = 404 ;
//   les fichiers numériques (.pdf/.zip/...) ne sont JAMAIS servis ici (ils passent par
//   /api/downloads avec un jeton lié à une commande payée) ;
// - resolveKey() interdit toute traversée de répertoire (../../) ;
// - Content-Type mappé + nosniff (jamais de type interprétable par le navigateur) ;
// - cache public long : les clés sont uniques par upload, le contenu est immuable.
import { NextRequest, NextResponse } from "next/server";
import { readFileByKey, resolveKey } from "@/lib/storage";
import { HttpError } from "@/lib/auth";
import { handleApiError } from "@/lib/api";

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const { key } = await params;
    const relativeKey = (key ?? []).join("/");

    if (!relativeKey || relativeKey.includes("..") || relativeKey.includes("\0")) {
      throw new HttpError(404, "Image introuvable");
    }

    const dot = relativeKey.lastIndexOf(".");
    const ext = dot === -1 ? "" : relativeKey.slice(dot).toLowerCase();
    const contentType = EXT_TO_CONTENT_TYPE[ext];
    if (!contentType) throw new HttpError(404, "Image introuvable");

    // Protection traversée de chemin : lève une erreur si la clé sort du stockage.
    resolveKey(relativeKey);

    let data: Buffer;
    try {
      data = await readFileByKey(relativeKey);
    } catch {
      throw new HttpError(404, "Image introuvable");
    }

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
