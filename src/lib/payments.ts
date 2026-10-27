// BILLOGRAPH — Paiements RÉELS via FedaPay (agrégateur Bénin/Togo).
//
// FedaPay encaisse : MTN MoMo Bénin, Moov Money, Visa / Mastercard — devise XOF natif.
//
// PRINCIPE DE SÉCURITÉ : la confirmation d'un paiement ne passe JAMAIS par le
// client. Elle résulte exclusivement :
//   - d'un webhook FedaPay authentifié (signature HMAC-SHA256 vérifiée sur le
//     corps BRUT, comparaison à temps constant), DOUBLÉ d'une re-vérification
//     directe de la transaction via l'API FedaPay (le statut annoncé par le
//     payload n'est jamais cru sur parole) ;
//   - ou d'un polling serveur (GET de la transaction) déclenché par
//     /api/payments/verify.
// Les deux chemins convergent vers confirmOrderPayment (src/lib/order-confirm.ts),
// source de vérité unique et idempotente.
//
// Aucune clé secrète n'est jamais journalisée, auditée ni renvoyée au client.
import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";

export type FedapayEnvironment = "sandbox" | "live";

// Configuration effective des paiements : variables d'environnement prioritaires
// (déploiement), sinon réglages stockés en base par l'administrateur.
export type PaymentConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  environment: FedapayEnvironment | null;
};

// Ce que le client doit faire après initiation :
// - "redirect" : rediriger vers redirectUrl (page de paiement hébergée FedaPay) ;
// - "free"     : rien à encaisser (produit gratuit, commande déjà confirmée) ;
// - "ussd"     : afficher les instructions (réservé à une évolution).
export type InitiateResult = {
  flow: "redirect" | "free" | "ussd";
  redirectUrl?: string;
  instructions?: string;
  providerRef: string;
};

// Résultat d'une re-vérification serveur d'une transaction.
export type VerifyOutcome = "SUCCESS" | "FAILED" | "PENDING";

export interface PaymentProvider {
  id: string;
  label: string;
  // Crée l'intention de paiement chez le prestataire.
  initiate(params: {
    reference: string; // référence de commande BILLOGRAPH (BLG-XXXXXX)
    amountXOF: number;
    customer: { email: string; name: string; phone?: string | null };
    description: string;
    callbackUrl: string; // page de retour de la SPA après le checkout FedaPay
  }): Promise<InitiateResult>;
  // Re-vérifie l'état RÉEL d'une transaction auprès de l'API du prestataire.
  verifyTransaction(providerRef: string): Promise<{ outcome: VerifyOutcome; rawStatus: string }>;
}

// ---------------------------------------------------------------------------
// Configuration — environnement d'abord, puis PlatformSettings.paymentConfig.
// ---------------------------------------------------------------------------
export async function getPaymentConfig(): Promise<PaymentConfig> {
  // 1) Variables d'environnement (prioritaires si présentes).
  const envKey = process.env.FEDAPAY_SECRET_KEY?.trim() || null;
  if (envKey) {
    const envWebhook = process.env.FEDAPAY_WEBHOOK_SECRET?.trim() || null;
    const rawEnv = process.env.FEDAPAY_ENVIRONMENT?.trim().toLowerCase();
    const environment: FedapayEnvironment | null =
      rawEnv === "live" ? "live" : rawEnv === "sandbox" ? "sandbox" : environmentFromKeyPrefix(envKey);
    return { secretKey: envKey, webhookSecret: envWebhook, environment };
  }

  // 2) Réglages stockés en base (colonne paymentConfig de la ligne "main").
  try {
    const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
    const raw = settings?.paymentConfig;
    if (!raw) return { secretKey: null, webhookSecret: null, environment: null };

    // Parse défensif : un JSON corrompu ne doit jamais faire planter la plateforme.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { secretKey: null, webhookSecret: null, environment: null };
    }
    const obj = parsed as
      | { fedapaySecretKey?: unknown; fedapayWebhookSecret?: unknown; fedapayEnvironment?: unknown }
      | null;
    const asCleanString = (value: unknown): string | null =>
      typeof value === "string" && value.trim() ? value.trim() : null;

    const secretKey = asCleanString(obj?.fedapaySecretKey);
    const webhookSecret = asCleanString(obj?.fedapayWebhookSecret);
    const rawEnvironment = asCleanString(obj?.fedapayEnvironment)?.toLowerCase() ?? null;
    const environment: FedapayEnvironment | null =
      rawEnvironment === "live" ? "live" : rawEnvironment === "sandbox" ? "sandbox" : environmentFromKeyPrefix(secretKey);
    return { secretKey, webhookSecret, environment };
  } catch (err) {
    console.error(
      "[payments] lecture de la configuration en base impossible:",
      err instanceof Error ? err.message : err,
    );
    return { secretKey: null, webhookSecret: null, environment: null };
  }
}

