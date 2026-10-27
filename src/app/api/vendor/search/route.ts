// GET /api/vendor/search?q=… — recherche réelle dans LES DONNÉES DU VENDEUR
// connecté uniquement : ses produits (titre/slug) et ses commandes (référence,
// nom ou email du client). Aucune fuite inter-boutiques.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const user = await requireRole("VENDEUR");

    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 2) {
      return jsonOk({ products: [], orders: [] });
    }

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) return jsonOk({ products: [], orders: [] });

    const [products, orders] = await Promise.all([
      db.product.findMany({
        where: {
          storeId: store.id,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, title: true, slug: true, status: true },
      }),
      db.order.findMany({
        where: {
          storeId: store.id,
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { email: { contains: q, mode: "insensitive" } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          reference: true,
          status: true,
          totalXOF: true,
          customer: { select: { name: true } },
          items: { orderBy: { id: "asc" }, take: 1, select: { titleSnapshot: true } },
        },
      }),
    ]);

    return jsonOk({
      products,
      orders: orders.map((o) => ({
        reference: o.reference,
        status: o.status,
        totalXOF: o.totalXOF,
        customerName: o.customer.name,
        productTitle: o.items[0]?.titleSnapshot ?? "—",
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
