// BILLOGRAPH — CATALOGUE DES MOYENS DE PAIEMENT (partagé client/serveur).
//
// Référentiel des prestataires que l'administrateur peut connecter depuis
// l'espace « Paiements » : mobile money, agrégateurs, cartes bancaires,
// portefeuilles numériques, virements et comptes bancaires — Afrique,
// Amérique, Europe et international.
//
// Ce fichier est PARTAGÉ : il ne contient aucun secret et peut être importé
// par le client (les libellés techniques passent par des clés i18n
// « admin.paymentsInt.field.* »). Les identifiants réels ne transitent que
// par les routes admin et sont chiffrés AES-256-GCM côté serveur.

export type PaymentRegion = "AFRICA" | "AMERICA" | "EUROPE" | "INTERNATIONAL";

export type PaymentKind =
  | "AGGREGATOR"
  | "MOBILE_MONEY"
  | "CARD"
  | "WALLET"
  | "BANK_TRANSFER"
  | "BANK_ACCOUNT";

export type PaymentField = {
  key: string;
  /** Clé i18n du libellé (admin.paymentsInt.field.*). */
  labelKey: string;
  type: "text" | "password";
  required: boolean;
  /** Exemple technique (jamais traduit) : sk_live_…, +229…, sandbox… */
  placeholder?: string;
};

export type PaymentProviderCatalog = {
  key: string;
  /** Nom de marque (jamais traduit). */
  name: string;
  regions: PaymentRegion[];
  kind: PaymentKind;
  currencies: string[];
  /** Codes pays ISO 3166-1 alpha-2 (neutres, non traduits). */
  countries: string[];
  /** Marques/moyens acceptés (noms propres, non traduits). */
  methods: string[];
  fields: PaymentField[];
  /** Le test de connexion appelle-t-il réellement l'API du prestataire ? */
  test: "api" | "none";
  /** FedaPay : déjà configuré dans l'onglet Paramètres (encaissement réel). */
  managedInSettings?: boolean;
  /** Comptes bancaires : région choisie à la création. */
  regionSelectable?: boolean;
};

// Champs récurrents — mêmes clés i18n partout.
const F = {
  apiKey: (required: boolean, placeholder?: string): PaymentField => ({
    key: "apiKey",
    labelKey: "admin.paymentsInt.field.apiKey",
    type: "password",
    required,
    placeholder,
  }),
  secretKey: (required: boolean, placeholder?: string): PaymentField => ({
    key: "secretKey",
    labelKey: "admin.paymentsInt.field.secretKey",
    type: "password",
    required,
    placeholder,
  }),
  accessToken: (required: boolean, placeholder?: string): PaymentField => ({
    key: "accessToken",
    labelKey: "admin.paymentsInt.field.accessToken",
    type: "password",
    required,
    placeholder,
  }),
  clientId: (required: boolean, placeholder?: string): PaymentField => ({
    key: "clientId",
    labelKey: "admin.paymentsInt.field.clientId",
    type: "text",
    required,
    placeholder,
  }),
  clientSecret: (required: boolean, placeholder?: string): PaymentField => ({
    key: "clientSecret",
    labelKey: "admin.paymentsInt.field.clientSecret",
    type: "password",
    required,
    placeholder,
  }),
} as const;