// Déduit l'environnement du préfixe de clé FedaPay (sk_live_… / sk_sandbox_…).
function environmentFromKeyPrefix(secretKey: string | null): FedapayEnvironment | null {
  if (!secretKey) return null;
  if (secretKey.startsWith("sk_live_")) return "live";
  if (secretKey.startsWith("sk_sandbox_")) return "sandbox";
  return null;
}

// Les paiements sont opérationnels dès qu'une clé secrète est disponible.
export function isPaymentsConfigured(config: PaymentConfig): boolean {
  return typeof config.secretKey === "string" && config.secretKey.length > 0;
}

// Origin public utilisé pour les URLs de callback et de webhook — la plus
// fiable possible, pour ne JAMAIS produire de lien http:// derrière un proxy
// qui termine le TLS en amont :
//  1. APP_URL (déploiement) ;
//  2. en-tête Origin du navigateur (vrai schéma vu par l'utilisateur) ;
//  3. en-tête Referer (origine de la page réellement affichée : reflète l'URL
//     PUBLIQUE https quand des intermédiaires réécrivent Host/Proto) ;
//  4. x-forwarded-host (+ https systématique pour tout hôte non local — les
//     navigateurs récents en mode « connexions sécurisées » bloquent les
//     liens http:// derrière un interstitiel) ;
//  5. repli : origin de l'URL de la requête.
export function publicOrigin(req: Request): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      // Valeur invalide → on continue avec les sources suivantes.
    }
  }
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
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  if (host) {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/.test(host);
    return isLocal ? `http://${host}` : `https://${host}`;
  }
  return new URL(req.url).origin;
}

// ---------------------------------------------------------------------------
// Appels HTTP vers l'API FedaPay (timeout 20 s, parse défensif).
// ---------------------------------------------------------------------------
const FEDAPAY_API_BASE_URLS: Record<FedapayEnvironment, string> = {
  sandbox: "https://sandbox-api.fedapay.com",
  live: "https://api.fedapay.com",
};

const FEDAPAY_CHECKOUT_BASE_URLS: Record<FedapayEnvironment, string> = {
  sandbox: "https://sandbox-checkout.fedapay.com/",
  live: "https://checkout.fedapay.com/",
};

const FEDAPAY_TIMEOUT_MS = 20_000;

async function fedapayRequest(params: {
  secretKey: string;
  environment: FedapayEnvironment;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  failMessage: string; // message français renvoyé au client en cas d'erreur réseau/HTTP
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEDAPAY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${FEDAPAY_API_BASE_URLS[params.environment]}${params.path}`, {
      method: params.method,
      headers: {
        // La clé secrète ne vit que dans cet en-tête — jamais journalisée.
        Authorization: `Bearer ${params.secretKey}`,
        "Content-Type": "application/json",
      },
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[fedapay] réseau/timeout sur ${params.path}: ${detail.slice(0, 300)}`);
    throw new HttpError(502, params.failMessage);
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    // Détails tronqués en console uniquement (le corps de réponse FedaPay ne
    // contient pas nos secrets) — message générique côté client.
    console.error(`[fedapay] HTTP ${res.status} sur ${params.path}: ${rawText.slice(0, 500)}`);
    throw new HttpError(502, params.failMessage);
  }
  return parsed;
}

// Mapping défensif des statuts de transaction FedaPay.
function mapFedapayStatus(rawStatus: string): VerifyOutcome {
  const status = rawStatus.trim().toLowerCase();
  if (status === "approved") return "SUCCESS";
  if (status === "declined" || status === "canceled") return "FAILED";
  // pending, transient, draft, needs_rules_creation, referred… → en attente.
  return "PENDING";
}

