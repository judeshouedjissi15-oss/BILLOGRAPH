// POST /api/downloads/my — récupération d'une commande numérique par email et référence.
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const lookupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  reference: z.string().trim().toUpperCase().regex(/^BLG-[A-Z0-9]{6}$/),
});

export async function POST(req: Request) {
  try {
    rateLimit(`downloads-my:ip:${clientIp(req)}`, 10, 15 * 60_000);
    const parsed = lookupSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(422, "Email ou référence de commande invalide.");
    rateLimit(
      `downloads-my:lookup:${createHash("sha256").update(`${parsed.data.email}:${parsed.data.reference}`).digest("hex")}`,
      5,
      15 * 60_000,
    );

    const order = await db.order.findFirst({
      where: {
        reference: parsed.data.reference,
        customer: { email: parsed.data.email },
        status: { in: ["PAID", "DELIVERED"] },
      },
      include: {
        items: { include: { product: { include: { files: { orderBy: { position: "asc" } } } } } },
        downloadTokens: { include: { fileDownloads: true } },
      },
    });

    return jsonOk({
      orders: order
        ? [{
            reference: order.reference,
            status: order.status,
            createdAt: order.createdAt,
            items: order.items
              .filter((item) => item.product?.type === "DIGITAL")
              .map((item) => {
                const token =
                  item.productId !== null
                    ? order.downloadTokens.find((downloadToken) => downloadToken.productId === item.productId) ?? null
                    : null;
                return {
                  title: item.product?.title ?? item.titleSnapshot,
                  productId: item.productId,
                  download: token
                    ? {
                        token: token.token,
                        expiresAt: token.expiresAt,
                        downloadCount: token.downloadCount,
                        maxDownloads: token.maxDownloads,
                        files: item.product
                          ? item.product.files.length
                            ? item.product.files.map((file) => ({
                                id: file.id,
                                name: file.fileName,
                                size: Number(file.fileSize),
                                downloadCount:
                                  token.fileDownloads.find((download) => download.productFileId === file.id)?.downloadCount ?? 0,
                                maxDownloads: token.maxDownloads,
                              }))
                            : item.product.fileKey
                              ? [{
                                  id: null,
                                  name: item.product.fileName ?? "Fichier à télécharger",
                                  size: item.product.fileSize,
                                  downloadCount: token.downloadCount,
                                  maxDownloads: token.maxDownloads,
                                }]
                              : []
                          : [],
                      }
                    : null,
                };
              }),
          }]
        : [],
    });
  } catch (err) {
    return handleApiError(err);
  }
}
