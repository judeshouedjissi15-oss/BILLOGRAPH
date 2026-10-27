// GET  /api/stores/:slug — Boutique publique : ACTIVE uniquement (404 si suspendue/inconnue),
//                         produits PUBLISHED uniquement, triés par createdAt desc.
// PATCH /api/stores/:slug — Modification par le propriétaire uniquement (403 sinon). Slug immuable.
import { NextRequest } from "next/server";
import type { Product, Store } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { storeCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

// Vues JSON conformes à API_CONTRACTS.md — ne jamais exposer fileKey / passwordHash.
function storeView(store: Store) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    color: store.color,
    phone: store.phone,
    status: store.status,
    createdAt: store.createdAt,
  };
}

function publicProductView(p: Product) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    type: p.type,
    category: p.category,
    priceXOF: p.priceXOF,
    imageUrl: p.imageUrl,
    hasFile: Boolean(p.fileKey),
    stock: p.stock,
    createdAt: p.createdAt,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const store = await db.store.findUnique({ where: { slug } });
    if (!store || store.status !== "ACTIVE") {
      throw new HttpError(404, "Boutique introuvable");
    }

    const products = await db.product.findMany({
      where: { storeId: store.id, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({ store: storeView(store), products: products.map(publicProductView) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await params;

    const store = await db.store.findUnique({ where: { slug } });
    if (!store) throw new HttpError(404, "Boutique introuvable");
    // Ownership vérifié côté serveur uniquement (store.ownerId === user.id).
    if (store.ownerId !== user.id) {
      throw new HttpError(403, "Seul le propriétaire de la boutique peut la modifier");
    }

    // Le slug est immuable : il est retiré du schéma de patch, même s'il est envoyé.
    const patchSchema = storeCreateSchema.partial().omit({ slug: true });
    const data = patchSchema.parse(await readJson(req));

    const updated = await db.store.update({
      where: { id: store.id },
      data: {
        name: data.name,
        description: data.description,
        color: data.color,
        phone: data.phone,
      },
    });

    await logAudit({
      actorUserId: user.id,
      action: "STORE_UPDATED",
      entity: "Store",
      entityId: updated.id,
      metadata: { slug: updated.slug },
    });

    return jsonOk({ store: storeView(updated) });
  } catch (err) {
    return handleApiError(err);
  }
}
