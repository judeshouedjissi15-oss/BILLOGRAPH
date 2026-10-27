import "server-only";
import { randomBytes } from "crypto";

// BILLOGRAPH — TESTS DE CONNEXION RÉELS des comptes de paiement connectés.
//
// Chaque test appelle VRAIMENT l'API publique du prestataire avec les
// identifiants enregistrés (endpoint de lecture ou OAuth, jamais une
// transaction facturable) et rapporte le résultat réel. Aucun secret n'est
// journalisé : les messages de diagnostic contiennent au maximum le code HTTP
// et la raison générique renvoyée par le prestataire.
//
// Un test « api » indisponible côté réseau renvoie FAILED (pas de simulation).

export type ProviderTestResult = {
  ok: boolean;
  /** Message de diagnostic sûr (sans secrets) destiné à l'affichage admin. */
  message: string;
};

const TIMEOUT_MS = 15_000;

async function apiRequest(params: {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  failLabel: string; // nom du prestataire pour le message
}): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[payment-test] réseau/timeout ${params.url}: ${detail.slice(0, 200)}`);
    throw new Error(`Impossible de joindre l'API ${params.failLabel} (réseau ou délai dépassé).`);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.text().catch(() => "");
  return { status: res.status, body };
}

function ok(message: string): ProviderTestResult {
  return { ok: true, message };
}

function failed(message: string): ProviderTestResult {
  return { ok: false, message };
}

// Première « raison » lisible dans une réponse d'erreur (tronquée, sans echo
// des identifiants) pour faciliter le diagnostic.
function errorReason(body: string, max = 160): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : "aucun détail";
}

type Credentials = Record<string, string>;

// ---------------------------------------------------------------------------
// Implémentations par prestataire (une par clé du catalogue).
// ---------------------------------------------------------------------------
type ProviderTest = (credentials: Credentials, environment: string | null) => Promise<ProviderTestResult>;

const stripeTest: ProviderTest = async (c) => {
  const key = c.secretKey?.trim();
  if (!key) return failed("Clé secrète manquante.");
  const { status, body } = await apiRequest({
    url: "https://api.stripe.com/v1/balance",
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    failLabel: "Stripe",
  });
  if (status === 200) return ok("Clé Stripe valide — solde du compte accessible.");
  if (status === 401) return failed("Clé Stripe refusée (401) : vérifiez la clé secrète.");
  return failed(`Réponse inattendue de Stripe (HTTP ${status}) : ${errorReason(body)}`);
};

const paypalTest: ProviderTest = async (c, environment) => {
  const clientId = c.clientId?.trim();
  const secret = c.clientSecret?.trim();
  if (!clientId || !secret) return failed("Client ID / Client secret manquants.");
  const base =
    environment === "LIVE" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const { status, body } = await apiRequest({
    url: `${base}/v1/oauth2/token`,
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    failLabel: "PayPal",
  });
  if (status === 200) return ok("Identifiants PayPal valides — jeton OAuth obtenu.");
  if (status === 401) return failed("PayPal a refusé les identifiants (401) : vérifiez Client ID / secret.");
  return failed(`Réponse inattendue de PayPal (HTTP ${status}) : ${errorReason(body)}`);
};

const paystackTest: ProviderTest = async (c) => {
  const key = c.secretKey?.trim();
  if (!key) return failed("Clé secrète manquante.");
  const { status, body } = await apiRequest({
    url: "https://api.paystack.co/transaction?perPage=1",
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    failLabel: "Paystack",
  });
  if (status === 200) return ok("Clé Paystack valide — accès API confirmé.");
  if (status === 401) return failed("Clé Paystack refusée (401) : vérifiez la clé secrète.");
  return failed(`Réponse inattendue de Paystack (HTTP ${status}) : ${errorReason(body)}`);
};

const flutterwaveTest: ProviderTest = async (c) => {
  const key = c.secretKey?.trim();
  if (!key) return failed("Clé secrète manquante.");
  const { status, body } = await apiRequest({
    url: "https://api.flutterwave.com/v3/transactions?limit=1",
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    failLabel: "Flutterwave",
  });
  if (status === 200) return ok("Clé Flutterwave valide — accès API confirmé.");
  if (status === 401) return failed("Flutterwave a refusé la clé (401) : vérifiez la clé secrète.");
  return failed(`Réponse inattendue de Flutterwave (HTTP ${status}) : ${errorReason(body)}`);
};

