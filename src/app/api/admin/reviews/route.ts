// GET /api/admin/reviews — liste TOUS les avis (ADMIN requis).
// Query optionnelle : ?status=PENDING|APPROVED|REJECTED (défaut : tout).
// Réponse : { reviews, counts: { total, pending, approved, rejected } } —
// utilisée par l'onglet « Avis » de l'espace administrateur.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdminViewer } from "@/lib/auth";

const VALID = ["PENDING", "APPROVED", "REJECTED"] as const;
type Status = (typeof VALID)[number];

export async function GET(req: NextRequest) {
  try {
    await requireAdminViewer();

    const raw = req.nextUrl.searchParams.get("status");
    const status: Status | null = VALID.includes(raw as Status) ? (raw as Status) : null;

    const where = { deletedAt: null, ...(status ? { status } : {}) };
    const [reviews, total, pending, approved, rejected] = await Promise.all([
      db.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          authorName: true,
          authorRole: true,
          authorCity: true,
          rating: true,
          content: true,
          status: true,
          userId: true,
          moderatedAt: true,
          createdAt: true,
        },
      }),
      db.review.count({ where: { deletedAt: null } }),
      db.review.count({ where: { status: "PENDING", deletedAt: null } }),
      db.review.count({ where: { status: "APPROVED", deletedAt: null } }),
      db.review.count({ where: { status: "REJECTED", deletedAt: null } }),
    ]);

    return jsonOk({ reviews, counts: { total, pending, approved, rejected } });
  } catch (err) {
    return handleApiError(err);
  }
}
