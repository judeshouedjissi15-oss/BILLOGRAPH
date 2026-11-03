import { issueSignedToken } from "@vercel/blob";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { deleteFileByKey, isPendingUploadKeyForUser, usesBlobStorage } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { DIGITAL_CONTENT_TYPES, IMAGE_CONTENT_TYPES } from "@/lib/upload-validation";

type UploadPurpose = "avatar" | "product-image" | "product-file";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_FILE_BYTES = 25 * 1024 * 1024;
const PENDING_PATH_PATTERN = /^pending\/[a-z0-9_-]+\/(?:avatar|product-image|product-file)\/\d{8}\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[a-z0-9]{1,10}$/;

function parseUploadPayload(value: string | null): {
  purpose: UploadPurpose;
  size: number;
  contentType: string;
} {
  if (!value) throw new HttpError(422, "Informations d'upload manquantes");
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch {
    throw new HttpError(422, "Informations d'upload invalides");
  }
  if (!payload || typeof payload !== "object") {
    throw new HttpError(422, "Informations d'upload invalides");
  }
  const { purpose, size, contentType } = payload as Record<string, unknown>;
  if (
    (purpose !== "avatar" && purpose !== "product-image" && purpose !== "product-file") ||
    typeof size !== "number" || !Number.isInteger(size) || size <= 0 ||
    typeof contentType !== "string"
  ) {
    throw new HttpError(422, "Informations d'upload invalides");
  }
  return { purpose, size, contentType: contentType.split(";")[0].trim().toLowerCase() };
}

function extensionOf(pathname: string): string {
  const dot = pathname.lastIndexOf(".");
  return dot < 0 ? "" : pathname.slice(dot).toLowerCase();
}

export async function GET() {
  try {
    const user = await requireUser();
    return jsonOk({ enabled: usesBlobStorage(), ownerId: user.id });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!usesBlobStorage()) {
      throw new HttpError(503, "Le stockage Blob n'est pas configuré");
    }

    const body = await request.json() as HandleUploadPresignedBody;
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        const upload = parseUploadPayload(clientPayload);
        const user = await requireUser();
        if (upload.purpose !== "avatar" && user.role !== "VENDEUR" && user.role !== "ADMIN") {
          throw new HttpError(403, "Accès réservé aux vendeurs et administrateurs");
        }
        rateLimit(`blob-upload:${user.id}`, 30, 60_000);

        const maxBytes = upload.purpose === "avatar"
          ? MAX_AVATAR_BYTES
          : upload.purpose === "product-image"
            ? MAX_PRODUCT_IMAGE_BYTES
            : MAX_PRODUCT_FILE_BYTES;
        if (upload.size > maxBytes) {
          throw new HttpError(413, `La taille maximale autorisée est de ${Math.floor(maxBytes / (1024 * 1024))} Mo`);
        }
        if (
          !pathname.startsWith(`pending/${user.id}/${upload.purpose}/`) ||
          !PENDING_PATH_PATTERN.test(pathname)
        ) {
          throw new HttpError(403, "Chemin d'upload non autorisé");
        }

        const extension = extensionOf(pathname);
        const allowedContentTypes = upload.purpose === "product-file"
          ? DIGITAL_CONTENT_TYPES[extension]
          : IMAGE_CONTENT_TYPES[extension];
        if (!allowedContentTypes?.includes(upload.contentType)) {
          throw new HttpError(422, "Format de fichier non autorisé");
        }

        const validUntil = Date.now() + 10 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes,
          maximumSizeInBytes: maxBytes,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes,
            maximumSizeInBytes: maxBytes,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
          },
        };
      },
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const body: unknown = await request.json();
    if (
      !body || typeof body !== "object" || !("keys" in body) ||
      !Array.isArray(body.keys) || body.keys.length > 3 ||
      !body.keys.every((key): key is string => typeof key === "string")
    ) {
      throw new HttpError(422, "Liste de fichiers invalide");
    }
    const keys = [...new Set(body.keys)];
    if (keys.some((key) => !isPendingUploadKeyForUser(key, user.id))) {
      throw new HttpError(403, "Suppression de fichier non autorisée");
    }

    for (const key of keys) {
      const [product, account] = await Promise.all([
        db.product.findFirst({
          where: { OR: [{ fileKey: key }, { imageUrl: `/api/images/${key}` }] },
          select: { id: true },
        }),
        db.user.findFirst({
          where: { id: user.id, avatarUrl: `/api/images/${key}` },
          select: { id: true },
        }),
      ]);
      if (product || account) {
        throw new HttpError(409, "Un fichier déjà utilisé ne peut pas être supprimé");
      }
    }

    await Promise.all(keys.map((key) => deleteFileByKey(key)));
    return jsonOk({ deleted: keys.length });
  } catch (error) {
    return handleApiError(error);
  }
}
