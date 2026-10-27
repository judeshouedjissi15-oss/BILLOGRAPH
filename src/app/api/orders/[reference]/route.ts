// /api/orders/[reference]
// GET  🌐 public  — statut restreint (polling du client après paiement).
// PATCH 🔒 vendeur — MARK_DELIVERED (PAID → DELIVERED) ou CANCEL (PENDING →
// CANCELLED + restock des produits physiques). Ownership vérifié en base.
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ reference: string }> };

const patchSchema = z.object({
  action: z.enum(["MARK_DELIVERED", "CANCEL"]),
});

// Champ public restreint — ne JAMAIS exposer la boutique interne, les clés de
// fichiers ou d'autres clients.
function publicOrder(order: {
  reference: string;
  status: string;
  totalXOF: number;
  paymentMethod: string;
  createdAt: Date;
  paidAt: Date | null;
  items: { titleSnapshot: string; quantity: number; unitPriceXOF: number }[];
  customer: { email: string };
}) {
  return {
    reference: order.reference,
    status: order.status,
    totalXOF: order.totalXOF,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    items: order.items.map((i) => ({
      titleSnapshot: i.titleSnapshot,
      quantity: i.quantity,
      unitPriceXOF: i.unitPriceXOF,
    })),
    customerEmail: order.customer.email,
  };
}

const orderInclude = {
  items: true,
  customer: true,
} as const;

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const { reference } = await ctx.params;
    const order = await db.order.findUnique({
      where: { reference },
      include: orderInclude,
    });
    if (!order) throw new HttpError(404, "Commande introuvable");
    return jsonOk({ order: publicOrder(order) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await requireRole("VENDEUR");
    const { reference } = await ctx.params;
    const body = patchSchema.parse(await readJson(req));

    const order = await db.order.findUnique({
      where: { reference },
      include: { store: true, items: { include: { product: true } } },
    });
    if (!order) throw new HttpError(404, "Commande introuvable");
    if (order.store.ownerId !== user.id) {
      throw new HttpError(403, "Cette commande n'appartient pas à votre boutique");
    }

    if (body.action === "MARK_DELIVERED") {
      if (order.status !== "PAID") {
        throw new HttpError(409, "Seule une commande payée peut être marquée comme livrée");
      }
      const updated = await db.order.update({
        where: { id: order.id },
        data: { status: "DELIVERED" },
        include: orderInclude,
      });
      await logAudit({
        actorUserId: user.id,
        action: "ORDER_MARK_DELIVERED",
        entity: "Order",
        entityId: order.id,
        metadata: { reference },
      });
      return jsonOk({ order: publicOrder(updated) });
    }

    // action === "CANCEL"
    if (order.status !== "PENDING") {
      throw new HttpError(409, "Seule une commande en attente peut être annulée");
    }
    const updated = await db.$transaction(async (tx) => {
      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
        include: { items: { include: { product: true } }, customer: true },
      });
      // Restock des produits physiques (le stock avait été décrémenté au checkout).
      for (const item of cancelled.items) {
        if (!item.productId || !item.product) continue;
        if (item.product.type !== "PHYSICAL") continue;
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      return cancelled;
    });
    await logAudit({
      actorUserId: user.id,
      action: "ORDER_CANCELLED",
      entity: "Order",
      entityId: order.id,
      metadata: { reference, restocked: true },
    });
    return jsonOk({ order: publicOrder(updated) });
  } catch (err) {
    return handleApiError(err);
  }
}
