// POST /api/stores — Création de la boutique de l'utilisateur connecté.
// Transaction Prisma : création du store + passage automatique au rôle VENDEUR.
// Un seul store par propriétaire (409) ; slug fourni (409 si pris) ou généré unique.
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { storeCreateSchema } from "@/lib/validation";
import { uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const data = storeCreateSchema.parse(await readJson(req));

    const existing = await db.store.findFirst({ where: { ownerId: user.id } });
    if (existing) {
      throw new HttpError(409, "Vous possédez déjà une boutique (une seule boutique par compte).");
    }

    // Slug fourni → il doit être libre. Sinon généré depuis le nom avec unicité garantie.
    if (data.slug) {
      const taken = await db.store.findUnique({ where: { slug: data.slug } });
      if (taken) throw new HttpError(409, "Ce slug de boutique est déjà utilisé");
    }
    const slug = data.slug ?? (await uniqueSlug(data.name));

    let store;
    try {
      store = await db.$transaction(async (tx) => {
        const created = await tx.store.create({
          data: {
            ownerId: user.id,
            name: data.name,
            slug,
            description: data.description ?? null,
            color: data.color, // undefined → défaut Prisma (#0B7A6B)
            phone: data.phone ?? null,
          },
        });
        // L'utilisateur devient VENDEUR dès la création de sa boutique (côté serveur).
        await tx.user.update({ where: { id: user.id }, data: { role: "VENDEUR" } });
        return created;
      });
    } catch (err) {
      // Course concurrente sur l'unicité du slug (index unique en base).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "Ce slug de boutique est déjà utilisé");
      }
      throw err;
    }

    await logAudit({
      actorUserId: user.id,
      action: "STORE_CREATED",
      entity: "Store",
      entityId: store.id,
      metadata: { name: store.name, slug: store.slug },
    });

    return jsonOk(
      {
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          description: store.description,
          color: store.color,
          phone: store.phone,
          status: store.status,
          createdAt: store.createdAt,
        },
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
