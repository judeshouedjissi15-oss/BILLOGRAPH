// POST   /api/me/avatar — import d'une photo de profil (direct Blob ou multipart local).
// DELETE /api/me/avatar — retrait de la photo (fichier supprimé du stockage).
// Sécurité : 5 Mo max, whitelist d'extensions, VÉRIFICATION MAGIC BYTES
// serveur (un fichier texte déguisé en image est refusé), stockage privé
// servi via /api/images. L'ancienne photo est supprimée au remplacement.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { HttpError, requireUser, toClientUser } from "@/lib/auth";
import {
  deleteFileByKey,
  inspectBlobByKey,
  isPendingUploadKeyForUser,
  readFileByKey,
  saveUpload,
} from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { IMAGE_CONTENT_TYPES, imageMagicBytesOk } from "@/lib/upload-validation";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 Mo — miroir du contrôle client
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

async function deleteOldAvatar(avatarUrl: string | null) {
  if (!avatarUrl || !avatarUrl.startsWith("/api/images/")) return;
  const key = avatarUrl.replace("/api/images/", "");
  if (key.includes("..")) return;
  await deleteFileByKey(key).catch(() => {});
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    rateLimit(`avatar-upload:${user.id}`, 10, 60_000);

    const directUpload = req.headers.get("content-type")?.includes("application/json") ?? false;
    let file: File | null = null;
    let directKey: string | null = null;
    let directContentType: string | null = null;
    let name: string;
    let buffer: Buffer;
    if (directUpload) {
      const body: unknown = await req.json();
      if (!body || typeof body !== "object" || !("key" in body) || !("name" in body) || !("size" in body)) {
        throw new HttpError(422, "Données de photo invalides");
      }
      const { key, name: submittedName, size } = body;
      if (
        typeof key !== "string" || !isPendingUploadKeyForUser(key, user.id, "avatar") ||
        typeof submittedName !== "string" || !Number.isInteger(size) ||
        typeof size !== "number" || size <= 0 || size > MAX_AVATAR_BYTES
      ) {
        throw new HttpError(422, "Données de photo invalides");
      }
      const metadata = await inspectBlobByKey(key);
      if (!metadata || metadata.size !== size || metadata.size > MAX_AVATAR_BYTES) {
        throw new HttpError(422, "Image téléversée introuvable ou invalide");
      }
      directKey = key;
      directContentType = metadata.contentType;
      name = submittedName.replace(/\\/g, "/").split("/").pop()?.replace(/[\0-\x1f\x7f]/g, "").trim() ?? "";
      buffer = await readFileByKey(key);
    } else {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new HttpError(422, "Requête invalide : multipart/form-data attendu");
      }
      const rawFile = form.get("avatar");
      if (!(rawFile instanceof File) || rawFile.size === 0) {
        throw new HttpError(422, "Aucune image reçue");
      }
      if (rawFile.size > MAX_AVATAR_BYTES) {
        throw new HttpError(413, "Image trop lourde (5 Mo maximum)");
      }
      file = rawFile;
      name = file.name || "avatar";
      buffer = Buffer.from(await file.arrayBuffer());
    }

    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot).toLowerCase();
    if (!name || name.length > 255 || !IMAGE_EXTENSIONS.includes(ext)) {
      throw new HttpError(422, "Format non autorisé : JPG, PNG, WebP ou GIF uniquement");
    }
    if (
      directKey &&
      (directKey.slice(directKey.lastIndexOf(".")).toLowerCase() !== ext ||
        !IMAGE_CONTENT_TYPES[ext]?.includes(directContentType ?? ""))
    ) {
      throw new HttpError(422, "Le format du Blob ne correspond pas à l'image");
    }
    if (!imageMagicBytesOk(buffer)) {
      throw new HttpError(422, "Ce fichier n'est pas une image réelle (vérification du contenu)");
    }

    const saved = directKey
      ? { key: directKey }
      : await saveUpload(new File([new Uint8Array(buffer)], `avatar-${Date.now()}${ext}`, { type: file?.type || "application/octet-stream" }));

    const before = await db.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    await deleteOldAvatar(before?.avatarUrl ?? null);

    const updated = await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: `/api/images/${saved.key}` },
    });

    await logAudit({
      actorUserId: user.id,
      action: "PROFILE_AVATAR_UPDATED",
      entity: "User",
      entityId: user.id,
      metadata: { ip: clientIp(req), taille: buffer.length },
    });

    return jsonOk({ user: toClientUser(updated) }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    if (!dbUser?.avatarUrl) throw new HttpError(404, "Aucune photo de profil à retirer");

    await deleteOldAvatar(dbUser.avatarUrl);
    const updated = await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });

    await logAudit({
      actorUserId: user.id,
      action: "PROFILE_AVATAR_REMOVED",
      entity: "User",
      entityId: user.id,
      metadata: { ip: clientIp(req) },
    });

    return jsonOk({ user: toClientUser(updated) });
  } catch (err) {
    return handleApiError(err);
  }
}
