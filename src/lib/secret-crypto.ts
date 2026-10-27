import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

// CHIFFREMENT DES SECRETS DE CONFIGURATION (SMTP, clés API de paiement…).
// - AES-256-GCM (authentifié) : toute altération de la valeur stockée est
//   détectée — le déchiffrement échoue au lieu de renvoyer une donnée fausse.
// - La clé de chiffrement n'apparaît JAMAIS dans le code : elle est dérivée
//   (scrypt) d'un secret d'environnement ; en environnement local, on dérive
//   de DATABASE_URL (ne quitte jamais la machine).
// - Les secrets ne sont jamais journalisés, jamais audités, jamais renvoyés
//   tels quels au client (uniquement masqués).

const KEY_INFO = "billograph.config.v1";

function encryptionKey(): Buffer {
  const base =
    process.env.CONFIG_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL ||
    "billograph-local-fallback";
  return scryptSync(base, KEY_INFO, 32);
}

/** Chiffre une valeur sensible → « aes256gcm:<iv>:<tag>:<données> » (hex). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes256gcm:${iv.toString("hex")}:${tag.toString("hex")}:${data.toString("hex")}`;
}

/** Déchiffre une valeur chiffrée — renvoie null si invalide (jamais d'exception). */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "aes256gcm") return null;
  try {
    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const data = Buffer.from(parts[3], "hex");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Masque une valeur secrète pour affichage admin (jamais la valeur réelle). */
export function maskSecretValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••••${value.slice(-2)}`;
}

/** Déchiffre un JSON de credentials — dictionnaire sûr (jamais d'exception). */
export function readEncryptedJson(stored: string | null | undefined): Record<string, string> {
  const raw = decryptSecret(stored);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
