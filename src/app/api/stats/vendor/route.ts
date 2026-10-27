// GET /api/stats/vendor — tableau de bord du vendeur connecté.
// Base de calcul : commandes PAID/DELIVERED uniquement (jamais PENDING/FAILED).
// Agrégations en JS — acceptables à l'échelle du MVP.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";

const DAY_MS = 24 * 3600 * 1000;
const PERIOD_DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildSeries(sinceMs: number, nowMs: number) {
  const byDay = new Map<string, { revenueXOF: number; ordersCount: number }>();
  for (let t = nowMs - (PERIOD_DAYS - 1) * DAY_MS; t <= nowMs; t += DAY_MS) {
    byDay.set(dayKey(new Date(t)), { revenueXOF: 0, ordersCount: 0 });
  }
  return { byDay, labels: [...byDay.keys()] };
}

function zeroStats(nowMs: number) {
  const { labels } = buildSeries(nowMs - PERIOD_DAYS * DAY_MS, nowMs);
  return {
    totals: { revenueXOF: 0, commissionXOF: 0, netXOF: 0, ordersCount: 0, customersCount: 0 },
    period: { revenueXOF: 0, ordersCount: 0, days: PERIOD_DAYS },
    series: labels.map((date) => ({ date, revenueXOF: 0, ordersCount: 0 })),
    topProducts: [],
    latestOrders: [],
  };
}

export async function GET() {
  try {
    const user = await requireRole("VENDEUR");

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    const nowMs = Date.now();
    if (!store) return jsonOk(zeroStats(nowMs));

    // SA = commandes payées / livrées uniquement.
    const paidOrders = await db.order.findMany({
      where: { storeId: store.id, status: { in: ["PAID", "DELIVERED"] } },
      include: { items: true, customer: true },
      orderBy: { createdAt: "desc" },
    });

    const revenueXOF = paidOrders.reduce((sum, o) => sum + o.totalXOF, 0);
    const commissionXOF = paidOrders.reduce((sum, o) => sum + o.commissionXOF, 0);
    const customersCount = new Set(paidOrders.map((o) => o.customerId)).size;

    // Fenêtre glissante de 30 jours.
    const since = new Date(nowMs - PERIOD_DAYS * DAY_MS);
    const periodOrders = paidOrders.filter((o) => o.createdAt >= since);
    const periodRevenue = periodOrders.reduce((sum, o) => sum + o.totalXOF, 0);

    // Série journalière : 30 derniers jours, jours sans vente = 0.
    const { byDay, labels } = buildSeries(since.getTime(), nowMs);
    for (const o of periodOrders) {
      const slot = byDay.get(dayKey(o.createdAt));
      if (slot) {
        slot.revenueXOF += o.totalXOF;
        slot.ordersCount += 1;
      }
    }
    const series = labels.map((date) => ({ date, ...byDay.get(date)! }));

    // Top produits : sommes des quantités + CA depuis les OrderItems des
    // commandes payées (agrégation JS — échelle MVP).
    const byProduct = new Map<string, { title: string; units: number; revenueXOF: number }>();
    for (const o of paidOrders) {
      for (const item of o.items) {
        const key = item.productId ?? `titre:${item.titleSnapshot}`;
        const entry = byProduct.get(key) ?? { title: item.titleSnapshot, units: 0, revenueXOF: 0 };
        entry.units += item.quantity;
        entry.revenueXOF += item.unitPriceXOF * item.quantity;
        byProduct.set(key, entry);
      }
    }
    const topProducts = [...byProduct.values()]
      .sort((a, b) => b.revenueXOF - a.revenueXOF)
      .slice(0, 5);

    // 8 dernières commandes — TOUS statuts (visibilité vendeur).
    const latest = await db.order.findMany({
      where: { storeId: store.id },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    return jsonOk({
      totals: {
        revenueXOF,
        commissionXOF,
        netXOF: revenueXOF - commissionXOF,
        ordersCount: paidOrders.length,
        customersCount,
      },
      period: { revenueXOF: periodRevenue, ordersCount: periodOrders.length, days: PERIOD_DAYS },
      series,
      topProducts,
      latestOrders: latest.map((o) => ({
        reference: o.reference,
        status: o.status,
        totalXOF: o.totalXOF,
        createdAt: o.createdAt,
        customerName: o.customer.name,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
