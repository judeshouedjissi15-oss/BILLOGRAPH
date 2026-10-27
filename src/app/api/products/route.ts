// POST /api/products — Création d'un produit (multipart/form-data, vendeur connecté).
// Champs texte : title, description?, type (DIGITAL|PHYSICAL), category?, priceXOF,
//                status (DRAFT|PUBLISHED), stock?
// Fichiers     : `file` (fichier numérique, 25 Mo max) et `image` (couverture, 5 Mo max).
// Les fichiers partent dans le stockage privé via saveUpload ; seule la clé est stockée
// en base (fileKey, jamais renvoyé). L'image de couverture est servie via /api/images/.
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError, requireRole } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { productCreateSchema } from "@/lib/validation";
import { saveUpload } from "@/lib/storage";
import { uniqueProductSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 Mo
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo
// Même whitelist que la route /api/images/[...key] : une image non servible est refusée tôt.
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

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

function imageExtensionOk(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDEUR");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(422, "Requête invalide : multipart/form-data attendu");
    }

    // Ownership : le produit est rattaché à LA boutique de l'utilisateur (côté serveur).
    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) {
      throw new HttpError(404, "Créez d'abord votre boutique avant d'ajouter des produits");
    }

    const digitalFile = uploadField(form, "file");
    const coverImage = uploadField(form, "image");

    if (digitalFile && digitalFile.size > MAX_FILE_BYTES) {
      throw new HttpError(413, "Fichier numérique trop volumineux (25 Mo maximum)");
    }
    if (coverImage) {
      if (coverImage.size > MAX_IMAGE_BYTES) {
        throw new HttpError(413, "Image de couverture trop volumineuse (5 Mo maximum)");
      }
      if (!coverImage.type.startsWith("image/") || !imageExtensionOk(coverImage.name)) {
        throw new HttpError(422, "L'image de couverture doit être au format JPG, PNG, WebP ou GIF");
      }
    }

    // Validation Zod (les champs inconnus du FormData sont simplement ignorés).
    const data = productCreateSchema.parse({
      title: textField(form, "title"),
      description: textField(form, "description"),
      type: textField(form, "type"),
      category: textField(form, "category"),
      priceXOF: numberField(form, "priceXOF", "Le prix"),
      status: textField(form, "status"),
      stock: numberField(form, "stock", "Le stock"),
    });

    // Règles métier de publication (contrôle serveur, jamais côté client).
    if (data.status === "PUBLISHED") {
      if (data.type === "DIGITAL" && !digitalFile) {
        throw new HttpError(422, "Ajoutez le fichier numérique avant publication");
      }
      if (data.type === "PHYSICAL" && data.stock === undefined) {
        throw new HttpError(422, "Le stock est requis pour publier un produit physique");
      }
    }

    // Uploads vers le stockage privé (hors /public).
    let imageUrl: string | null = null;
    if (coverImage) {
      const savedImage = await saveUpload(coverImage);
      imageUrl = `/api/images/${savedImage.key}`;
    }
    let fileKey: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;
    if (digitalFile) {
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
