import { apiFetch } from "./api-client";

const PARTS_PER_BATCH = 24;
const MAX_FILE_PARTS = 10_000;
const STORAGE_CONFIG_HINT =
  "Le stockage de fichiers R2 n'est pas configuré. Ajoutez R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_BUCKET_NAME dans votre .env, puis redémarrez l'application.";

type MultipartSession = { sessionId: string; partSize: number; partCount: number };
type MultipartPart = { partNumber: number; etag: string };
type SignedPart = { partNumber: number; url: string };

export type UploadedProductFile = { key: string; name: string; size: number };

function normalizeStorageError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("r2") && message.includes("configur")) {
      return new Error(STORAGE_CONFIG_HINT);
    }
  }
  return error instanceof Error
    ? error
    : new Error("Une erreur est survenue lors de l'envoi du fichier.");
}

export async function discardLargeProductFile(key: string): Promise<void> {
  try {
    await apiFetch("/api/uploads/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discard", key }),
    });
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

export async function uploadLargeProductFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<UploadedProductFile> {
  let session: MultipartSession | null = null;
  try {
    const activeSession = await apiFetch<MultipartSession>("/api/uploads/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init", fileName: file.name, size: file.size }),
    });
    session = activeSession;

    if (activeSession.partCount > MAX_FILE_PARTS) {
      throw new Error("Ce fichier dépasse la limite technique de parties d'upload.");
    }

    const parts: MultipartPart[] = [];
    for (let firstPart = 1; firstPart <= activeSession.partCount; firstPart += PARTS_PER_BATCH) {
      const lastPart = Math.min(firstPart + PARTS_PER_BATCH - 1, activeSession.partCount);
      const partNumbers = Array.from(
        { length: lastPart - firstPart + 1 },
        (_, index) => firstPart + index,
      );
      const { urls } = await apiFetch<{ urls: SignedPart[] }>("/api/uploads/multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", sessionId: activeSession.sessionId, partNumbers }),
      });

      for (let index = 0; index < urls.length; index += 3) {
        const uploaded = await Promise.all(
          urls.slice(index, index + 3).map(async ({ partNumber, url }) => {
            const start = (partNumber - 1) * activeSession.partSize;
            const response = await fetch(url, {
              method: "PUT",
              body: file.slice(start, Math.min(start + activeSession.partSize, file.size)),
            });
            if (!response.ok) {
              throw new Error(`L'envoi de la partie ${partNumber} a échoué (HTTP ${response.status}).`);
            }
            const etag = response.headers.get("etag");
            if (!etag) throw new Error("R2 n'a pas renvoyé l'ETag requis pour terminer l'upload.");
            onProgress(Math.min(99, Math.round((partNumber / activeSession.partCount) * 100)));
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
        body: JSON.stringify({ action: "complete", sessionId: activeSession.sessionId, parts }),
      },
    );
    onProgress(100);
    return uploadedFile;
  } catch (error) {
    if (session) {
      try {
        await apiFetch("/api/uploads/multipart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "abort", sessionId: session.sessionId }),
        });
      } catch (cleanupError) {
        console.error("Impossible de nettoyer l'upload R2 interrompu:", cleanupError);
      }
    }
    throw normalizeStorageError(error);
  }
}
