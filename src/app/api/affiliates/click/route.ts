import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const clickSchema = z.object({
  productId: z.string().min(1).max(64),
  code: z.string().trim().min(6).max(64),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    rateLimit(`affiliate-click:${ip}`, 30, 60_000);
    const { productId, code } = clickSchema.parse(await readJson(request));
    const link = await db.affiliateLink.findFirst({
      where: {
        productId,
        code,
        product: {
          status: "PUBLISHED",
          affiliateEnabled: true,
          deletedAt: null,
          store: { status: "ACTIVE" },
        },
      },
      include: { product: { select: { store: { select: { ownerId: true } } } } },
    });
    if (!link || link.userId === link.product.store.ownerId) {
      throw new HttpError(404, "Lien d'affiliation indisponible.");
    }

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const key = process.env.CONFIG_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL;
    if (!key) throw new HttpError(503, "Le suivi des liens affiliés n'est pas configuré.");
    const visitorHash = createHmac("sha256", key)
      .update(`${dayKey}|${ip}|${(request.headers.get("user-agent") ?? "").slice(0, 300)}`)
      .digest("hex");

    await db.affiliateClick.upsert({
      where: {
        affiliateLinkId_visitorHash_dayKey: {
          affiliateLinkId: link.id,
          visitorHash,
          dayKey,
        },
      },
      create: {
        affiliateLinkId: link.id,
        visitorHash,
        dayKey,
      },
      update: {
        clickCount: { increment: 1 },
        lastClickedAt: now,
      },
    });

    return jsonOk({ tracked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
