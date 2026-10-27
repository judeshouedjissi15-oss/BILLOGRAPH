// Stockage privé des fichiers (MVP : système de fichiers local, hors dossier public).
// SÉCURITÉ : les fichiers numériques ne sont JAMAIS servis par /public — ils passent
// exclusivement par /api/downloads qui vérifie un token de téléchargement lié à une
// commande PAYÉE. En production, remplacer par un stockage objet (S3 / MinIO) en
// gardant la même interface (voir README).
import "server-only";
import { mkdir, writeFile, stat, readFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const STORAGE_DIR = path.join(process.cwd(), "storage", "uploads");

export type SavedFile = {
  key: string; // ex: "20260207/a1b2c3.pdf" — seule la clé est stockée en base
  size: number;
  originalName: string;
};

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function saveUpload(file: File): Promise<SavedFile> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const id = randomBytes(8).toString("hex");
  const safeExt = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const key = `${day}/${id}${safeExt}`;
  const dir = path.join(STORAGE_DIR, day);
  await ensureDir(dir);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(STORAGE_DIR, key), buffer);
  return { key, size: buffer.length, originalName: file.name };
}

// Résout une clé en chemin absolu, en interdisant toute traversée de répertoire.
export function resolveKey(key: string): string {
  const abs = path.resolve(STORAGE_DIR, key);
  if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) {
    throw new Error("Clé de stockage invalide");
  }
  return abs;
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await stat(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

export async function readFileByKey(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}
