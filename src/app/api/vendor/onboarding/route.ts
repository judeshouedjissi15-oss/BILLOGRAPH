import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { sellerOnboardingResponsesSchema } from "@/lib/seller-onboarding";
import { rateLimit } from "@/lib/rate-limit";

const saveSchema = z.object({
  currentStep: z.number().int().min(0).max(7),
  responses: sellerOnboardingResponsesSchema,
});

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await db.sellerOnboarding.findUnique({ where: { userId: user.id } });
    let responses = {};
    if (profile) {
      try {
        responses = sellerOnboardingResponsesSchema.parse(JSON.parse(profile.responses));
      } catch {
        console.error("[seller-onboarding] brouillon invalide pour l'utilisateur", user.id);
        throw new HttpError(500, "Le brouillon du questionnaire est illisible. Contactez l'assistance.");
      }
    }

    return jsonOk({
      currentStep: profile?.currentStep ?? 0,
      completed: Boolean(profile?.completedAt),
      responses,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    rateLimit(`seller-onboarding:${user.id}`, 30, 60_000);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 40_000) {
      throw new HttpError(413, "Le brouillon dépasse la taille maximale autorisée.");
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new HttpError(422, "Données du questionnaire invalides.");
    }
    const data = saveSchema.parse(body);
    const serialized = JSON.stringify(data.responses);
    if (new TextEncoder().encode(serialized).byteLength > 30_000) {
      throw new HttpError(413, "Le brouillon dépasse la taille maximale autorisée.");
    }

    const profile = await db.sellerOnboarding.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        responses: serialized,
        currentStep: data.currentStep,
      },
      update: {
        responses: serialized,
        currentStep: data.currentStep,
      },
      select: { currentStep: true, updatedAt: true },
    });
    return jsonOk({ saved: true, currentStep: profile.currentStep, updatedAt: profile.updatedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