// ---------------------------------------------------------------------------
// Provider FedaPay.
// ---------------------------------------------------------------------------
export function createFedapayProvider(config: {
  secretKey: string;
  environment: FedapayEnvironment;
}): PaymentProvider {
  const { secretKey, environment } = config;

  return {
    id: "FEDAPAY",
    label: "Mobile Money & Carte bancaire (FedaPay)",

    async initiate({ reference, amountXOF, customer, description, callbackUrl }) {
      // FedaPay exige firstname / lastname : premier mot = prénom, reste = nom.
      const parts = customer.name.trim().split(/\s+/).filter(Boolean);
      const firstname = parts[0] || "Client";
      const lastname = parts.slice(1).join(" ") || "Client";

      const payload = {
        description,
        amount: amountXOF,
        currency: { iso: "XOF" },
        callback_url: callbackUrl,
        // custom_data est renvoyé par FedaPay : on y glisse la référence pour
        // retrouver la commande, même si la recherche par providerRef échoue.
        custom_data: JSON.stringify({ reference }),
        customer: {
          firstname,
          lastname,
          email: customer.email,
          // phone_number uniquement si un téléphone a été fourni.
          ...(customer.phone ? { phone_number: { number: customer.phone, country: "BJ" } } : {}),
        },
      };

      const data = await fedapayRequest({
        secretKey,
        environment,
        method: "POST",
        path: "/v1/transactions",
        body: payload,
        failMessage:
          "Le prestataire de paiement n'a pas pu créer la transaction. Vérifiez la configuration FedaPay.",
      });

      // Parse défensif — la forme de réponse peut varier légèrement selon les
      // versions d'API : on attend { status, transaction: { id, token } }.
      const transaction = (data as { transaction?: { id?: unknown; token?: unknown } } | null)?.transaction;
      const id =
        typeof transaction?.id === "number" || typeof transaction?.id === "string"
          ? String(transaction.id)
          : null;
      const token = typeof transaction?.token === "string" && transaction.token ? transaction.token : null;
      if (!id || !token) {
        console.error("[fedapay] réponse /v1/transactions sans transaction.id/token exploitable");
        throw new HttpError(
          502,
          "Le prestataire de paiement n'a pas pu créer la transaction. Vérifiez la configuration FedaPay.",
        );
      }

      return {
        flow: "redirect",
        redirectUrl: `${FEDAPAY_CHECKOUT_BASE_URLS[environment]}${token}?locale=fr`,
        providerRef: id,
      };
    },

    async verifyTransaction(providerRef) {
      const data = await fedapayRequest({
        secretKey,
        environment,
        method: "GET",
        path: `/v1/transactions/${encodeURIComponent(providerRef)}`,
        failMessage: "Vérification du paiement impossible pour le moment",
      });

      // Parse défensif : { transaction: { status } } ou { entity: { status } }
      // selon les versions de l'API.
      const obj = data as { transaction?: { status?: unknown }; entity?: { status?: unknown } } | null;
      const rawStatus =
        typeof obj?.transaction?.status === "string"
          ? obj.transaction.status
          : typeof obj?.entity?.status === "string"
            ? obj.entity.status
            : "";

      return { outcome: mapFedapayStatus(rawStatus), rawStatus };
    },
  };
}

// ---------------------------------------------------------------------------
// Vérification des webhooks FedaPay — HMAC-SHA256 sur le corps BRUT.
// ---------------------------------------------------------------------------
function timingSafeHexEqual(expectedHex: string, provided: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// En-tête "x-fedapay-signature", format type Stripe : "t=<timestamp>,s=<hex>".
// Plusieurs paires peuvent être présentes (séparées par espaces/virgules) :
// on retient la DERNIÈRE valeur de chaque clé. Repli : HMAC hex simple du corps
// brut seul (anciennes versions). Comparaison toujours à temps constant.
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  webhookSecret: string | null,
): boolean {
  if (!webhookSecret || !header) return false;

  let timestamp: string | null = null;
  let signature: string | null = null;
  let hasPairs = false;
  for (const part of header.split(/[,\s]+/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    hasPairs = true;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "s") signature = value;
  }

  if (hasPairs && timestamp && signature) {
    const expected = createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    return timingSafeHexEqual(expected, signature);
  }

  // Repli : signature simple = HMAC-SHA256 du corps brut seul.
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return timingSafeHexEqual(expected, header.trim());
}

// ---------------------------------------------------------------------------
// Registre des prestataires — FedaPay est l'unique moyen d'encaissement réel.
// Retourne null si la configuration est absente : les routes répondent alors
// 422 avec un message d'activation explicite.
// ---------------------------------------------------------------------------
export async function getProvider(id: string): Promise<PaymentProvider | null> {
  if (id !== "FEDAPAY") return null;
  const config = await getPaymentConfig();
  if (!isPaymentsConfigured(config) || !config.secretKey) return null;
  return createFedapayProvider({
    secretKey: config.secretKey,
    // Environnement non précisé + clé sans préfixe reconnu → API réelle
    // (les clés FedaPay préfixées sk_sandbox_/sk_live_ lèvent l'ambiguïté).
    environment: config.environment ?? "live",
  });
}
