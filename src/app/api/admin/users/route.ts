// GET /api/admin/users?q= — liste des utilisateurs (rôle ADMIN requis).
// Recherche insensible à la casse sur le nom OU l'email.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await requireAdminViewer();

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || null;

    const users = await db.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { stores: { take: 1, select: { slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return jsonOk({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        storeSlug: u.stores[0]?.slug ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
