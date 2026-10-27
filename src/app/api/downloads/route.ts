// GET /api/downloads?token=... — sert le FICHIER BINAIRE d'un produit
// numérique après vérifications complètes. Les fichiers ne passent JAMAIS par
// /public : ils sont lus depuis le stockage privé via readFileByKey.
//
// Vérifications (dans l'ordre) :
//   1. token existe                     → sinon 404
//   2. commande PAYÉE / DELIVERED       → sinon 403 « Paiement non confirmé »
//   3. non expiré + quota restant       → sinon 410 « Lien expiré ou limite atteinte »
//   4. fichier présent sur le disque    → sinon 404
// Puis : incrément du compteur, réponse binaire en pièce jointe.
import { db } from "@/lib/db";
import { jsonError, handleApiError } from "@/lib/api";
import { fileExists, readFileByKey } from "@/lib/storage";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    if (!token) return jsonError(422, "Jeton de téléchargement manquant");

    const row = await db.downloadToken.findUnique({
      where: { token },
      include: { order: true, product: true },
    });
    if (!row) return jsonError(404, "Lien de téléchargement introuvable");

    if (row.order.status !== "PAID" && row.order.status !== "DELIVERED") {
      return jsonError(403, "Paiement non confirmé");
    }

    const now = Date.now();
    if (row.expiresAt.getTime() < now || row.downloadCount >= row.maxDownloads) {
      return jsonError(410, "Lien expiré ou limite atteinte");
    }

    if (!row.product.fileKey || !(await fileExists(row.product.fileKey))) {
      return jsonError(404, "Fichier introuvable");
    }

    const buffer = await readFileByKey(row.product.fileKey);
    await db.downloadToken.update({
      where: { id: row.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Content-Disposition : nom ASCII sûr + variante UTF-8 (RFC 5987) pour les
    // accents et autres caractères non-ASCII.
    const fileName = row.product.fileName || `fichier-${row.order.reference}`;
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const utf8Name = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
