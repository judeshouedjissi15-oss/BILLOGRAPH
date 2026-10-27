import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

// SERVICE D'ENVOI D'EMAILS RÉEL — configuré par l'administrateur dans
// Admin → Paramètres. Deux fournisseurs RÉELS au choix (jamais de simulation) :
//   1. « brevo » — API transactionnelle Brevo (recommandé) : clé API `xkeysib-…`
//      appelée côté serveur (POST https://api.brevo.com/v3/smtp/email).
//   2. « smtp » — serveur SMTP générique (Gmail, Brevo relay, Zoho, hébergeur…).
// La clé API Brevo et le mot de passe SMTP sont stockés CHIFFRÉS
// (AES-256-GCM, voir secret-box.ts) et ne sont JAMAIS renvoyés en clair par
// les API ni journalisés. Si la configuration est absente ou invalide, les
// fonctions échouent avec un message clair (l'inscription publique est alors
// mise en attente — c'est le comportement honnête).

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
};

export type BrevoConfig = {
  apiKey: string;
  fromName: string;
  fromEmail: string;
};

export type EmailProvider = "smtp" | "brevo";

export type EmailServiceConfig =
  | { provider: "smtp"; smtp: SmtpConfig }
  | { provider: "brevo"; brevo: BrevoConfig };

/** Forme brute stockée dans PlatformSettings.smtpConfig (secrets chiffrés). */
type StoredEmailConfig = {
  provider?: EmailProvider;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  passEncrypted?: string;
  fromName?: string;
  fromEmail?: string;
  brevoApiKeyEncrypted?: string;
};

/** Charge la configuration d'envoi brute depuis les réglages (null si absente). */
async function loadStored(): Promise<StoredEmailConfig | null> {
  const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
  if (!settings?.smtpConfig) return null;
  try {
    return JSON.parse(settings.smtpConfig) as StoredEmailConfig;
  } catch {
    // Configuration corrompue ou clé de chiffrement changée → considérée absente.
    return null;
  }
}

/** Écrit la configuration d'envoi en conservant les champs de l'autre fournisseur. */
async function persistStored(next: StoredEmailConfig): Promise<void> {
  await db.platformSettings.upsert({
    where: { id: "main" },
    update: { smtpConfig: JSON.stringify(next) },
    create: { id: "main", smtpConfig: JSON.stringify(next) },
  });
}

/** Configuration SMTP active (null si le service actif est Brevo ou si absent). */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const stored = await loadStored();
  if (!stored || stored.provider === "brevo") return null;
  if (!stored.host || !stored.user || !stored.passEncrypted || !stored.fromEmail) return null;
  try {
    return {
      host: stored.host,
      port: typeof stored.port === "number" && stored.port > 0 ? stored.port : 587,
      secure: stored.secure === true,
      user: stored.user,
      pass: decryptSecret(stored.passEncrypted),
      fromName: stored.fromName || "BILLOGRAPH",
      fromEmail: stored.fromEmail,
    };
  } catch {
    return null;
  }
}

/** Configuration Brevo active (null si le service actif est SMTP ou si absent). */
export async function getBrevoConfig(): Promise<BrevoConfig | null> {
  const stored = await loadStored();
  if (stored && stored.provider === "brevo" && stored.brevoApiKeyEncrypted && stored.fromEmail) {
    try {
      return {
        apiKey: decryptSecret(stored.brevoApiKeyEncrypted),
        fromName: stored.fromName || "BILLOGRAPH",
        fromEmail: stored.fromEmail,
      };
    } catch {
      // Coffre illisible (APP_SECRET changé) → chute vers le filet .env ci-dessous.
    }
  }

  // FILET DE SÉCURITÉ .env : si aucun réglage actif en base (réinitialisation
  // d'environnement, coffre illisible…) mais que l'amorçage Brevo est présent
  // dans l'environnement du serveur, le service reste réellement fonctionnel.
  // La clé ne circule JAMAIS dans les réponses API ni les journaux.
  const envKey = (process.env.BREVO_API_KEY ?? "").trim();
  const envFrom = (process.env.BREVO_FROM_EMAIL ?? "").trim();
  if (envKey.startsWith("xkeysib-") && envFrom) {
    return {
      apiKey: envKey,
      fromName: (process.env.BREVO_FROM_NAME ?? "BILLOGRAPH").trim() || "BILLOGRAPH",
      fromEmail: envFrom,
    };
  }
  return null;
}

/** Service d'envoi ACTIF (quel que soit le fournisseur), null si rien n'est configuré. */
export async function getEmailConfig(): Promise<EmailServiceConfig | null> {
  const brevo = await getBrevoConfig();
  if (brevo) return { provider: "brevo", brevo };
  const smtp = await getSmtpConfig();
  if (smtp) return { provider: "smtp", smtp };
  return null;
}

