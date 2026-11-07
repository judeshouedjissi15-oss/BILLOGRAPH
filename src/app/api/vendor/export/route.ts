// GET /api/vendor/export?type=orders|clients
// Exports CSV limités à la boutique du vendeur connecté.
// Les cellules sont neutralisées contre l'injection de formules Excel/LibreOffice.
import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { handleApiError } from "@/lib/api";

const MAX_EXPORT_ROWS = 10000;

function csvCell(value: string | number | Date | null | undefined): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvResponse(
  filename: string,
  rows: (string | number | Date | null | undefined)[][],
  truncated = false,
) {
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  return new Response("\uFEFF" + csv + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + filename + '"',
      "Cache-Control": "private, no-store",
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}

export async function GET(req: Request) {
  try {
    const user = await requireRole("VENDEUR", "ADMIN");
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "orders";
    if (type !== "orders" && type !== "clients") {
      throw new HttpError(422, "Type d'export invalide.");
    }

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    const date = new Date().toISOString().slice(0, 10);
    if (!store) {
      const headers = type === "orders"
        ? ["Référence", "Date", "Statut", "Client", "Email", "Téléphone", "Articles", "Total XOF", "Commission XOF", "Source", "Campagne", "Support", "Référent"]
        : ["Nom", "Email", "Téléphone", "Commandes", "Commandes payées", "Total payé XOF", "Dernière commande"];
      return csvResponse("billograph-" + type + "-" + date + ".csv", [headers]);
    }

    const orders = await db.order.findMany({
      where: { storeId: store.id },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS + 1,
    });
    const truncated = orders.length > MAX_EXPORT_ROWS;
    const limited = orders.slice(0, MAX_EXPORT_ROWS);

    if (type === "orders") {
      const rows: (string | number | Date | null | undefined)[][] = [[
        "Référence", "Date", "Statut", "Client", "Email", "Téléphone", "Articles",
        "Total XOF", "Commission XOF", "Source", "Campagne", "Support", "Référent",
      ]];
      for (const order of limited) {
        rows.push([
          order.reference,
          order.createdAt,
          order.status,
          order.customer.name,
          order.customer.email,
          order.customer.phone,
          order.items.map((item) => item.titleSnapshot + " x" + item.quantity).join(" | "),
          order.totalXOF,
          order.commissionXOF,
          order.utmSource,
          order.utmCampaign,
          order.utmMedium,
          order.landingReferrer,
        ]);
      }
      return csvResponse("billograph-commandes-" + date + ".csv", rows, truncated);
    }

    const byEmail = new Map<string, {
      name: string;
      email: string;
      phone: string | null;
      ordersCount: number;
      paidCount: number;
      spentXOF: number;
      lastOrderAt: Date;
    }>();
    for (const order of limited) {
      const existing = byEmail.get(order.customer.email) ?? {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        ordersCount: 0,
        paidCount: 0,
        spentXOF: 0,
        lastOrderAt: order.createdAt,
      };
      existing.ordersCount += 1;
      if (order.status === "PAID" || order.status === "DELIVERED") {
        existing.paidCount += 1;
        existing.spentXOF += order.totalXOF;
      }
      if (order.createdAt > existing.lastOrderAt) existing.lastOrderAt = order.createdAt;
      byEmail.set(order.customer.email, existing);
    }

    const rows: (string | number | Date | null | undefined)[][] = [[
      "Nom", "Email", "Téléphone", "Commandes", "Commandes payées", "Total payé XOF", "Dernière commande",
    ]];
    for (const customer of [...byEmail.values()].sort((a, b) => b.spentXOF - a.spentXOF)) {
      rows.push([
        customer.name,
        customer.email,
        customer.phone,
        customer.ordersCount,
        customer.paidCount,
        customer.spentXOF,
        customer.lastOrderAt,
      ]);
    }
    return csvResponse("billograph-clients-" + date + ".csv", rows, truncated);
  } catch (error) {
    return handleApiError(error);
  }
}
