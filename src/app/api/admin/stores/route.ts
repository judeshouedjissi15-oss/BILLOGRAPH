// GET /api/admin/stores — toutes les boutiques (rôle ADMIN requis).
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

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
        createdAt: s.createdAt,
        ownerEmail: s.owner.email,
        productsCount: s._count.products,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
