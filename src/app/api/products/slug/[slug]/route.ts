// GET /api/products/slug/:slug — Page produit publique.
// Produit PUBLISHED uniquement (404 sinon) + boutique ACTIVE (une boutique suspendue
// est masquée publiquement, y compris ses pages produit). fileKey jamais exposé.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { parseStoreFaqs } from "@/lib/store-faq";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const product = await db.product.findUnique({
      where: { slug },
      include: { store: true, files: { select: { id: true, fileName: true, fileSize: true, position: true }, orderBy: { position: "asc" } } },
    });
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
        salePriceXOF: product.salePriceXOF,
        saleStartsAt: product.saleStartsAt,
        saleEndsAt: product.saleEndsAt,
        purchaseLabel: product.purchaseLabel,
        imageUrl: product.imageUrl,
        hasFile: Boolean(product.fileKey),
        fileCount: product.files.length || (product.fileKey ? 1 : 0),
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
        faqs: parseStoreFaqs(product.store.faqs),
        deliveryInfo: product.store.deliveryInfo,
        returnPolicy: product.store.returnPolicy,
        trustMessage: product.store.trustMessage,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
