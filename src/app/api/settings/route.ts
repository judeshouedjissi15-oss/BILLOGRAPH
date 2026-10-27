// GET /api/settings — PUBLIC. Contenu modifiable du site (identité, textes
// d'accueil, titres de sections, contact, réseaux sociaux, pied de page,
// présentation de l'auteur, commission, mode de publication des avis).
// - AUCUNE donnée sensible (pas de paymentConfig, pas de secrets).
// - Les textes null en base sont remplacés par les valeurs par défaut du code
//   (src/lib/site-content.ts) : le frontend reçoit toujours un contenu complet.
// - Ce endpoint est interrogé en continu par le frontend (polling + focus) :
//   toute modification faite dans Paramètres se synchronise automatiquement
//   sur tout le site, sans rechargement.
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { COMMISSION_DEFAULT, SITE_DEFAULTS } from "@/lib/site-content";

export async function GET() {
  try {
    const s = await db.platformSettings.findUnique({ where: { id: "main" } });

    return jsonOk({
      siteName: s?.siteName?.trim() || SITE_DEFAULTS.siteName,
      commissionPercent: s?.commissionPercent ?? COMMISSION_DEFAULT,
      siteTagline: s?.siteTagline ?? SITE_DEFAULTS.siteTagline,
      heroTitle: s?.heroTitle ?? SITE_DEFAULTS.heroTitle,
      heroSubtitle: s?.heroSubtitle ?? SITE_DEFAULTS.heroSubtitle,
      featuresTitle: s?.featuresTitle ?? SITE_DEFAULTS.featuresTitle,
      featuresSubtitle: s?.featuresSubtitle ?? SITE_DEFAULTS.featuresSubtitle,
      audienceTitle: s?.audienceTitle ?? SITE_DEFAULTS.audienceTitle,
      audienceSubtitle: s?.audienceSubtitle ?? SITE_DEFAULTS.audienceSubtitle,
      reviewsTitle: s?.reviewsTitle ?? SITE_DEFAULTS.reviewsTitle,
      reviewsSubtitle: s?.reviewsSubtitle ?? SITE_DEFAULTS.reviewsSubtitle,
      ctaTitle: s?.ctaTitle ?? SITE_DEFAULTS.ctaTitle,
      ctaText: s?.ctaText ?? SITE_DEFAULTS.ctaText,
      contactEmail: s?.contactEmail ?? null,
      contactPhone: s?.contactPhone ?? null,
      whatsappNumber: s?.whatsappNumber ?? null,
      socialFacebook: s?.socialFacebook ?? null,
      socialInstagram: s?.socialInstagram ?? null,
      socialTiktok: s?.socialTiktok ?? null,
      socialYoutube: s?.socialYoutube ?? null,
      socialTwitter: s?.socialTwitter ?? null,
      footerText: s?.footerText ?? SITE_DEFAULTS.footerText,
      authorName: s?.authorName?.trim() || SITE_DEFAULTS.authorName,
      authorRole: s?.authorRole?.trim() || SITE_DEFAULTS.authorRole,
      authorBio: s?.authorBio?.trim() || SITE_DEFAULTS.authorBio,
      reviewsAutoPublish: s?.reviewsAutoPublish ?? false,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