/** Sauvegarde la configuration SMTP (mot de passe chiffré à l'aide du coffre). */
export async function saveSmtpConfig(
  config: Omit<SmtpConfig, "pass"> & { pass?: string | null; siteUrl?: string | null },
): Promise<void> {
  const stored = await loadStored();
  const passEncrypted =
    config.pass != null && config.pass !== ""
      ? encryptSecret(config.pass)
      : stored?.passEncrypted // conserve le mot de passe existant (champ laissé vide)
        ? stored.passEncrypted
        : null;

  if (!passEncrypted) {
    throw new Error("Aucun mot de passe SMTP fourni (champ requis lors de la première configuration)");
  }

  await persistStored({
    ...stored,
    provider: "smtp",
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    passEncrypted,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
  });

  if (config.siteUrl !== undefined) {
    await db.platformSettings.upsert({
      where: { id: "main" },
      update: { siteUrl: config.siteUrl },
      create: { id: "main", siteUrl: config.siteUrl },
    });
  }
}

/**
 * Sauvegarde la configuration Brevo (clé API chiffrée). `apiKey: null` =
 * conserver la clé existante (champ laissé vide dans l'interface).
 */
export async function saveBrevoConfig(config: {
  apiKey?: string | null;
  fromName: string;
  fromEmail: string;
  siteUrl?: string | null;
}): Promise<void> {
  const stored = await loadStored();
  const brevoApiKeyEncrypted =
    config.apiKey != null && config.apiKey !== ""
      ? encryptSecret(config.apiKey)
      : stored?.brevoApiKeyEncrypted
        ? stored.brevoApiKeyEncrypted
        : null;

  if (!brevoApiKeyEncrypted) {
    throw new Error("Aucune clé API Brevo fournie (champ requis lors de la première configuration)");
  }

  await persistStored({
    ...stored,
    provider: "brevo",
    brevoApiKeyEncrypted,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
  });

  if (config.siteUrl !== undefined) {
    await db.platformSettings.upsert({
      where: { id: "main" },
      update: { siteUrl: config.siteUrl },
      create: { id: "main", siteUrl: config.siteUrl },
    });
  }
}

function transport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // Délais stricts : un SMTP injoignable échoue vite et lisiblement.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

/** Envoi RÉEL via l'API transactionnelle Brevo (timeout 15 s, erreurs explicites). */
async function sendViaBrevo(config: BrevoConfig, email: OutgoingEmail): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: config.fromName, email: config.fromEmail },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      "Impossible de joindre l'API Brevo (réseau ou délai dépassé). Réessayez.",
    );
  }

  if (!response.ok) {
    // Le message d'erreur Brevo n'expose jamais la clé API — on peut le montrer.
    let detail = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string; code?: string };
      if (data?.message) detail = `${detail} — ${data.message}`;
      else if (data?.code) detail = `${detail} — ${data.code}`;
    } catch {
      // réponse non JSON : on garde le statut seul
    }
    throw new Error(
      `Brevo a refusé l'envoi (${detail}). Vérifiez la clé API, le quota du plan et l'expéditeur validé dans Brevo.`,
    );
  }
}

/**
 * Envoi RÉEL via le service actif (Brevo API ou SMTP). Lève une erreur
 * explicite si rien n'est configuré ou si le fournisseur refuse.
 */
export async function sendRealEmail(email: OutgoingEmail): Promise<void> {
  const config = await getEmailConfig();
  if (!config) {
    throw new Error(
      "L'envoi d'emails n'est pas encore configuré par la plateforme (aucun service actif).",
    );
  }

  if (config.provider === "brevo") {
    await sendViaBrevo(config.brevo, email);
    return;
  }

  const transporter = transport(config.smtp);
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } finally {
    transporter.close();
  }
}

/** Masque une clé API Brevo pour affichage admin : « xkeysib-••••abcd ». */
export function maskBrevoKey(apiKey: string): string {
  const last4 = apiKey.slice(-4);
  return `xkeysib-••••${last4}`;
}

/**
 * Origine publique pour les liens des emails — la plus fiable possible :
 *  1. siteUrl (réglages admin) — la source de vérité (production ET aperçu) ;
 *  2. en-tête Origin du navigateur (vrai schéma, même quand le TLS est terminé
 *     en amont — évite tout lien http:// accidentel) ;
 *  3. en-tête Referer (origine de la page réellement affichée : reflète l'URL
 *     PUBLIQUE https quand des intermédiaires réécrivent Host/Proto) ;
 *  4. x-forwarded-host + x-forwarded-proto, avec https préféré pour tout hôte
 *     non local (les navigateurs récents en mode « connexions sécurisées »
 *     affichent un interstitiel bloquant sur tout lien http:// — un lien
 *     https:// est toujours le meilleur choix hors développement local) ;
 *  5. repli : hôte de la requête (http uniquement pour localhost).
 */
