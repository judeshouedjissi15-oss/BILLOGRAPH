// GET   /api/admin/stores/[id] — détail complet de la boutique (ADMIN requis) :
// produits (tous statuts), commandes, retraits, portefeuille — TOUT ce qui se
// passe chez ce vendeur, lisible depuis l'administration.
// PATCH /api/admin/stores/[id] — changement de statut (ADMIN requis).
// SUSPENDED masque la boutique publique et bloque le checkout (404 côté
// /api/stores/:slug et /api/orders). Toute mutation est auditée.
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getStoreWallet } from "@/lib/wallet";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    await requireRole("ADMIN");
    const { id } = await ctx.params;

    const store = await db.store.findUnique({
      where: { id },
      include: {
        owner: {
          select: { name: true, email: true, status: true, emailVerified: true },
        },
      },
    });
    if (!store) throw new HttpError(404, "Boutique introuvable");

    const [products, orders, withdrawals, wallet] = await Promise.all([
      db.product.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          priceXOF: true,
          status: true,
          stock: true,
          createdAt: true,
        },
      }),
      db.order.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { customer: { select: { name: true, email: true } } },
      }),
      db.withdrawal.findMany({
        where: { storeId: store.id },
        orderBy: { requestedAt: "desc" },
        take: 20,
        select: { id: true, amountXOF: true, method: true, status: true, requestedAt: true },
      }),
      getStoreWallet(store.id),
    ]);

    return jsonOk({
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
      owner: store.owner,
      products,
      orders: orders.map((o) => ({
        reference: o.reference,
        status: o.status,
        totalXOF: o.totalXOF,
        commissionXOF: o.commissionXOF,
        customerName: o.customer.name,
        customerEmail: o.customer.email,
        createdAt: o.createdAt,
      })),
      withdrawals,
      wallet,
      counts: {
        products: products.length,
        orders: orders.length,
        paidOrders: orders.filter((o) => o.status === "PAID" || o.status === "DELIVERED").length,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = patchSchema.parse(await readJson(req));

    const existing = await db.store.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Boutique introuvable");

    const store = await db.store.update({
      where: { id },
      data: { status: body.status },
    });

    await logAudit({
      actorUserId: admin.id,
      action: "ADMIN_STORE_STATUS",
      entity: "Store",
      entityId: store.id,
      metadata: { slug: store.slug, status: store.status },
    });

    return jsonOk({
      store: { id: store.id, name: store.name, slug: store.slug, status: store.status },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
