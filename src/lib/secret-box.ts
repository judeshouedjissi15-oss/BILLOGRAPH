import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// COFFRE À SECRETS — chiffrement symétrique AES-256-GCM des secrets stockés
// en base (mot de passe SMTP, futures clés API). La clé dérive de APP_SECRET
// (variable d'environnement, jamais committée) : la base ne contient donc
// AUCUN secret en clair, et un export de la base est inutilisable sans .env.
//
// Format stocké : "aes-256-gcm:<iv hex>:<tag hex>:<données chiffrées hex>"

function secretKey(): Buffer {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret || appSecret.length < 32) {
    throw new Error(
      "APP_SECRET manquant ou trop court (32+ caractères requis) — impossible de chiffrer les secrets.",
    );
  }
  return createHash("sha256").update(appSecret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "aes-256-gcm") {
    throw new Error("Format de secret chiffré invalide");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Indique si une valeur ressemble bien à un secret chiffré par ce coffre. */
export function isEncryptedSecret(value: string): boolean {
  return value.startsWith("aes-256-gcm:");
}
