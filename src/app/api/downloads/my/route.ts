// GET /api/downloads/my?email=... — récupération des achats numériques par
// email (MVP : pas de compte client obligatoire). Commandes PAYÉE/DELIVERED
// uniquement, produits numériques uniquement, jeton existant sinon null.
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { HttpError } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = z
      .string()
      .trim()
      .toLowerCase()
      .email("Email invalide")
      .safeParse(url.searchParams.get("email"));
    if (!parsed.success) throw new HttpError(422, "Email invalide ou manquant");

    const orders = await db.order.findMany({
      where: {
        customer: { email: parsed.data },
        status: { in: ["PAID", "DELIVERED"] },
      },
      include: {
        items: { include: { product: { include: { files: { orderBy: { position: "asc" } } } } } },
        downloadTokens: { include: { fileDownloads: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return jsonOk({
      orders: orders.map((o) => ({
        reference: o.reference,
        status: o.status,
        createdAt: o.createdAt,
        items: o.items
          .filter((i) => i.product?.type === "DIGITAL")
          .map((i) => {
            const token =
              i.productId != null
                ? o.downloadTokens.find((t) => t.productId === i.productId) ?? null
                : null;
            return {
              title: i.product?.title ?? i.titleSnapshot,
              productId: i.productId,
              download: token
                ? {
                    token: token.token,
                    expiresAt: token.expiresAt,
                    downloadCount: token.downloadCount,
                    maxDownloads: token.maxDownloads,
                    files: i.product
                      ? i.product.files.length
                        ? i.product.files.map((file) => ({
                            id: file.id,
                            name: file.fileName,
                            size: Number(file.fileSize),
                            downloadCount: token.fileDownloads.find((download) => download.productFileId === file.id)?.downloadCount ?? 0,
                            maxDownloads: token.maxDownloads,
                          }))
                        : i.product.fileKey
                          ? [{
                              id: null,
                              name: i.product.fileName ?? "Fichier à télécharger",
                              size: i.product.fileSize,
                              downloadCount: token.downloadCount,
                              maxDownloads: token.maxDownloads,
                            }]
                          : []
                      : [],
                  }
                : null,
            };
          }),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
