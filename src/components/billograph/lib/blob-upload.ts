"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { apiFetch } from "./api-client";
import { DIGITAL_CONTENT_TYPES, IMAGE_CONTENT_TYPES } from "@/lib/upload-validation";

export type PrivateUploadPurpose = "avatar" | "product-image" | "product-file";

export type PrivateUpload = {
  key: string;
  name: string;
  size: number;
};

const PRESIGNED_UPLOAD_URL = "/api/uploads/presigned";

export async function uploadPrivateBlob(
  file: File,
  purpose: PrivateUploadPurpose,
): Promise<PrivateUpload | null> {
  const config = await apiFetch<{ enabled: boolean; ownerId: string }>(PRESIGNED_UPLOAD_URL);
  if (!config.enabled) return null;

  const dot = file.name.lastIndexOf(".");
  const extension = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
  const allowedTypes = purpose === "product-file"
    ? DIGITAL_CONTENT_TYPES[extension]
    : IMAGE_CONTENT_TYPES[extension];
  if (!allowedTypes) throw new Error("Format de fichier non autorisé.");
  const contentType = (file.type || allowedTypes[0]).split(";")[0].trim().toLowerCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pathname = `pending/${config.ownerId}/${purpose}/${date}/${crypto.randomUUID()}${extension}`;

  const blob = await uploadPresigned(pathname, file, {
    access: "private",
    handleUploadUrl: PRESIGNED_UPLOAD_URL,
    contentType,
    multipart: purpose === "product-file" && file.size > 5 * 1024 * 1024,
    clientPayload: JSON.stringify({ purpose, contentType, size: file.size }),
  });
  return { key: blob.pathname, name: file.name, size: file.size };
}

export async function cleanupPrivateBlobs(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await apiFetch(PRESIGNED_UPLOAD_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });
  } catch (error) {
    console.error("Impossible de nettoyer les uploads Blob non utilisés:", error);
  }
}
