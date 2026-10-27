// POST   /api/me/avatar — import RÉEL d'une photo de profil (multipart).
// DELETE /api/me/avatar — retrait de la photo (fichier supprimé du stockage).
// Sécurité : 5 Mo max, whitelist d'extensions, VÉRIFICATION MAGIC BYTES
// serveur (un fichier texte déguisé en image est refusé), stockage privé
// servi via /api/images. L'ancienne photo est supprimée au remplacement.
import { NextRequest } from "next/server";
import { unlink } from "fs/promises";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { HttpError, requireUser, toClientUser } from "@/lib/auth";
import { saveUpload, resolveKey } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 Mo — miroir du contrôle client
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// MAGIC BYTES réels : seul le contenu vérifié passe (défense en profondeur
// contre un fichier renommé en .png).
function magicBytesOk(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // JPEG : FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return true;
  // GIF : GIF87a / GIF89a
  const gif = buffer.subarray(0, 6).toString("ascii");
  if (gif === "GIF87a" || gif === "GIF89a") return true;
  // WebP : RIFF....WEBP
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

async function deleteOldAvatar(avatarUrl: string | null) {
  if (!avatarUrl || !avatarUrl.startsWith("/api/images/avatars/")) return;
  const key = avatarUrl.replace("/api/images/", "");
  if (key.includes("..")) return;
  await unlink(resolveKey(key)).catch(() => {});
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    rateLimit(`avatar-upload:${user.id}`, 10, 60_000);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(422, "Requête invalide : multipart/form-data attendu");
    }
    const file = form.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      throw new HttpError(422, "Aucune image reçue");
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new HttpError(413, "Image trop lourde (5 Mo maximum)");
    }
    const name = file.name || "avatar";
    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      throw new HttpError(422, "Format non autorisé : JPG, PNG, WebP ou GIF uniquement");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!magicBytesOk(buffer)) {
      throw new HttpError(422, "Ce fichier n'est pas une image réelle (vérification du contenu)");
    }

    const saved = await saveUpload(new File([buffer], `avatar-${Date.now()}${ext}`, { type: file.type || "application/octet-stream" }));

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
