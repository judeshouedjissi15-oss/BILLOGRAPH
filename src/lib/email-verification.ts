import "server-only";
import { createHash, randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";

// JETONS ET CODES DE CONFIRMATION D'EMAIL — deux voies réelles pour confirmer
// une adresse :
//   1. LE CODE À 6 CHIFFRES (principal) : envoyé dans l'email, l'utilisateur le
//      saisit dans l'application ; à succès le compte est confirmé ET la
//      session est ouverte (redirection directe vers le tableau de bord).
//   2. LE LIEN « Confirmer mon adresse email » (secours) : même résultat —
//      confirme le compte et ouvre la session.
// Règles communes : seule une empreinte sha256 est stockée (jamais le code ni
// le jeton en clair), un seul élément actif par compte (un renvoi invalide les
// anciens), consommable une seule fois.
//
// SÉCURITÉ DU CODE (1 000 000 combinaisons seulement) :
// - TTL court : 15 minutes ;
// - MAX 5 tentatives erronées cumulées par code, puis invalidation (il faut en
//   demander un nouveau) ;
// - une rate-limit dédiée par email (côté route) borne le nombre d'essais
//   quelle que soit l'IP : le brute-force est impraticable.

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// Code à 6 chiffres — durée de vie courte + plafond de tentatives.
export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Crée un nouveau jeton de confirmation pour l'utilisateur et invalide tous
 * les jetons précédents. Retourne le jeton OPAQUE (à mettre dans le lien) —
 * il n'est jamais stocké en clair.
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  await db.emailVerificationToken.deleteMany({ where: { userId } });

  const token = randomBytes(32).toString("hex");
  await db.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });

  return token;
}

/** Résultat de la consommation d'un jeton de confirmation. */
export type ConsumedEmailToken =
  // Jeton valide consommé maintenant : le compte doit être confirmé.
  | { outcome: "confirmed"; userId: string }
  // Jeton DÉJÀ consommé auparavant (re-clic sur le même lien) : le compte
  // associé est identifié — l'API complète/idémpote la confirmation sans
  // jamais afficher d'erreur. L'enregistrement est CONSERVÉ pour que les
  // re-clics ultérieurs restent bénins.
  | { outcome: "already-used"; userId: string }
  // Jeton inconnu ou expiré (jamais consommé) : proposer un renvoi.
  | { outcome: "invalid" };

/**
 * Vérifie et consomme un jeton. Un jeton valide n'est consommé qu'une fois ;
 * un jeton déjà consommé reste reconnaissable pour toujours (re-clic bénin).
 * Les jetons EXPIRÉS non consommés sont nettoyés au passage.
 */
export async function consumeEmailVerificationToken(token: string): Promise<ConsumedEmailToken> {
  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash: sha256(token) },
  });

  if (!record) return { outcome: "invalid" };

  if (record.usedAt) {
    // Re-clic sur un lien déjà utilisé : bénin et définitif.
    return { outcome: "already-used", userId: record.userId };
  }

  if (record.expiresAt < new Date()) {
    await db.emailVerificationToken.deleteMany({ where: { userId: record.userId } }).catch(() => {});
    return { outcome: "invalid" };
  }

  await db.emailVerificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { outcome: "confirmed", userId: record.userId };
}

/* ────────────────────────────────────────────────────────────────────────────
   CODE À 6 CHIFFRES — confirmation par saisie dans l'application.
   ──────────────────────────────────────────────────────────────────────────── */

/** Crée un code à 6 chiffres (crypto-aléatoire) et invalide les précédents. Retourne le code EN CLAIR (uniquement pour l'envoi par email). */
export async function createEmailVerificationCode(userId: string): Promise<string> {
  await db.emailVerificationCode.deleteMany({ where: { userId } });

  // randomInt (CSPRNG) : [100000, 1000000) → toujours exactement 6 chiffres.
  const code = String(randomInt(100_000, 1_000_000));

  await db.emailVerificationCode.create({
    data: {
      userId,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
    },
  });

  return code;
}

/** Résultat de la vérification d'un code saisi par l'utilisateur. */
export type CodeCheckResult =
  // Code correct : le compte peut être confirmé + session ouverte.
  | { outcome: "confirmed" }
  // Code déjà consommé (double soumission) : le compte est identifiable.
  | { outcome: "already-used" }
  // Code erroné : attemptsLeft indique combien d'essais restent avant invalidation.
  | { outcome: "wrong-code"; attemptsLeft: number }
  // Plafond de tentatives atteint : le code est invalidé définitivement.
  | { outcome: "too-many-attempts" }
  // Aucun code actif ou expiré : il faut en demander un nouveau.
  | { outcome: "expired-or-missing" };

/**
 * Vérifie le code saisi pour un compte donné. Le plafond de tentatives est
 * maintenu par compte sur le code actif : chaque erreur rapproche de
 * l'invalidation, y compris avec des codes totalement différents.
 */
export async function checkEmailVerificationCode(userId: string, code: string): Promise<CodeCheckResult> {
  const record = await db.emailVerificationCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  // Aucun code actif (jamais créé, invalidé par un renvoi, ou supprimé).
  if (!record) return { outcome: "expired-or-missing" };

  if (record.usedAt) return { outcome: "already-used" };

  if (record.expiresAt < new Date()) {
    await db.emailVerificationCode.deleteMany({ where: { userId } }).catch(() => {});
    return { outcome: "expired-or-missing" };
  }

  // Plafond déjà atteint : invalidation définitive du code actif.
  if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    await db.emailVerificationCode.deleteMany({ where: { userId } }).catch(() => {});
    return { outcome: "too-many-attempts" };
  }

  if (record.codeHash !== sha256(code)) {
    const attempts = record.attempts + 1;
    if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await db.emailVerificationCode.deleteMany({ where: { userId } }).catch(() => {});
      return { outcome: "too-many-attempts" };
    }
    await db.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts },
    });
    return { outcome: "wrong-code", attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempts };
  }

  // Code correct : consommation définitive (usage unique).
  await db.emailVerificationCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { outcome: "confirmed" };
}
