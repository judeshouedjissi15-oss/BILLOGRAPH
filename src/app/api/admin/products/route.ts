// GET /api/admin/products?status=&storeId=&q=&limit= — TOUS les produits de
// toutes les boutiques, y compris brouillons et archivés (ADMIN requis).
// Visibilité totale : l'administration voit exactement ce que font les vendeurs.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer, HttpError } from "@/lib/auth";
import { PRODUCT_STATUSES } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    await requireAdminViewer();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const storeId = url.searchParams.get("storeId");
    const q = url.searchParams.get("q")?.trim() || null;
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 100 : limitRaw, 1), 500);

    if (status && !(PRODUCT_STATUSES as readonly string[]).includes(status)) {
      throw new HttpError(422, "Statut de produit invalide");
    }
    if (storeId && !(await db.store.findUnique({ where: { id: storeId } }))) {
      throw new HttpError(422, "Boutique inconnue");
    }

    const where: Prisma.ProductWhereInput = {
      deletedAt: null, // la corbeille d'administration est vue séparément (onglet Corbeille)
      ...(status ? { status } : {}),
      ...(storeId ? { storeId } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    };

    const products = await db.product.findMany({
      where,
      include: { store: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return jsonOk({
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        type: p.type,
        category: p.category,
        priceXOF: p.priceXOF,
        status: p.status,
        stock: p.stock,
        hasFile: Boolean(p.fileKey),
        createdAt: p.createdAt,
        store: p.store,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
