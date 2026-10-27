// GET  /api/admin/settings — paramètres plateforme complets + état FedaPay (ADMIN requis).
// PATCH /api/admin/settings — mise à jour partielle : commission, identité du
// site, textes de la page d'accueil, titres de sections, contact, réseaux
// sociaux, pied de page, présentation de l'auteur, mode de publication des
// avis et configuration FedaPay.
//
// SÉCURITÉ : les valeurs des secrets ne sont JAMAIS renvoyées en clair (uniquement
// des versions masquées) ni écrites dans l'audit (seulement la liste des champs
// modifiés). Le merge est conservé dans PlatformSettings.paymentConfig (JSON).
// CONTENU DU SITE : les champs texte null/vides = retour aux valeurs par défaut
// (src/lib/site-content.ts). Après chaque PATCH, le frontend invalide la requête
// « site-settings » → synchronisation immédiate sur tout le site.
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { adminSettingsUpdateSchema } from "@/lib/validation";
import { getPaymentConfig, isPaymentsConfigured, publicOrigin } from "@/lib/payments";
import { logAudit } from "@/lib/audit";

// Configuration FedaPay telle que stockée en base.
type StoredPaymentConfig = {
  fedapaySecretKey?: string | null;
  fedapayWebhookSecret?: string | null;
  fedapayEnvironment?: string | null;
};

// La ligne de paramètres "main" est créée par défaut si absente.
async function getOrCreateSettings() {
  return db.platformSettings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
}

// Masquage d'un secret : préfixe reconnu (ex: sk_sandbox_) + "••••" + 4 derniers
// caractères. Trop court → entièrement masqué.
function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length < 8) return "••••";
  const prefix = value.match(/^[A-Za-z]+_[A-Za-z]+_/)?.[0] ?? "";
  return `${prefix}••••${value.slice(-4)}`;
}

// Champs de contenu modifiables (textes nullables du site).
const CONTENT_FIELDS = [
  "siteTagline",
  "heroTitle",
  "heroSubtitle",
  "featuresTitle",
  "featuresSubtitle",
  "audienceTitle",
  "audienceSubtitle",
  "reviewsTitle",
  "reviewsSubtitle",
  "ctaTitle",
  "ctaText",
  "contactEmail",
  "contactPhone",
  "whatsappNumber",
  "socialFacebook",
  "socialInstagram",
  "socialTiktok",
  "socialYoutube",
  "socialTwitter",
  "footerText",
  // Présentation de l'auteur du site (page d'accueil + pied de page).
  "authorName",
  "authorRole",
  "authorBio",
] as const;

// Réponse commune GET/PATCH — valeurs brutes (null = défaut) + état paiements,
// jamais de secret en clair.
async function settingsResponse(req: Request) {
  const settings = await getOrCreateSettings();
  const config = await getPaymentConfig();
  const configured = isPaymentsConfigured(config);

  const content = Object.fromEntries(CONTENT_FIELDS.map((f) => [f, settings[f]]));

  return jsonOk({
    settings: {
      commissionPercent: settings.commissionPercent,
      siteName: settings.siteName,
      reviewsAutoPublish: settings.reviewsAutoPublish,
      ...content,
    },
    payments: {
      provider: "FEDAPAY" as const,
      configured,
      environment: config.environment,
      secretKeyMasked: maskSecret(config.secretKey),
      webhookSecretMasked: maskSecret(config.webhookSecret),
      webhookUrl: `${publicOrigin(req)}/api/webhooks/payment`,
    },
  });
}

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");
    return await settingsResponse(req);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = adminSettingsUpdateSchema.parse(await readJson(req));

    const settings = await getOrCreateSettings();

    // Configuration FedaPay stockée en base — parse défensif (JSON corrompu → {}).
    let stored: StoredPaymentConfig = {};
    if (settings.paymentConfig) {
      try {
        stored = JSON.parse(settings.paymentConfig) as StoredPaymentConfig;
      } catch {
        stored = {};
      }
    }

    const updatedFields: string[] = [];

    // Champs simples (identité, commission, avis).
    if (body.commissionPercent !== undefined) updatedFields.push("commissionPercent");
    if (body.siteName !== undefined) updatedFields.push("siteName");
    if (body.reviewsAutoPublish !== undefined) updatedFields.push("reviewsAutoPublish");

    // Champs de contenu (null = retour à la valeur par défaut).
    for (const field of CONTENT_FIELDS) {
      if (body[field] !== undefined) updatedFields.push(field);
    }

    if (body.fedapaySecretKey !== undefined) {
      // null ou chaîne vide → efface la clé stockée ; sinon → remplace.
      stored.fedapaySecretKey = body.fedapaySecretKey ? body.fedapaySecretKey : null;
      updatedFields.push("fedapaySecretKey");
    }
    if (body.fedapayWebhookSecret !== undefined) {
      stored.fedapayWebhookSecret = body.fedapayWebhookSecret ? body.fedapayWebhookSecret : null;
      updatedFields.push("fedapayWebhookSecret");
    }
    if (body.fedapayEnvironment !== undefined) {
      // null → efface l'environnement stocké.
      stored.fedapayEnvironment = body.fedapayEnvironment ?? null;
      updatedFields.push("fedapayEnvironment");
    }

    await db.platformSettings.update({
      where: { id: settings.id },
      data: {
        ...(body.commissionPercent !== undefined ? { commissionPercent: body.commissionPercent } : {}),
        ...(body.siteName !== undefined ? { siteName: body.siteName } : {}),
        ...(body.reviewsAutoPublish !== undefined
          ? { reviewsAutoPublish: body.reviewsAutoPublish }
          : {}),
        ...Object.fromEntries(
          CONTENT_FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]),
        ),
        paymentConfig: JSON.stringify(stored),
      },
    });

    // Audit SANS aucune valeur de secret — uniquement la liste des champs modifiés.
    await logAudit({
      actorUserId: admin.id,
      action: "SETTINGS_UPDATED",
      entity: "PlatformSettings",
      entityId: settings.id,
      metadata: { updated: updatedFields },
    });

    return await settingsResponse(req);
  } catch (err) {
    return handleApiError(err);
  }
}
