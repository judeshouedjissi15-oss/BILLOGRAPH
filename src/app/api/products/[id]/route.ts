// PATCH  /api/products/:id — Modification d'un produit (JSON, propriétaire uniquement).
// DELETE /api/products/:id — Suppression (409 si le produit apparaît dans des commandes
//                            → suggérer l'archivage, statut ARCHIVED).
// L'ownership est vérifié côté serveur : product.store.ownerId === user.id.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, requireRole, type SessionUser } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { productUpdateSchema } from "@/lib/validation";
import { trashItem } from "@/lib/trash";
import { logAudit } from "@/lib/audit";

async function loadOwnedProduct(id: string, user: SessionUser) {
  const product = await db.product.findUnique({ where: { id }, include: { store: true } });
  if (!product) throw new HttpError(404, "Produit introuvable");
  if (product.store.ownerId !== user.id) {
    throw new HttpError(403, "Vous n'êtes pas autorisé à gérer ce produit");
  }
  return product;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("VENDEUR");
    const { id } = await params;
    const product = await loadOwnedProduct(id, user);
    if (product.deletedAt) throw new HttpError(404, "Produit introuvable");

    // JSON partiel ; les champs inconnus sont ignorés par le schéma.
    const data = productUpdateSchema.parse(await readJson(req));

    // Fusion avec l'état existant pour appliquer les règles de publication sur l'état final.
    const newType = data.type ?? product.type;
    const newStatus = data.status ?? product.status;
    const newStock = data.stock !== undefined ? data.stock : product.stock;

    if (newStatus === "PUBLISHED") {
      if (newType === "DIGITAL" && !product.fileKey) {
        // Le fichier numérique ne peut être joint qu'à la création (POST multipart).
        throw new HttpError(422, "Ajoutez le fichier numérique avant publication");
      }
      if (newType === "PHYSICAL" && (newStock === null || newStock === undefined)) {
        throw new HttpError(422, "Le stock est requis pour publier un produit physique");
      }
    }

    const updated = await db.product.update({
      where: { id: product.id },
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        category: data.category,
        priceXOF: data.priceXOF,
        status: data.status,
        stock: newType === "DIGITAL" ? null : newStock ?? null, // stock = produits physiques
      },
    });

    await logAudit({
      actorUserId: user.id,
      action: "PRODUCT_UPDATED",
      entity: "Product",
      entityId: updated.id,
      metadata: { title: updated.title, status: updated.status },
    });
    if (updated.status === "PUBLISHED" && product.status !== "PUBLISHED") {
      await logAudit({
        actorUserId: user.id,
        action: "PRODUCT_PUBLISHED",
        entity: "Product",
        entityId: updated.id,
        metadata: { title: updated.title },
      });
    }

    return jsonOk({
      product: {
        id: updated.id,
        storeId: updated.storeId,
        title: updated.title,
        slug: updated.slug,
        description: updated.description,
        type: updated.type,
        category: updated.category,
        priceXOF: updated.priceXOF,
        status: updated.status,
        imageUrl: updated.imageUrl,
        hasFile: Boolean(updated.fileKey),
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        stock: updated.stock,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("VENDEUR");
    const { id } = await params;
    const product = await loadOwnedProduct(id, user);
    if (product.deletedAt) {
      throw new HttpError(404, "Produit introuvable");
    }

    // MISE À LA CORBEILLE — la donnée reste en base (récupérable et prouvable
    // par l'administration), le fichier numérique est conservé pour la
    // restauration. Seule l'administration peut purger définitivement.
    await trashItem({
      entity: "PRODUCT",
      id: product.id,
      actorId: user.id,
      note: `Supprimé par le vendeur de la boutique « ${product.store.name} »`,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