const waveTest: ProviderTest = async (c) => {
  const key = c.apiKey?.trim();
  if (!key) return failed("Clé API manquante.");
  const { status, body } = await apiRequest({
    url: "https://api.wave.com/v1/checkout/sessions?limit=1",
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    failLabel: "Wave",
  });
  if (status === 200) return ok("Clé Wave valide — accès API confirmé.");
  if (status === 401) return failed("Clé Wave refusée (401) : vérifiez la clé API.");
  return failed(`Réponse inattendue de Wave (HTTP ${status}) : ${errorReason(body)}`);
};

const mtnMomoTest: ProviderTest = async (c, environment) => {
  const subKey = c.subscriptionKey?.trim();
  const apiUser = c.apiUserId?.trim();
  const apiKey = c.apiKey?.trim();
  if (!subKey || !apiUser || !apiKey) return failed("Clé d'abonnement, API User ID ou clé API manquante.");
  const base =
    environment === "LIVE" ? "https://proxy.momoapi.mtn.com" : "https://sandbox.momodeveloper.mtn.com";
  const { status, body } = await apiRequest({
    url: `${base}/collection/token/`,
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": subKey,
      Authorization: `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString("base64")}`,
    },
    body: "",
    failLabel: "MTN MoMo",
  });
  if (status === 200) return ok("Identifiants MTN MoMo valides — jeton d'accès obtenu.");
  if (status === 401) return failed("MTN MoMo a refusé les identifiants (401) : vérifiez API User / clé API.");
  if (status === 404) return failed("API User introuvable (404) : vérifiez l'API User ID et l'environnement cible.");
  return failed(`Réponse inattendue de MTN MoMo (HTTP ${status}) : ${errorReason(body)}`);
};

const orangeMoneyTest: ProviderTest = async (c) => {
  const clientId = c.clientId?.trim();
  const clientSecret = c.clientSecret?.trim();
  if (!clientId || !clientSecret) return failed("Client ID / Client secret manquants.");
  const { status, body } = await apiRequest({
    url: "https://api.orange.com/oauth/v3/token",
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    failLabel: "Orange Money",
  });
  if (status === 200) return ok("Identifiants Orange valides — jeton OAuth obtenu.");
  if (status === 401) return failed("Orange a refusé les identifiants (401) : vérifiez Client ID / secret.");
  return failed(`Réponse inattendue d'Orange (HTTP ${status}) : ${errorReason(body)}`);
};

const airtelMoneyTest: ProviderTest = async (c, environment) => {
  const clientId = c.clientId?.trim();
  const clientSecret = c.clientSecret?.trim();
  if (!clientId || !clientSecret) return failed("Client ID / Client secret manquants.");
  const base =
    environment === "LIVE" ? "https://openapi.airtel.africa" : "https://openapiuat.airtel.africa";
  const { status, body } = await apiRequest({
    url: `${base}/auth/oauth2/token`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }).toString(),
    failLabel: "Airtel Money",
  });
  if (status === 200) return ok("Identifiants Airtel Money valides — jeton d'accès obtenu.");
  if (status === 401 || status === 400) {
    return failed(`Airtel Money a refusé les identifiants (HTTP ${status}) : ${errorReason(body)}`);
  }
  return failed(`Réponse inattendue d'Airtel Money (HTTP ${status}) : ${errorReason(body)}`);
};

