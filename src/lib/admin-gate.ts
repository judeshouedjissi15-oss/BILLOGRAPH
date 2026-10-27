// BILLOGRAPH — Porte d'accès administrateur (server-only).
//
// L'accès à l'administration exige, APRÈS la vérification classique des
// identifiants, la saisie correcte du « surnom du site » — une phrase secrète
// connue du seul administrateur (AM-Joyce par défaut, surchargeable via la
// variable d'environnement ADMIN_SITE_NICKNAME).
//
// La valeur attendue ne vit JAMAIS côté client : le navigateur se contente de
// renvoyer ce que l'utilisateur a saisi, la comparaison est faite ici, en
// temps constant, et toute tentative est journalisée dans l'audit.
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Durée de validité du challenge intermédiaire (étape 1 → étape 2).
export const ADMIN_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Nombre maximal de surnoms incorrects avant invalidation du challenge.
export const ADMIN_CHALLENGE_MAX_ATTEMPTS = 5;

export function expectedSiteNickname(): string {
  return (process.env.ADMIN_SITE_NICKNAME || "AM-Joyce").trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Comparaison en temps constant (on compare les empreintes sha256 des deux
// valeurs pour égaliser les longueurs, puis timingSafeEqual).
export function constantTimeEquals(a: string, b: string): boolean {
  const ha = Buffer.from(sha256(a), "hex");
  const hb = Buffer.from(sha256(b), "hex");
  return timingSafeEqual(ha, hb);
}

// Génère un token de challenge : la valeur brute est renvoyée au client qui
// vient de prouver ses identifiants ; seul son sha256 est stocké en base.
export function newChallengeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: sha256(token) };
}

export function challengeTokenHash(token: string): string {
  return sha256(token);
}