export const PAYMENT_PROVIDERS: PaymentProviderCatalog[] = [
  // -------------------------------------------------------------------------
  // AFRIQUE
  // -------------------------------------------------------------------------
  {
    key: "FEDAPAY",
    name: "FedaPay",
    regions: ["AFRICA"],
    kind: "AGGREGATOR",
    currencies: ["XOF"],
    countries: ["BJ", "TG", "CI", "SN"],
    methods: ["MTN MoMo", "Moov Money", "Celtiis Cash", "Visa", "Mastercard"],
    fields: [],
    test: "none",
    managedInSettings: true,
  },
  {
    key: "CINETPAY",
    name: "CinetPay",
    regions: ["AFRICA"],
    kind: "AGGREGATOR",
    currencies: ["XOF"],
    countries: ["BJ", "CI", "SN", "TG", "ML", "BF", "CD", "GN"],
    methods: ["MTN MoMo", "Moov Money", "Orange Money", "Wave", "Visa", "Mastercard"],
    fields: [F.apiKey(true, "…"), { key: "siteId", labelKey: "admin.paymentsInt.field.siteId", type: "text", required: true }],
    test: "api",
  },
  {
    key: "PAYSTACK",
    name: "Paystack",
    regions: ["AFRICA"],
    kind: "AGGREGATOR",
    currencies: ["NGN", "GHS", "USD", "ZAR"],
    countries: ["NG", "GH", "ZA"],
    methods: ["Visa", "Mastercard", "Verve", "Virement bancaire", "USSD"],
    fields: [F.secretKey(true, "sk_live_… / sk_test_…")],
    test: "api",
  },
  {
    key: "FLUTTERWAVE",
    name: "Flutterwave",
    regions: ["AFRICA"],
    kind: "AGGREGATOR",
    currencies: ["XOF", "NGN", "GHS", "KES", "USD"],
    countries: ["BJ", "CI", "SN", "NG", "GH", "KE", "TZ", "UG", "CM"],
    methods: ["Mobile Money", "Visa", "Mastercard", "Virement"],
    fields: [F.secretKey(true, "FLWSECK-…")],
    test: "api",
  },
  {
    key: "WAVE",
    name: "Wave",
    regions: ["AFRICA"],
    kind: "MOBILE_MONEY",
    currencies: ["XOF", "GHS"],
    countries: ["SN", "CI", "BF", "ML", "UG", "GH"],
    methods: ["Wave"],
    fields: [F.apiKey(true, "wave_…")],
    test: "api",
  },
  {
    key: "MTN_MOMO",
    name: "MTN MoMo API",
    regions: ["AFRICA"],
    kind: "MOBILE_MONEY",
    currencies: ["XOF", "GHS", "RWF", "ZMW", "UGX"],
    countries: ["BJ", "GH", "CI", "CM", "RW", "UG", "ZM"],
    methods: ["MTN MoMo"],
    fields: [
      { key: "subscriptionKey", labelKey: "admin.paymentsInt.field.subscriptionKey", type: "password", required: true },
      { key: "apiUserId", labelKey: "admin.paymentsInt.field.apiUserId", type: "text", required: true },
      F.apiKey(true),
      { key: "targetEnvironment", labelKey: "admin.paymentsInt.field.targetEnvironment", type: "text", required: true, placeholder: "sandbox / mtnbenin / mtnghana…" },
    ],
    test: "api",
  },
  {
    key: "ORANGE_MONEY",
    name: "Orange Money Webpayment",
    regions: ["AFRICA"],
    kind: "MOBILE_MONEY",
    currencies: ["XOF"],
    countries: ["SN", "CI", "ML", "BF", "CM"],
    methods: ["Orange Money"],
    fields: [
      F.clientId(true),
      F.clientSecret(true),
      { key: "merchantKey", labelKey: "admin.paymentsInt.field.merchantKey", type: "password", required: true },
    ],
    test: "api",
  },
  {
    key: "AIRTEL_MONEY",
    name: "Airtel Money",
    regions: ["AFRICA"],
    kind: "MOBILE_MONEY",
    currencies: ["XOF", "KES", "TZS", "UGX"],
    countries: ["BJ", "CI", "KE", "TZ", "UG", "GA", "MG"],
    methods: ["Airtel Money"],
    fields: [
      F.clientId(true),
      F.clientSecret(true),
      { key: "country", labelKey: "admin.paymentsInt.field.country", type: "text", required: true, placeholder: "BJ" },
    ],
    test: "api",
  },
  {
    key: "MPESA",
    name: "M-Pesa (Daraja)",
    regions: ["AFRICA"],
    kind: "MOBILE_MONEY",
    currencies: ["KES", "TZS"],
    countries: ["KE", "TZ"],
    methods: ["M-Pesa"],
    fields: [
      { key: "consumerKey", labelKey: "admin.paymentsInt.field.consumerKey", type: "text", required: true },
      { key: "consumerSecret", labelKey: "admin.paymentsInt.field.consumerSecret", type: "password", required: true },
    ],
    test: "api",
  },
  {
    key: "KKAPAY",
    name: "Kkiapay",
    regions: ["AFRICA"],
    kind: "AGGREGATOR",
    currencies: ["XOF"],
    countries: ["BJ", "TG", "CI"],
    methods: ["MTN MoMo", "Moov Money", "Visa", "Mastercard"],
    fields: [
      { key: "privateKey", labelKey: "admin.paymentsInt.field.privateKey", type: "password", required: true },
      { key: "merchantId", labelKey: "admin.paymentsInt.field.merchantId", type: "text", required: true },
    ],
    test: "none",
  },
  // -------------------------------------------------------------------------
  // AMÉRIQUE
  // -------------------------------------------------------------------------
  {
    key: "STRIPE",
    name: "Stripe",
    regions: ["AMERICA", "EUROPE"],
    kind: "CARD",
    currencies: ["USD", "CAD", "BRL", "MXN", "EUR", "GBP", "XOF"],
    countries: ["US", "CA", "BR", "MX", "FR", "DE", "GB", "BE", "CI"],
    methods: ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay"],
    fields: [F.secretKey(true, "sk_live_… / sk_test_…")],
    test: "api",
  },
  {
    key: "MERCADO_PAGO",
    name: "Mercado Pago",
    regions: ["AMERICA"],
    kind: "AGGREGATOR",
    currencies: ["BRL", "MXN", "ARS", "CLP", "COP", "USD"],
    countries: ["BR", "MX", "AR", "CL", "CO", "PE", "UY"],
    methods: ["Cartes locales", "Pix", "OXXO", "Visa", "Mastercard"],
    fields: [F.accessToken(true, "APP_USR-…")],
    test: "api",
  },
  {
    key: "SQUARE",
    name: "Square",
    regions: ["AMERICA"],
    kind: "CARD",
    currencies: ["USD", "CAD"],
    countries: ["US", "CA"],
    methods: ["Visa", "Mastercard", "Amex"],
    fields: [
      F.accessToken(true, "EAAA…"),
      { key: "locationId", labelKey: "admin.paymentsInt.field.locationId", type: "text", required: false },
    ],
    test: "api",
  },
  // -------------------------------------------------------------------------
  // EUROPE
  // -------------------------------------------------------------------------
  {
    key: "MOLLIE",
    name: "Mollie",
    regions: ["EUROPE"],
    kind: "AGGREGATOR",
    currencies: ["EUR", "GBP", "CHF"],
    countries: ["NL", "BE", "FR", "DE", "GB", "CH"],
    methods: ["iDEAL", "Bancontact", "Cartes bancaires", "SEPA"],
    fields: [F.apiKey(true, "test_… / live_…")],
    test: "api",
  },
  // -------------------------------------------------------------------------
  // INTERNATIONAL
  // -------------------------------------------------------------------------
  {
    key: "PAYPAL",
    name: "PayPal",
    regions: ["INTERNATIONAL", "AMERICA", "EUROPE"],
    kind: "WALLET",
    currencies: ["USD", "EUR", "GBP", "CAD", "BRL"],
    countries: ["US", "FR", "DE", "GB", "BE", "CA", "BR", "BJ"],
    methods: ["PayPal", "Visa", "Mastercard"],
    fields: [F.clientId(true), F.clientSecret(true)],
    test: "api",
  },
  // -------------------------------------------------------------------------
  // COMPTES BANCAIRES (toutes régions — région choisie à la création)
  // -------------------------------------------------------------------------
  {
    key: "BANK_ACCOUNT",
    name: "Compte bancaire",
    regions: ["AFRICA", "AMERICA", "EUROPE", "INTERNATIONAL"],
    kind: "BANK_ACCOUNT",
    currencies: ["FCFA", "EUR", "USD", "GBP"],
    countries: [],
    methods: ["Virement bancaire", "SEPA"],
    fields: [
      { key: "bankName", labelKey: "admin.paymentsInt.field.bankName", type: "text", required: true },
      { key: "holderName", labelKey: "admin.paymentsInt.field.holderName", type: "text", required: true },
      { key: "accountNumber", labelKey: "admin.paymentsInt.field.accountNumber", type: "password", required: true },
      { key: "bicSwift", labelKey: "admin.paymentsInt.field.bicSwift", type: "text", required: false },
      { key: "currency", labelKey: "admin.paymentsInt.field.currency", type: "text", required: true, placeholder: "FCFA / EUR / USD" },
      { key: "country", labelKey: "admin.paymentsInt.field.country", type: "text", required: true, placeholder: "BJ" },
      { key: "note", labelKey: "admin.paymentsInt.field.note", type: "text", required: false },
    ],
    test: "none",
    regionSelectable: true,
  },
];

export function getProviderCatalog(key: string): PaymentProviderCatalog | null {
  return PAYMENT_PROVIDERS.find((p) => p.key === key) ?? null;
}

/** Prestataires proposés dans une région donnée (hors FedaPay géré ailleurs). */
export function providersForRegion(region: PaymentRegion): PaymentProviderCatalog[] {
  return PAYMENT_PROVIDERS.filter((p) => p.regions.includes(region) && !p.managedInSettings);
}

/** Clés de champ autorisées pour un prestataire (validation serveur). */
export function allowedFieldKeys(provider: PaymentProviderCatalog): string[] {
  return provider.fields.map((f) => f.key);
}
