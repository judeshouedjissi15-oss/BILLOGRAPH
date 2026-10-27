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
      include: { items: { include: { product: true } }, downloadTokens: true },
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
