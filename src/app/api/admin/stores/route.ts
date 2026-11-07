// GET /api/admin/stores — toutes les boutiques (rôle ADMIN requis).
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError, requireAdminViewer } from "@/lib/auth";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { storeCreateSchema } from "@/lib/validation";
import { uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireAdminViewer();

    const stores = await db.store.findMany({
      include: {
        owner: { select: { email: true } },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        color: s.color,
        phone: s.phone,
        status: s.status,
        verifiedAt: s.verifiedAt,
        createdAt: s.createdAt,
        ownerEmail: s.owner.email,
        productsCount: s._count.products,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
  const admin = await requireAdminViewer();
  const raw = await readJson(request);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(422, "Données de boutique invalides");
  }
  const input = raw as Record<string, unknown>;
  const data = storeCreateSchema.parse(input);
  const ownerId = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : admin.id;
  const owner = await db.user.findUnique({ where: { id: ownerId } });
  if (!owner || owner.status !== "ACTIVE") throw new HttpError(404, "Propriétaire actif introuvable");
  if (await db.store.findFirst({ where: { ownerId } })) {
    throw new HttpError(409, "Ce propriétaire possède déjà une boutique");
  }

  const slug = data.slug ?? await uniqueSlug(data.name);
  try {
    const store = await db.$transaction(async (tx) => {
      const created = await tx.store.create({
        data: {
          ownerId,
          name: data.name,
          slug,
          description: data.description ?? null,
          color: data.color,
          phone: data.phone ?? null,
          faqs: data.faqs ? JSON.stringify(data.faqs) : null,
          deliveryInfo: data.deliveryInfo ?? null,
          returnPolicy: data.returnPolicy ?? null,
          trustMessage: data.trustMessage ?? null,
        },
      });
      if (owner.role !== "ADMIN") {
        await tx.user.update({ where: { id: ownerId }, data: { role: "VENDEUR" } });
      }
      return created;
    });
    await logAudit({
      actorUserId: admin.id,
      action: "STORE_CREATED",
      entity: "Store",
      entityId: store.id,
      metadata: { name: store.name, slug: store.slug, ownerId },
    });
    return jsonOk({
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        color: store.color,
        phone: store.phone,
        faqs: data.faqs ?? [],
        deliveryInfo: store.deliveryInfo,
        returnPolicy: store.returnPolicy,
        trustMessage: store.trustMessage,
        status: store.status,
        createdAt: store.createdAt,
        ownerEmail: owner.email,
        productsCount: 0,
      },
    }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "Ce slug de boutique est déjà utilisé");
    }
    throw error;
  }
  } catch (error) {
  return handleApiError(error);
  }
}
