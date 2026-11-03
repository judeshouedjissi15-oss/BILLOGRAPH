import { apiFetch } from "./api-client";

const PARTS_PER_BATCH = 24;
const MAX_FILE_PARTS = 10_000;

type MultipartSession = { sessionId: string; partSize: number; partCount: number };
type MultipartPart = { partNumber: number; etag: string };
type SignedPart = { partNumber: number; url: string };

export type UploadedProductFile = { key: string; name: string; size: number };

export async function discardLargeProductFile(key: string): Promise<void> {
  await apiFetch("/api/uploads/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "discard", key }),
  });
}

export async function uploadLargeProductFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<UploadedProductFile> {
  const session = await apiFetch<MultipartSession>("/api/uploads/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "init", fileName: file.name, size: file.size }),
  });
  if (session.partCount > MAX_FILE_PARTS) {
    await apiFetch("/api/uploads/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abort", sessionId: session.sessionId }),
    });
    throw new Error("Ce fichier dépasse la limite technique de parties d'upload.");
  }

  try {
    const parts: MultipartPart[] = [];
    for (let firstPart = 1; firstPart <= session.partCount; firstPart += PARTS_PER_BATCH) {
      const lastPart = Math.min(firstPart + PARTS_PER_BATCH - 1, session.partCount);
      const partNumbers = Array.from({ length: lastPart - firstPart + 1 }, (_, index) => firstPart + index);
      const { urls } = await apiFetch<{ urls: SignedPart[] }>("/api/uploads/multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", sessionId: session.sessionId, partNumbers }),
      });

      for (let index = 0; index < urls.length; index += 3) {
        const uploaded = await Promise.all(
          urls.slice(index, index + 3).map(async ({ partNumber, url }) => {
            const start = (partNumber - 1) * session.partSize;
            const response = await fetch(url, {
              method: "PUT",
              body: file.slice(start, Math.min(start + session.partSize, file.size)),
            });
            if (!response.ok) {
              throw new Error(`L'envoi de la partie ${partNumber} a échoué (HTTP ${response.status}).`);
            }
            const etag = response.headers.get("etag");
            if (!etag) throw new Error("R2 n'a pas renvoyé l'ETag requis pour terminer l'upload.");
            onProgress(Math.min(99, Math.round((partNumber / session.partCount) * 100)));
            return { partNumber, etag };
          }),
        );
        parts.push(...uploaded);
      }
    }

    parts.sort((left, right) => left.partNumber - right.partNumber);
    const { file: uploadedFile } = await apiFetch<{ file: UploadedProductFile }>(
      "/api/uploads/multipart",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", sessionId: session.sessionId, parts }),
      },
    );
    onProgress(100);
    return uploadedFile;
  } catch (error) {
    try {
      await apiFetch("/api/uploads/multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abort", sessionId: session.sessionId }),
      });
    } catch (cleanupError) {
      console.error("Impossible de nettoyer l'upload R2 interrompu:", cleanupError);
    }
    throw error;
  }
}
