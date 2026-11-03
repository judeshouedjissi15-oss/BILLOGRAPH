// GET /api/stores/mine — Boutique de l'utilisateur connecté, { store: null } si aucune.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { parseStoreFaqs } from "@/lib/store-faq";

export async function GET() {
  try {
    const user = await requireUser();
    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    return jsonOk({
      store: store
        ? {
            id: store.id,
            name: store.name,
            slug: store.slug,
            description: store.description,
            color: store.color,
            phone: store.phone,
            faqs: parseStoreFaqs(store.faqs),
            deliveryInfo: store.deliveryInfo,
            returnPolicy: store.returnPolicy,
            trustMessage: store.trustMessage,
            status: store.status,
            createdAt: store.createdAt,
          }
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
