// GET /api/products/mine — Tous les produits de la boutique du vendeur connecté (tous statuts).
// fileKey masqué : on expose hasFile / fileName / fileSize uniquement.
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireRole("VENDEUR");

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) return jsonOk({ products: [] });

    const products = await db.product.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({
      products: products.map((p) => ({
        id: p.id,
        storeId: p.storeId,
        title: p.title,
        slug: p.slug,
        description: p.description,
        type: p.type,
        category: p.category,
        priceXOF: p.priceXOF,
        status: p.status,
        imageUrl: p.imageUrl,
        hasFile: Boolean(p.fileKey), // la clé de stockage privée n'est jamais renvoyée
        fileName: p.fileName,
        fileSize: p.fileSize,
        stock: p.stock,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
