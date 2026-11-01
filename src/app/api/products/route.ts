// POST /api/products — Création d'un produit (vendeur connecté).
// Champs texte : title, description?, type (DIGITAL|PHYSICAL), category?, priceXOF,
//                status (DRAFT|PUBLISHED), stock?
// Fichiers     : `file` (fichier numérique, 25 Mo max) et `image` (couverture, 5 Mo max).
// Les uploads directs Blob sont vérifiés avant association ; le multipart local reste
// disponible en développement. Seule la clé est stockée en base (fileKey, jamais renvoyé).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError, requireRole } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { productCreateSchema } from "@/lib/validation";
import {
  inspectBlobByKey,
  isPendingUploadKeyForUser,
  readFileByKey,
  saveUpload,
} from "@/lib/storage";
import { uniqueProductSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { DIGITAL_CONTENT_TYPES, IMAGE_CONTENT_TYPES, imageMagicBytesOk } from "@/lib/upload-validation";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 Mo
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo
// Même whitelist que la route /api/images/[...key] : une image non servible est refusée tôt.
const IMAGE_EXTENSIONS = Object.keys(IMAGE_CONTENT_TYPES);
const DIGITAL_EXTENSIONS = Object.keys(DIGITAL_CONTENT_TYPES);

type DirectUpload = { key: string; name: string; size: number };

// Extrait un champ texte du FormData (les File sous une clé texte sont ignorés).
function textField(form: FormData, key: string): string | undefined {
  const raw = form.get(key);
  if (raw === null || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

// Les nombres arrivent en string dans un FormData → conversion explicite puis validation Zod.
function numberField(form: FormData, key: string, label: string): number | undefined {
  const raw = textField(form, key);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(422, `${label} est invalide`);
  return n;
}

// Fichier réellement envoyé (ignore les File vides).
function uploadField(form: FormData, key: string): File | null {
  const raw = form.get(key);
  return raw instanceof File && raw.size > 0 ? raw : null;
}

function parseDirectUpload(value: unknown, label: string): DirectUpload | null {
  if (value === null || value === undefined) return null;
  if (
    !value || typeof value !== "object" || !("key" in value) ||
    !("name" in value) || !("size" in value)
  ) {
    throw new HttpError(422, `${label} invalide`);
  }
  const { key, name, size } = value;
  if (
    typeof key !== "string" || typeof name !== "string" ||
    typeof size !== "number" || !Number.isInteger(size) || size <= 0
  ) {
    throw new HttpError(422, `${label} invalide`);
  }
  const safeName = name.replace(/\\/g, "/").split("/").pop()?.replace(/[\0-\x1f\x7f]/g, "").trim();
  if (!safeName || safeName.length > 255) throw new HttpError(422, `${label} invalide`);
  return { key, name: safeName, size };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDEUR");

    const jsonRequest = req.headers.get("content-type")?.includes("application/json") ?? false;
    let form: FormData | null = null;
    let json: Record<string, unknown> = {};
    if (jsonRequest) {
      const body: unknown = await req.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(422, "Requête invalide");
      }
      json = body as Record<string, unknown>;
    } else {
      try {
        form = await req.formData();
      } catch {
        throw new HttpError(422, "Requête invalide : multipart/form-data attendu");
      }
    }

    // Ownership : le produit est rattaché à LA boutique de l'utilisateur (côté serveur).
    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) {
      throw new HttpError(404, "Créez d'abord votre boutique avant d'ajouter des produits");
    }

    const digitalFile = form ? uploadField(form, "file") : null;
    const coverImage = form ? uploadField(form, "image") : null;
    const directFile = jsonRequest ? parseDirectUpload(json.file, "Fichier numérique") : null;
    const directImage = jsonRequest ? parseDirectUpload(json.image, "Image de couverture") : null;
    const text = (key: string) => form ? textField(form, key) : json[key];
    const number = (key: string, label: string) => {
      if (form) return numberField(form, key, label);
      const raw = json[key];
      if (raw === undefined || raw === null || raw === "") return undefined;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) throw new HttpError(422, `${label} est invalide`);
      return value;
    };

    const digitalSize = digitalFile?.size ?? directFile?.size ?? 0;
    const imageSize = coverImage?.size ?? directImage?.size ?? 0;
    if (digitalSize > MAX_FILE_BYTES) {
      throw new HttpError(413, "Fichier numérique trop volumineux (25 Mo maximum)");
    }
    if (imageSize > MAX_IMAGE_BYTES) {
      throw new HttpError(413, "Image de couverture trop volumineuse (5 Mo maximum)");
    }

    // Validation Zod (les champs inconnus sont simplement ignorés).
    const data = productCreateSchema.parse({
      title: text("title"),
      description: text("description"),
      type: text("type"),
      category: text("category"),
      priceXOF: number("priceXOF", "Le prix"),
      status: text("status"),
      stock: number("stock", "Le stock"),
    });

    // Règles métier de publication (contrôle serveur, jamais côté client).
    if (data.status === "PUBLISHED") {
      if (data.type === "DIGITAL" && !digitalFile && !directFile) {
        throw new HttpError(422, "Ajoutez le fichier numérique avant publication");
      }
      if (data.type === "PHYSICAL" && data.stock === undefined) {
        throw new HttpError(422, "Le stock est requis pour publier un produit physique");
      }
    }

    if (directFile) {
      const ext = directFile.name.slice(directFile.name.lastIndexOf(".")).toLowerCase();
      if (
        !isPendingUploadKeyForUser(directFile.key, user.id, "product-file") ||
        directFile.key.slice(directFile.key.lastIndexOf(".")).toLowerCase() !== ext ||
        !DIGITAL_EXTENSIONS.includes(ext)
      ) {
        throw new HttpError(422, "Fichier numérique téléversé invalide");
      }
      const metadata = await inspectBlobByKey(directFile.key);
      if (!metadata || metadata.size !== directFile.size || metadata.size > MAX_FILE_BYTES ||
          !DIGITAL_CONTENT_TYPES[ext]?.includes(metadata.contentType)) {
        throw new HttpError(422, "Le fichier numérique téléversé est absent ou invalide");
      }
    }
    if (directImage) {
      const ext = directImage.name.slice(directImage.name.lastIndexOf(".")).toLowerCase();
      if (
        !isPendingUploadKeyForUser(directImage.key, user.id, "product-image") ||
        directImage.key.slice(directImage.key.lastIndexOf(".")).toLowerCase() !== ext ||
        !IMAGE_EXTENSIONS.includes(ext)
      ) {
        throw new HttpError(422, "Image de couverture téléversée invalide");
      }
      const metadata = await inspectBlobByKey(directImage.key);
      if (
        !metadata || metadata.size !== directImage.size || metadata.size > MAX_IMAGE_BYTES ||
        !IMAGE_CONTENT_TYPES[ext]?.includes(metadata.contentType)
      ) {
        throw new HttpError(422, "L'image téléversée est absente ou invalide");
      }
      const imageBytes = await readFileByKey(directImage.key);
      if (!imageMagicBytesOk(imageBytes)) {
        throw new HttpError(422, "Le contenu de l'image téléversée est invalide");
      }
    }

    // Les uploads locaux passent par la même interface de stockage en développement.
    let imageUrl: string | null = null;
    if (directImage) {
      imageUrl = `/api/images/${directImage.key}`;
    } else if (coverImage) {
      const savedImage = await saveUpload(coverImage);
      imageUrl = `/api/images/${savedImage.key}`;
    }
    let fileKey: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;
    if (directFile) {
      fileKey = directFile.key;
      fileName = directFile.name;
      fileSize = directFile.size;
    } else if (digitalFile) {
      const savedFile = await saveUpload(digitalFile);
      fileKey = savedFile.key;
      fileName = savedFile.originalName;
      fileSize = savedFile.size;
    }

    const slug = await uniqueProductSlug(data.title);

    let product;
    try {
      product = await db.product.create({
        data: {
          storeId: store.id,
          slug,
          title: data.title,
          description: data.description ?? null,
          type: data.type,
          category: data.category,
          priceXOF: data.priceXOF,
          status: data.status,
          imageUrl,
          fileKey,
          fileName,
          fileSize,
          stock: data.type === "DIGITAL" ? null : data.stock ?? null, // stock = produits physiques
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "Conflit de slug produit, veuillez réessayer");
      }
      throw err;
    }

    await logAudit({
      actorUserId: user.id,
      action: "PRODUCT_CREATED",
      entity: "Product",
      entityId: product.id,
      metadata: { title: product.title, type: product.type, status: product.status, storeId: store.id },
    });
    if (product.status === "PUBLISHED") {
      await logAudit({
        actorUserId: user.id,
        action: "PRODUCT_PUBLISHED",
        entity: "Product",
        entityId: product.id,
        metadata: { title: product.title },
      });
    }

    return jsonOk(
      {
        product: {
          id: product.id,
          storeId: product.storeId,
          title: product.title,
          slug: product.slug,
          description: product.description,
          type: product.type,
          category: product.category,
          priceXOF: product.priceXOF,
          status: product.status,
          imageUrl: product.imageUrl,
          hasFile: Boolean(product.fileKey),
          fileName: product.fileName,
          fileSize: product.fileSize,
          stock: product.stock,
          createdAt: product.createdAt,
        },
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
