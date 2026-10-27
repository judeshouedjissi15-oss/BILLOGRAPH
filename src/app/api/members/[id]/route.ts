// GET /api/members/[id] — PROFIL PUBLIC d'un membre BILLOGRAPH (aucune donnée
// sensible). Le profil est personnalisable par son titulaire depuis « Mon
// profil » (#/profil) : photo, titre, présentation, ville. La page liste les
// boutiques ACTIVES du membre et leurs produits PUBLIÉS — données réelles.
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const member = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        avatarUrl: true,
        headline: true,
        bio: true,
        city: true,
        createdAt: true,
        stores: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            color: true,
            _count: { select: { products: { where: { status: "PUBLISHED", deletedAt: null } } } },
          },
        },
      },
    });

    if (!member || member.status !== "ACTIVE") {
      return jsonOk({ member: null }, 404);
    }

    const storeIds = member.stores.map((s) => s.id);
    const products = storeIds.length
      ? await db.product.findMany({
          where: { storeId: { in: storeIds }, status: "PUBLISHED", deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            title: true,
            slug: true,
            priceXOF: true,
            type: true,
            imageUrl: true,
            store: { select: { name: true, slug: true, color: true } },
          },
        })
      : [];

    return jsonOk({
      member: {
        id: member.id,
        name: member.name,
        role: member.role,
        avatarUrl: member.avatarUrl,
        headline: member.headline,
        bio: member.bio,
        city: member.city,
        memberSince: member.createdAt.toISOString(),
        stores: member.stores.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          color: s.color,
          productsCount: s._count.products,
        })),
      },
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        priceXOF: p.priceXOF,
        type: p.type,
        imageUrl: p.imageUrl,
        storeName: p.store.name,
        storeSlug: p.store.slug,
        storeColor: p.store.color,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