const mpesaTest: ProviderTest = async (c, environment) => {
  const consumerKey = c.consumerKey?.trim();
  const consumerSecret = c.consumerSecret?.trim();
  if (!consumerKey || !consumerSecret) return failed("Consumer key / secret manquants.");
  const base =
    environment === "LIVE" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const { status, body } = await apiRequest({
    url: `${base}/oauth/v1/generate?grant_type=client_credentials`,
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`,
    },
    failLabel: "M-Pesa",
  });
  if (status === 200) return ok("Identifiants M-Pesa valides — jeton OAuth obtenu.");
  if (status === 400 || status === 401) {
    return failed(`M-Pesa a refusé les identifiants (HTTP ${status}) : ${errorReason(body)}`);
  }
  return failed(`Réponse inattendue de M-Pesa (HTTP ${status}) : ${errorReason(body)}`);
};

const mercadoPagoTest: ProviderTest = async (c) => {
  const token = c.accessToken?.trim();
  if (!token) return failed("Access token manquant.");
  const { status, body } = await apiRequest({
    url: "https://api.mercadopago.com/users/me",
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    failLabel: "Mercado Pago",
  });
  if (status === 200) return ok("Access token Mercado Pago valide.");
  if (status === 401) return failed("Mercado Pago a refusé le token (401) : vérifiez l'access token.");
  return failed(`Réponse inattendue de Mercado Pago (HTTP ${status}) : ${errorReason(body)}`);
};

const squareTest: ProviderTest = async (c, environment) => {
  const token = c.accessToken?.trim();
  if (!token) return failed("Access token manquant.");
  const base =
    environment === "LIVE" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  const { status, body } = await apiRequest({
    url: `${base}/v2/locations`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Square-Version": "2024-01-18" },
    failLabel: "Square",
  });
  if (status === 200) return ok("Access token Square valide — emplacements accessibles.");
  if (status === 401) return failed("Square a refusé le token (401) : vérifiez l'access token.");
  return failed(`Réponse inattendue de Square (HTTP ${status}) : ${errorReason(body)}`);
};

const mollieTest: ProviderTest = async (c) => {
  const key = c.apiKey?.trim();
  if (!key) return failed("Clé API manquante.");
  const { status, body } = await apiRequest({
    url: "https://api.mollie.com/v2/payments?limit=1",
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    failLabel: "Mollie",
  });
  if (status === 200) return ok("Clé Mollie valide — accès API confirmé.");
  if (status === 401) return failed("Clé Mollie refusée (401) : vérifiez la clé API.");
  return failed(`Réponse inattendue de Mollie (HTTP ${status}) : ${errorReason(body)}`);
};

// CinetPay : appel réel de « payment/check » avec une référence factice —
// l'API répond sur la validité des identifiants ; la transaction inconnue
// est une réponse NORMALE (les clés sont acceptées).
const cinetpayTest: ProviderTest = async (c) => {
  const apiKey = c.apiKey?.trim();
  const siteId = c.siteId?.trim();
  if (!apiKey || !siteId) return failed("Clé API ou identifiant site manquant.");
  const dummy = `BLG-TEST-${randomBytes(4).toString("hex")}`;
  const { status, body } = await apiRequest({
    url: "https://api-checkout.cinetpay.com/v2/payment/check",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: dummy }),
    failLabel: "CinetPay",
  });
  if (status !== 200) {
    return failed(`Réponse inattendue de CinetPay (HTTP ${status}) : ${errorReason(body)}`);
  }
  // Parse défensif : { code: "000"|…, message: "…" }. Une réponse JSON
  // structurée prouve que les identifiants sont acceptés ; on affiche le code.
  let parsed: { code?: unknown; message?: unknown } | null = null;
  try {
    parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
  } catch {
    parsed = null;
  }
  const code = typeof parsed?.code === "string" || typeof parsed?.code === "number" ? String(parsed.code) : "?";
  const message = typeof parsed?.message === "string" ? parsed.message.slice(0, 120) : "";
  if (code === "000" || code === "0" || code === "201" || code === "602" || code === "627") {
    return ok(`Identifiants CinetPay acceptés (réponse API : code ${code}${message ? ` — ${message}` : ""}).`);
  }
  // Codes d'authentification connus : 1004 (apikey/site invalide), 1008, 605…
  if (code === "1004" || code === "1008" || code === "605") {
    return failed(`CinetPay a refusé les identifiants (code ${code}${message ? ` — ${message}` : ""}).`);
  }
  return ok(`CinetPay a répondu (code ${code}${message ? ` — ${message}` : ""}) : vérifiez le message.`);
};

// ---------------------------------------------------------------------------
// Registre — les prestataires sans test API renvoient un résultat explicite.
// ---------------------------------------------------------------------------
export const PROVIDER_TESTS: Record<string, ProviderTest> = {
  STRIPE: stripeTest,
  PAYPAL: paypalTest,
  PAYSTACK: paystackTest,
  FLUTTERWAVE: flutterwaveTest,
  WAVE: waveTest,
  MTN_MOMO: mtnMomoTest,
  ORANGE_MONEY: orangeMoneyTest,
  AIRTEL_MONEY: airtelMoneyTest,
  MPESA: mpesaTest,
  MERCADO_PAGO: mercadoPagoTest,
  SQUARE: squareTest,
  MOLLIE: mollieTest,
  CINETPAY: cinetpayTest,
};

/** Test d'un prestataire par sa clé du catalogue. */
export async function runProviderTest(
  providerKey: string,
  credentials: Credentials,
  environment: string | null,
): Promise<ProviderTestResult> {
  const test = PROVIDER_TESTS[providerKey];
  if (!test) {
    return {
      ok: false,
      message: "Aucun test API automatique pour ce prestataire : vérification manuelle requise.",
    };
  }
  try {
    return await test(credentials, environment);
  } catch (err) {
    // Les erreurs réseau sont déjà des messages clairs ; on ne laisse jamais
    // planter la route et on n'expose aucun secret.
    return failed(err instanceof Error ? err.message : "Test impossible pour le moment.");
  }
}
