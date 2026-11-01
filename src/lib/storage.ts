// Private upload storage: local disk for development, private Vercel Blob on Vercel.
import "server-only";
import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const STORAGE_DIR = path.join(process.cwd(), "storage", "uploads");
const LOCAL_KEY_PATTERN = /^\d{8}\/[a-f0-9]{16}(?:\.[a-z0-9]{1,10})?$/;
const PENDING_BLOB_KEY_PATTERN = /^pending\/[a-z0-9_-]+\/(?:avatar|product-image|product-file)\/\d{8}\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[a-z0-9]{1,10}$/;

export type SavedFile = {
  key: string;
  size: number;
  originalName: string;
};

export class StorageFileNotFoundError extends Error {
  constructor() {
    super("Fichier introuvable dans le stockage");
    this.name = "StorageFileNotFoundError";
  }
}

export function usesBlobStorage(): boolean {
  if (process.env.VERCEL === "1") return true;
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
}

function localPath(key: string): string {
  if (!LOCAL_KEY_PATTERN.test(key) || key.includes("..") || key.includes("\\")) {
    throw new Error("Clé de stockage invalide");
  }
  const resolved = path.resolve(STORAGE_DIR, key);
  if (!resolved.startsWith(`${path.resolve(STORAGE_DIR)}${path.sep}`)) {
    throw new Error("Clé de stockage invalide");
  }
  return resolved;
}

// Kept as a validation-only helper for routes that accept a storage key.
export function resolveKey(key: string): string {
  if (usesBlobStorage() && PENDING_BLOB_KEY_PATTERN.test(key)) return key;
  return localPath(key);
}

export function isPendingUploadKeyForUser(
  key: string,
  userId: string,
  purpose?: "avatar" | "product-image" | "product-file",
): boolean {
  return usesBlobStorage() &&
    key.startsWith(`pending/${userId}/${purpose ? `${purpose}/` : ""}`) &&
    PENDING_BLOB_KEY_PATTERN.test(key);
}

export async function inspectBlobByKey(key: string) {
  if (!usesBlobStorage() || !PENDING_BLOB_KEY_PATTERN.test(key)) {
    throw new Error("Clé Blob invalide");
  }
  try {
    return await head(key);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function saveUpload(file: File): Promise<SavedFile> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const id = randomBytes(8).toString("hex");
  const safeExt = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const key = `${day}/${id}${safeExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (usesBlobStorage()) {
    await put(key, buffer, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
      multipart: buffer.length > 5 * 1024 * 1024,
    });
  } else {
    const destination = localPath(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
  }

  return { key, size: buffer.length, originalName: file.name };
}

export async function readFileByKey(key: string): Promise<Buffer> {
  if (usesBlobStorage()) {
    const blob = await get(key, { access: "private" });
    if (!blob || blob.statusCode !== 200) throw new StorageFileNotFoundError();
    return Buffer.from(await new Response(blob.stream).arrayBuffer());
  }

  try {
    return await readFile(localPath(key));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new StorageFileNotFoundError();
    }
    throw error;
  }
}

export async function deleteFileByKey(key: string): Promise<void> {
  if (usesBlobStorage()) {
    await del(key);
    return;
  }
  await unlink(localPath(key));
}
