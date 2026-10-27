// ADMIN — CONFIGURATION DU SERVICE D'ENVOI D'EMAILS (réel).
//  GET   /api/admin/smtp  → état masqué (jamais la clé API ni le mot de passe)
//  PATCH /api/admin/smtp  → enregistrement (fournisseur « brevo » ou « smtp »)
// Le test d'envoi réel est dans /api/admin/smtp/test. Toute mutation est
// auditée ; les secrets n'apparaissent JAMAIS en clair (réponse, logs, audit).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireRole } from "@/lib/auth";
import { emailConfigSchema } from "@/lib/validation";
import {
  getSmtpConfig,
  saveSmtpConfig,
  getBrevoConfig,
  saveBrevoConfig,
  maskBrevoKey,
} from "@/lib/smtp";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<Record<string, string>> };

export async function GET(_req: Request, _ctx: RouteContext) {
  try {
    await requireRole("ADMIN");

    const [smtp, brevo, settings] = await Promise.all([
      getSmtpConfig(),
      getBrevoConfig(),
      db.platformSettings.findUnique({ where: { id: "main" } }),
    ]);

    // Le mot de passe SMTP est « configuré » si un fournisseur SMTP complet
    // existe ; la clé Brevo si un service Brevo actif existe.
    const stored = settings?.smtpConfig ? JSON.parse(settings.smtpConfig) : null;

    return jsonOk({
      provider: brevo ? ("brevo" as const) : ("smtp" as const),
      configured: smtp !== null || brevo !== null,
      // État Brevo (clé masquée, jamais renvoyée en clair).
      brevo: {
        configured: brevo !== null,
        apiKeySet: Boolean(stored?.brevoApiKeyEncrypted),
        apiKeyMasked: brevo ? maskBrevoKey(brevo.apiKey) : "",
        fromName: brevo?.fromName ?? "BILLOGRAPH",
        fromEmail: brevo?.fromEmail ?? "",
      },
      // État SMTP générique (contrat historique conservé).
      host: smtp?.host ?? "",
      port: smtp?.port ?? 587,
      secure: smtp?.secure ?? false,
      user: smtp?.user ?? "",
      fromName: smtp?.fromName ?? "",
      fromEmail: smtp?.fromEmail ?? "",
      passwordSet: smtp !== null,
      siteUrl: settings?.siteUrl ?? "",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireRole("ADMIN");
    const body = emailConfigSchema.parse(await readJson(req));

    if ("provider" in body && body.provider === "brevo") {
      // ── Fournisseur Brevo (API transactionnelle) ────────────────────────
      const existing = await getBrevoConfig();
      if ((!body.brevoApiKey || body.brevoApiKey === "") && !existing) {
        throw new HttpError(422, "La clé API Brevo est requise lors de la première configuration.");
      }

      await saveBrevoConfig({
        apiKey: body.brevoApiKey && body.brevoApiKey !== "" ? body.brevoApiKey : null,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
        siteUrl: body.siteUrl ?? "",
      });

      await logAudit({
        actorUserId: admin.id,
        action: "BREVO_CONFIG_UPDATED",
        entity: "PlatformSettings",
        entityId: "main",
        // NB : la clé API n'est JAMAIS journalisée.
        metadata: { provider: "brevo", fromEmail: body.fromEmail },
      });

      return jsonOk({
        ok: true,
        message:
          "Configuration Brevo enregistrée. Utilisez « Envoyer un email de test » pour vérifier réellement l'envoi.",
      });
    }

    // ── Fournisseur SMTP générique ────────────────────────────────────────
    const smtpBody = body as Omit<typeof body, "provider"> & {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password?: string;
      fromName: string;
      fromEmail: string;
      siteUrl?: string;
    };

    if (!smtpBody.password || smtpBody.password === "") {
      // Premier enregistrement sans mot de passe impossible — sauf si un mot
      // de passe SMTP est déjà stocké (retour depuis le mode Brevo).
      const settingsRow = await db.platformSettings.findUnique({ where: { id: "main" } });
      const storedRaw = settingsRow?.smtpConfig
        ? (JSON.parse(settingsRow.smtpConfig) as { passEncrypted?: string })
        : null;
      if (!storedRaw?.passEncrypted) {
        throw new HttpError(422, "Le mot de passe SMTP est requis lors de la première configuration.");
      }
    }

    await saveSmtpConfig({
      host: smtpBody.host,
      port: smtpBody.port,
      secure: smtpBody.secure,
      user: smtpBody.user,
      pass: smtpBody.password && smtpBody.password !== "" ? smtpBody.password : null,
      fromName: smtpBody.fromName,
      fromEmail: smtpBody.fromEmail,
      siteUrl: smtpBody.siteUrl ?? "",
    });

    await logAudit({
      actorUserId: admin.id,
      action: "SMTP_CONFIG_UPDATED",
      entity: "PlatformSettings",
      entityId: "main",
      metadata: { provider: "smtp", host: smtpBody.host, port: smtpBody.port, secure: smtpBody.secure, fromEmail: smtpBody.fromEmail },
      // NB : le mot de passe n'est JAMAIS journalisé.
    });

    return jsonOk({
      ok: true,
      message: "Configuration SMTP enregistrée. Utilisez « Envoyer un email de test » pour vérifier.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