export function buildOrigin(req: Request, siteUrl: string | null): string {
  if (siteUrl && siteUrl.startsWith("http")) return siteUrl.replace(/\/+$/, "");

  for (const header of ["origin", "referer"] as const) {
    const raw = req.headers.get(header);
    if (raw && /^https?:\/\//.test(raw)) {
      try {
        return new URL(raw.trim()).origin;
      } catch {
        // En-tête invalide → source suivante.
      }
    }
  }

  const host = (
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000"
  )
    .split(",")[0]
    .trim();
  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/.test(host);
  if (isLocal) return `http://${host}`;
  // Hôte public : https systématique (le schéma interne http d'un proxy sans
  // TLS ne doit jamais fuiter dans un lien qu'un navigateur extérieur ouvre).
  return `https://${host}`;
}

/** Gabarit d'email BILLOGRAPH (HTML sobre + texte brut). */
export function brandedEmail(title: string, bodyHtml: string, footerNote?: string): { html: string; text: string } {
  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 32px 8px 32px;text-align:center;">
          <div style="font-size:20px;font-weight:bold;letter-spacing:1px;color:#063bb6;">BILLO<span style="color:#09c237;">GRAPH</span></div>
        </td></tr>
        <tr><td style="padding:12px 32px 24px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:19px;color:#111827;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px 28px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
            ${footerNote ?? "Si vous n'êtes pas à l'origine de cette action, ignorez cet email — aucun compte ne sera affecté."}<br/>
            Cet email a été envoyé automatiquement par BILLOGRAPH — la plateforme e-commerce des entrepreneurs d'Afrique francophone.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Texte brut : on extrait grossièrement le contenu utile.
  const text = `${title}\n\n${bodyHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim()}\n\n— BILLOGRAPH\n${footerNote ?? ""}`;

  return { html, text };
}

/**
 * Email de confirmation d'inscription — contient LE CODE À 6 CHIFFRES
 * (méthode principale : l'utilisateur le saisit dans l'application ; à succès,
 * le compte est confirmé et la session est ouverte automatiquement) et le
 * lien de confirmation (secours : confirme le compte et connecte aussi).
 */
export function verificationEmailContent(
  userName: string,
  verifyUrl: string,
  code: string,
): { subject: string; html: string; text: string } {
  const { html, text } = brandedEmail(
    `Bienvenue ${userName} — confirmez votre adresse email`,
    `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.7;">
       Merci de votre inscription sur BILLOGRAPH ! Pour activer votre compte,
       saisissez ce code de confirmation dans l'application :
     </p>
     <p style="margin:0 0 20px 0;text-align:center;">
       <span style="display:inline-block;background:#eef2ff;border:2px dashed #063bb6;
                    border-radius:12px;padding:14px 26px;font-size:34px;font-weight:bold;
                    letter-spacing:10px;color:#063bb6;">${code}</span>
     </p>
     <p style="margin:0 0 20px 0;font-size:13px;color:#374151;text-align:center;">
       Sur la page de confirmation, entrez ces <strong>6 chiffres</strong> — votre compte
       sera activé et vous serez redirigé automatiquement vers votre tableau de bord.<br/>
       <span style="color:#6b7280;font-size:12px;">Ce code est valable 15 minutes.</span>
     </p>
     <p style="margin:0 0 6px 0;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;padding-top:14px;">
       Vous préférez confirmer en un clic&nbsp;? Ce bouton confirme votre adresse
       et vous connecte directement :
     </p>
     <p style="margin:0 0 20px 0;text-align:center;">
       <a href="${verifyUrl}"
          style="display:inline-block;background:#063bb6;color:#ffffff;text-decoration:none;
                 font-weight:bold;font-size:14px;padding:13px 28px;border-radius:8px;">
         Confirmer mon adresse email
       </a>
     </p>
     <p style="margin:0 0 6px 0;font-size:13px;color:#374151;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>
     <p style="margin:0;font-size:12px;word-break:break-all;color:#6b7280;">${verifyUrl}</p>
     <p style="margin:14px 0 0 0;font-size:12px;color:#6b7280;">Ce lien est valable 24 heures.</p>`,
    "Vous recevez cet email parce qu'un compte a été créé avec cette adresse sur BILLOGRAPH. Si ce n'était pas vous, ignorez cet email — aucun compte ne sera affecté.",
  );

  return {
    subject: "Votre code de confirmation BILLOGRAPH",
    html,
    text,
  };
}
