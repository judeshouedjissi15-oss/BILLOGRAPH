// GET /api/products/slug/:slug — Page produit publique.
// Produit PUBLISHED uniquement (404 sinon) + boutique ACTIVE (une boutique suspendue
// est masquée publiquement, y compris ses pages produit). fileKey jamais exposé.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const product = await db.product.findUnique({ where: { slug }, include: { store: true } });
    if (!product || product.deletedAt || product.status !== "PUBLISHED" || product.store.status !== "ACTIVE") {
      throw new HttpError(404, "Produit introuvable");
    }

    return jsonOk({
      product: {
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        type: product.type,
        category: product.category,
        priceXOF: product.priceXOF,
        imageUrl: product.imageUrl,
        hasFile: Boolean(product.fileKey),
        fileName: product.fileName,
        fileSize: product.fileSize,
        stock: product.stock,
        createdAt: product.createdAt,
      },
      store: {
        name: product.store.name,
        slug: product.store.slug,
        color: product.store.color,
        phone: product.store.phone,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
