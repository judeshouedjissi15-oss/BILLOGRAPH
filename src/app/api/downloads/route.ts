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
import { Prisma } from "@prisma/client";
import { jsonError, handleApiError } from "@/lib/api";
import { readFileByKey, StorageFileNotFoundError } from "@/lib/storage";
import { getR2ObjectSize, signR2Download } from "@/lib/r2";

async function consumeFileDownload(tokenId: string, fileId: string, maxDownloads: number) {
  const updated = await db.productFileDownload.updateMany({
    where: { downloadTokenId: tokenId, productFileId: fileId, downloadCount: { lt: maxDownloads } },
    data: { downloadCount: { increment: 1 } },
  });
  if (updated.count === 1) return true;

  try {
    await db.productFileDownload.create({
      data: { downloadTokenId: tokenId, productFileId: fileId, downloadCount: 1 },
    });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const retried = await db.productFileDownload.updateMany({
      where: { downloadTokenId: tokenId, productFileId: fileId, downloadCount: { lt: maxDownloads } },
      data: { downloadCount: { increment: 1 } },
    });
    return retried.count === 1;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    const fileId = url.searchParams.get("fileId")?.trim();
    if (!token) return jsonError(422, "Jeton de téléchargement manquant");

    const row = await db.downloadToken.findUnique({
      where: { token },
      include: { order: true, product: { include: { files: { orderBy: { position: "asc" } } } } },
    });
    if (!row) return jsonError(404, "Lien de téléchargement introuvable");

    if (row.order.status !== "PAID" && row.order.status !== "DELIVERED") {
      return jsonError(403, "Paiement non confirmé");
    }

    const now = Date.now();
    if (row.expiresAt.getTime() < now || row.downloadCount >= row.maxDownloads) {
      return jsonError(410, "Lien expiré ou limite atteinte");
    }

    const selectedFile = fileId
      ? row.product.files.find((file) => file.id === fileId)
      : row.product.files[0];
    const fileKey = selectedFile?.fileKey ?? (!fileId ? row.product.fileKey : null);
    const fileName = selectedFile?.fileName ?? (!fileId ? row.product.fileName : null);
    if (!fileKey) return jsonError(404, "Fichier introuvable");

    if (fileKey.startsWith("product-files/")) {
      if ((await getR2ObjectSize(fileKey)) === null) return jsonError(404, "Fichier introuvable");
      const location = await signR2Download(fileKey, fileName || `fichier-${row.order.reference}`);
      const result = selectedFile
        ? { count: Number(await consumeFileDownload(row.id, selectedFile.id, row.maxDownloads)) }
        : await db.downloadToken.updateMany({
            where: { id: row.id, expiresAt: { gt: new Date() }, downloadCount: { lt: row.maxDownloads } },
            data: { downloadCount: { increment: 1 } },
          });
      if (result.count !== 1) return jsonError(410, "Lien expiré ou limite atteinte");
      return Response.redirect(location, 302);
    }

    let buffer: Buffer;
    try {
      buffer = await readFileByKey(fileKey);
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        return jsonError(404, "Fichier introuvable");
      }
      throw error;
    }
    const result = selectedFile
      ? { count: Number(await consumeFileDownload(row.id, selectedFile.id, row.maxDownloads)) }
      : await db.downloadToken.updateMany({
          where: { id: row.id, expiresAt: { gt: new Date() }, downloadCount: { lt: row.maxDownloads } },
          data: { downloadCount: { increment: 1 } },
        });
    if (result.count !== 1) return jsonError(410, "Lien expiré ou limite atteinte");

    // Content-Disposition : nom ASCII sûr + variante UTF-8 (RFC 5987) pour les
    // accents et autres caractères non-ASCII.
    const downloadName = fileName || `fichier-${row.order.reference}`;
    const asciiName = downloadName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const utf8Name = encodeURIComponent(downloadName).replace(
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
