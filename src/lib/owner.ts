import "server-only";
import { createHash, scryptSync, timingSafeEqual } from "crypto";

// COMPTE PROPRIÉTAIRE (administrateur unique de la plateforme).
// - Cet identifiant n'est jamais affiché dans l'interface : l'administrateur se
//   connecte via la page de connexion utilisateur standard (#/auth) ; le serveur
//   reconnaît ses identifiants et lui fait passer une DOUBLE vérification à
//   codes secrets avant d'ouvrir la session ADMIN (voir plus bas).
// - Le rôle ADMIN ne peut PAS être attribué via l'API d'administration :
//   ce compte est créé directement en base (script d'amorçage côté serveur).
// - Le mot de passe n'apparaît JAMAIS dans le code : seul son hachage scrypt
//   est stocké en base.
// - Plusieurs identifiants propriétaires peuvent être reconnus (alias) : le
//   premier est l'identifiant principal, les suivants restent valides.
export const OWNER_EMAILS = [
  "judeshouedjissi2@gmail.com", // identifiant principal du fondateur
  "hjbilede@05", // alias historique (compte d'origine)
] as const;

/** Identifiant propriétaire principal (documentation d'accès, audit). */
export const OWNER_EMAIL: string = OWNER_EMAILS[0];

// ACCÈS ADMIN À DEUX CODES SECRETS (invisible pour les autres utilisateurs) :
// 1) après des identifiants propriétaire valides, le serveur exige un premier
//    code secret (le surnom du site) ;
// 2) puis un second code (le prénom du site).
// La session ADMIN n'est ouverte QU'APRÈS les deux codes validés.
// Les codes par défaut sont stockés sous forme de hachages scrypt côté
// serveur ; ADMIN_CODE_1 et ADMIN_CODE_2 peuvent les remplacer par variables
// d'environnement sur un déploiement.
const OWNER_CODE_STEP1_HASH =
  "scrypt:85ac23e77ce3a800642458d3398ed124:57145b9878083eb6756757d9bec333181529c9f3ec9527233d6edfcc153f7388cb3f04642eda6ca0185059be919bf4496ff9744ca340aa5482b0b14825f22ec8";
const OWNER_CODE_STEP2_HASH =
  "scrypt:35c927aaad65d59895fd774c65932bbc:b12e0a5e99f4bdd3d76b47f670976230555d50c68db6d3965fb69b04ec6044e1c52a5c6e82c621abf0f339fd8f734772573555951b44e90ac251e537b57fe0f4";

// ⚠ AMORÇAGE — mot de passe initial du compte fondateur, utilisé UNIQUEMENT
// par le script de boot (src/instrumentation.ts) pour recréer le compte
// propriétaire si la base est vide. Il vit EXCLUSIVEMENT dans .env
// (OWNER_PASSWORD — fichier jamais commité, cf. .gitignore) : le code source
// n'en contient AUCUNE occurrence. Si la variable manque, les scripts de
// réparation journalisent une erreur claire au lieu de faire échouer le boot.
export const OWNER_BOOT_PASSWORD: string = (process.env.OWNER_PASSWORD ?? "").trim();

/** Nombre total de codes secrets à valider (étapes du challenge). */
export const ADMIN_CHALLENGE_STEPS = 2;

/** Tentatives échouées maximales (cumulées sur toutes les étapes) avant invalidation. */
export const ADMIN_CHALLENGE_MAX_ATTEMPTS = 5;

/** Durée de vie d'un challenge (les deux codes doivent être fournis dans ce délai). */
export const ADMIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** Normalise un identifiant de connexion (minuscules, sans espaces). */
export function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Indique si l'email (déjà normalisé) est celui du propriétaire. */
export function isOwnerEmail(normalizedEmail: string): boolean {
  return (OWNER_EMAILS as readonly string[]).includes(normalizedEmail);
}

/** Normalise un code secret saisi : minuscules, espaces réduits à un seul. */
export function normalizeSecretCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function verifyAgainstHash(code: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const derived = scryptSync(code, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

/**
 * Vérifie le code secret de l'étape donnée (1 ou 2). Comparaison côté serveur
 * uniquement, en temps constant (timingSafeEqual).
 */
export function verifyOwnerCode(step: number, rawCode: string): boolean {
  const code = normalizeSecretCode(rawCode);
  const configuredCode =
    step === 1
      ? process.env.ADMIN_CODE_1
      : step === 2
        ? process.env.ADMIN_CODE_2
        : undefined;
  if (configuredCode?.trim()) {
    const actual = createHash("sha256").update(code).digest();
    const expected = createHash("sha256")
      .update(normalizeSecretCode(configuredCode))
      .digest();
    return timingSafeEqual(actual, expected);
  }
  if (step === 1) return verifyAgainstHash(code, OWNER_CODE_STEP1_HASH);
  if (step === 2) return verifyAgainstHash(code, OWNER_CODE_STEP2_HASH);
  return false;
}
