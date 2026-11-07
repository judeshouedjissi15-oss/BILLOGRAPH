import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { DIGITAL_CONTENT_TYPES } from "@/lib/upload-validation";
import {
  abortR2MultipartUpload,
  beginR2MultipartUpload,
  completeR2MultipartUpload,
  deleteR2Object,
  getR2ObjectSize,
  isR2Configured,
  signR2UploadPart,
} from "@/lib/r2";

export const MAX_PRODUCT_FILE_BYTES = 50 * 1024 * 1024 * 1024;
export const PRODUCT_UPLOAD_PART_BYTES = 32 * 1024 * 1024;
const MAX_SIGNED_PARTS_PER_REQUEST = 24;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    await requireUser();
    return jsonOk({
      r2Enabled: isR2Configured(),
      localEnabled: process.env.NODE_ENV === "development" && process.env.VERCEL !== "1",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function safeFileName(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(422, "Nom de fichier invalide");
  const name = value.replace(/\\/g, "/").split("/").pop()?.replace(/[\0-\x1f\x7f]/g, "").trim();
  if (!name || name.length > 255) throw new HttpError(422, "Nom de fichier invalide");
  const dot = name.lastIndexOf(".");
  const extension = dot < 0 ? "" : name.slice(dot).toLowerCase();
  if (!DIGITAL_CONTENT_TYPES[extension]) throw new HttpError(422, "Format de fichier non autorisé");
  return name;
}

function getOwnedSession(sessionId: unknown, ownerId: string) {
  if (typeof sessionId !== "string" || sessionId.length > 64) {
    throw new HttpError(422, "Session d'upload invalide");
  }
  return db.productUpload.findFirst({
    where: { id: sessionId, ownerId, expiresAt: { gt: new Date() } },
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (user.role !== "VENDEUR" && user.role !== "ADMIN") {
      throw new HttpError(403, "Accès réservé aux vendeurs et administrateurs");
    }
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(422, "Requête invalide");
    }
    const data = body as Record<string, unknown>;

    if (data.action === "discard") {
      if (typeof data.key !== "string") throw new HttpError(422, "Clé de fichier invalide");
      const session = await db.productUpload.findFirst({
        where: { key: data.key, ownerId: user.id },
      });
      if (!session) throw new HttpError(404, "Fichier temporaire introuvable");
      const attached = await db.product.findFirst({
        where: { OR: [{ fileKey: session.key }, { files: { some: { fileKey: session.key } } }] },
        select: { id: true },
      });
      if (attached) throw new HttpError(409, "Un fichier associé à un produit ne peut pas être supprimé");
      if (!session.completed) {
        await abortR2MultipartUpload({ key: session.key, uploadId: session.uploadId });
      } else {
        await deleteR2Object(session.key);
      }
      await db.productUpload.delete({ where: { id: session.id } });
      return jsonOk({ ok: true });
    }

    if (data.action === "init") {
      rateLimit(`r2-upload-init:${user.id}`, 20, 60 * 60 * 1000);
      const expiredSessions = await db.productUpload.findMany({
        where: { ownerId: user.id, expiresAt: { lte: new Date() } },
        take: 10,
      });
      for (const expired of expiredSessions) {
        const attached = expired.completed
          ? await db.product.findFirst({
              where: { OR: [{ fileKey: expired.key }, { files: { some: { fileKey: expired.key } } }] },
              select: { id: true },
            })
          : null;
        if (expired.completed) {
          if (!attached) await deleteR2Object(expired.key);
        } else {
          await abortR2MultipartUpload({ key: expired.key, uploadId: expired.uploadId });
        }
        await db.productUpload.delete({ where: { id: expired.id } });
      }
      const fileName = safeFileName(data.fileName);
      const size = data.size;
      if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
        throw new HttpError(422, "Taille de fichier invalide");
      }
      if (size > MAX_PRODUCT_FILE_BYTES) {
        throw new HttpError(413, "La taille maximale autorisée est de 50 Go par fichier");
      }
      const dot = fileName.lastIndexOf(".");
      const extension = fileName.slice(dot).toLowerCase();
      const contentType = DIGITAL_CONTENT_TYPES[extension]?.[0];
      if (!contentType) throw new HttpError(422, "Format de fichier non autorisé");

      const sessionId = randomUUID();
      const key = `product-files/pending/${user.id}/${sessionId}${extension}`;
      const uploadId = await beginR2MultipartUpload({ key, contentType });
      try {
        await db.productUpload.create({
          data: {
            id: sessionId,
            ownerId: user.id,
            key,
            uploadId,
            fileName,
            contentType,
            fileSize: BigInt(size),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          },
        });
      } catch (error) {
        await abortR2MultipartUpload({ key, uploadId });
        throw error;
      }
      return jsonOk({
        sessionId,
        partSize: PRODUCT_UPLOAD_PART_BYTES,
        partCount: Math.ceil(size / PRODUCT_UPLOAD_PART_BYTES),
      });
    }

    const session = await getOwnedSession(data.sessionId, user.id);
    if (!session) throw new HttpError(404, "Session d'upload introuvable ou expirée");

    if (data.action === "sign") {
      if (session.completed) throw new HttpError(409, "Ce fichier est déjà téléversé");
      if (!Array.isArray(data.partNumbers) || data.partNumbers.length < 1 ||
          data.partNumbers.length > MAX_SIGNED_PARTS_PER_REQUEST ||
          !data.partNumbers.every((part) =>
            typeof part === "number" &&
            Number.isInteger(part) &&
            part >= 1 &&
            part <= Math.ceil(Number(session.fileSize) / PRODUCT_UPLOAD_PART_BYTES),
          )) {
        throw new HttpError(422, "Numéros de parties invalides");
      }
      const urls = await Promise.all(
        [...new Set(data.partNumbers as number[])].map(async (partNumber) => ({
          partNumber,
          url: await signR2UploadPart({
            key: session.key,
            uploadId: session.uploadId,
            partNumber,
          }),
        })),
      );
      return jsonOk({ urls });
    }

    if (data.action === "complete") {
      if (session.completed) {
        return jsonOk({ file: { key: session.key, name: session.fileName, size: Number(session.fileSize) } });
      }
      const partCount = Math.ceil(Number(session.fileSize) / PRODUCT_UPLOAD_PART_BYTES);
      if (
        !Array.isArray(data.parts) ||
        data.parts.length !== partCount ||
        !data.parts.every(
          (part, index) =>
            !!part &&
            typeof part === "object" &&
            "partNumber" in part &&
            part.partNumber === index + 1 &&
            "etag" in part &&
            typeof part.etag === "string" &&
            /^"?[a-fA-F0-9-]+"?$/.test(part.etag),
        )
      ) {
        throw new HttpError(422, "La liste des parties téléversées est incomplète ou invalide");
      }
      await completeR2MultipartUpload({
        key: session.key,
        uploadId: session.uploadId,
        parts: data.parts.map((part) => {
          const item = part as { partNumber: number; etag: string };
          return { partNumber: item.partNumber, etag: item.etag };
        }),
      });
      const uploadedSize = await getR2ObjectSize(session.key);
      if (uploadedSize !== Number(session.fileSize)) {
        await deleteR2Object(session.key);
        await db.productUpload.delete({ where: { id: session.id } });
        throw new HttpError(422, "Le fichier reçu ne correspond pas à la taille annoncée");
      }
      await db.productUpload.update({
        where: { id: session.id },
        data: { completed: true },
      });
      return jsonOk({
        file: { key: session.key, name: session.fileName, size: Number(session.fileSize) },
      });
    }

    if (data.action === "abort") {
      if (!session.completed) {
        await abortR2MultipartUpload({ key: session.key, uploadId: session.uploadId });
      } else {
        await deleteR2Object(session.key);
      }
      await db.productUpload.delete({ where: { id: session.id } });
      return jsonOk({ ok: true });
    }

    throw new HttpError(422, "Action d'upload inconnue");
  } catch (error) {
    return handleApiError(error);
  }
}
