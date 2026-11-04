// POST /api/products — Création d'un produit (vendeur connecté).
// Champs texte : title, description?, type (DIGITAL|PHYSICAL), category?, priceXOF,
//                status (DRAFT|PUBLISHED), stock?
// Fichiers     : jusqu'à 20 fichiers numériques privés R2 (50 Go chacun) + image (5 Mo).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
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
import { getR2ObjectSize } from "@/lib/r2";
import { PRODUCT_FILE_MAX_GB, MAX_PRODUCT_FILES } from "@/lib/constants";

const MAX_FILE_BYTES = PRODUCT_FILE_MAX_GB * 1024 * 1024 * 1024;
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
    const user = await requireUser();
    if (user.role !== "VENDEUR" && user.role !== "ADMIN") {
      throw new HttpError(403, "Accès réservé aux vendeurs et administrateurs");
    }

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

    const requestedStoreId = jsonRequest
      ? json.storeId
      : form
        ? textField(form, "storeId")
        : undefined;
    // Un administrateur peut gérer explicitement une boutique depuis
    // l'administration ou utiliser sa propre boutique sans envoyer storeId.
    const store = user.role === "ADMIN"
      ? typeof requestedStoreId === "string"
        ? await db.store.findUnique({ where: { id: requestedStoreId } })
        : await db.store.findFirst({ where: { ownerId: user.id } })
      : await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) {
      throw new HttpError(404, "Créez d'abord votre boutique avant d'ajouter des produits");
    }

    const digitalFile = form ? uploadField(form, "file") : null;
    const coverImage = form ? uploadField(form, "image") : null;
    const directFile = jsonRequest ? parseDirectUpload(json.file, "Fichier numérique") : null;
    const rawFiles = jsonRequest ? json.files : form ? textField(form, "files") : undefined;
    let fileList: unknown = rawFiles;
    if (typeof rawFiles === "string") {
      try {
        fileList = JSON.parse(rawFiles);
      } catch {
        throw new HttpError(422, "Liste des fichiers invalide");
      }
    }
    const directFiles = (() => {
      if (fileList === undefined || fileList === null) return [];
      if (!Array.isArray(fileList) || fileList.length > MAX_PRODUCT_FILES) {
        throw new HttpError(422, `Ajoutez au maximum ${MAX_PRODUCT_FILES} fichiers`);
      }
      return fileList.map((file, index) => {
        const parsed = parseDirectUpload(file, `Fichier ${index + 1}`);
        if (!parsed) throw new HttpError(422, `Fichier ${index + 1} invalide`);
        return parsed;
      });
    })();
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

    const digitalFiles = [
      ...(directFile ? [directFile] : []),
      ...directFiles,
    ];
    if (digitalFiles.length + (digitalFile ? 1 : 0) > MAX_PRODUCT_FILES) {
      throw new HttpError(422, `Ajoutez au maximum ${MAX_PRODUCT_FILES} fichiers`);
    }
    const digitalSize = Math.max(
      digitalFile?.size ?? 0,
      ...digitalFiles.map((file) => file.size),
    );
    const imageSize = coverImage?.size ?? directImage?.size ?? 0;
    if (digitalSize > MAX_FILE_BYTES) {
      throw new HttpError(413, `Fichier numérique trop volumineux (${PRODUCT_FILE_MAX_GB} Go maximum par fichier)`);
    }
    if (imageSize > MAX_IMAGE_BYTES) {
      throw new HttpError(413, "Image de couverture trop volumineuse (5 Mo maximum)");
    }

    // Validation Zod (les champs inconnus sont simplement ignorés).
    const affiliateEnabledRaw = text("affiliateEnabled");
    const affiliateEnabled = jsonRequest
      ? json.affiliateEnabled
      : affiliateEnabledRaw === undefined
        ? undefined
        : affiliateEnabledRaw === "true"
          ? true
          : affiliateEnabledRaw === "false"
            ? false
            : (() => { throw new HttpError(422, "Le paramètre d'affiliation est invalide"); })();
    const rawPromoCode = text("promoCode");
    const promoDiscountPercent = number("promoDiscountPercent", "La réduction");
    const promoCode = typeof rawPromoCode === "string" ? rawPromoCode.toUpperCase() : undefined;
    const promoStartValue = text("promoStartsAt");
    const promoEndValue = text("promoEndsAt");
    const promoMaxUses = number("promoMaxUses", "Le nombre maximum d'utilisations");
    const promoStartsAt = typeof promoStartValue === "string" ? new Date(promoStartValue) : null;
    const promoEndsAt = typeof promoEndValue === "string" ? new Date(promoEndValue) : null;
    const invalidPromo = promoCode
      ? !/^[A-Z0-9-]{3,40}$/.test(promoCode) ||
        promoDiscountPercent === undefined ||
        promoDiscountPercent < 1 ||
        promoDiscountPercent > 90 ||
        !Number.isInteger(promoDiscountPercent) ||
        (promoStartsAt !== null && Number.isNaN(promoStartsAt.getTime())) ||
        (promoEndsAt !== null && Number.isNaN(promoEndsAt.getTime())) ||
        (promoStartsAt !== null && promoEndsAt !== null && promoEndsAt <= promoStartsAt) ||
        (promoMaxUses !== undefined && (!Number.isInteger(promoMaxUses) || promoMaxUses < 1 || promoMaxUses > 1_000_000))
      : promoDiscountPercent !== undefined ||
        promoStartValue !== undefined ||
        promoEndValue !== undefined ||
        promoMaxUses !== undefined;
    if (invalidPromo) {
      throw new HttpError(422, "Le code promo et son taux de réduction sont invalides");
    }
    const data = productCreateSchema.parse({
      title: text("title"),
      description: text("description"),
      type: text("type"),
      category: text("category"),
      priceXOF: number("priceXOF", "Le prix"),
      status: text("status"),
      stock: number("stock", "Le stock"),
      salePriceXOF: number("salePriceXOF", "Le prix promotionnel"),
      saleStartsAt: text("saleStartsAt"),
      saleEndsAt: text("saleEndsAt"),
      purchaseLabel: text("purchaseLabel"),
      affiliateEnabled,
      affiliatePercent: number("affiliatePercent", "Le taux d'affiliation"),
    });

    if (data.salePriceXOF !== undefined && data.salePriceXOF !== null &&
        data.salePriceXOF >= data.priceXOF) {
      throw new HttpError(422, "Le prix promotionnel doit être inférieur au prix normal");
    }
    if (data.saleStartsAt && data.saleEndsAt && data.saleEndsAt <= data.saleStartsAt) {
      throw new HttpError(422, "La fin de promotion doit être après son début");
    }
    if (data.type !== "DIGITAL" && (digitalFiles.length > 0 || digitalFile)) {
      throw new HttpError(422, "Les fichiers numériques ne peuvent être ajoutés qu'à un produit numérique");
    }
    if (digitalFile) {
      const extension = digitalFile.name.slice(digitalFile.name.lastIndexOf(".")).toLowerCase();
      if (
        digitalFile.size > 25 * 1024 * 1024 ||
        !DIGITAL_CONTENT_TYPES[extension]?.includes(digitalFile.type)
      ) {
        throw new HttpError(422, "Le fichier numérique envoyé est trop volumineux ou son format est invalide");
      }
    }
    if (coverImage) {
      const extension = coverImage.name.slice(coverImage.name.lastIndexOf(".")).toLowerCase();
      if (
        !IMAGE_EXTENSIONS.includes(extension) ||
        (coverImage.type && !IMAGE_CONTENT_TYPES[extension]?.includes(coverImage.type)) ||
        !imageMagicBytesOk(Buffer.from(await coverImage.arrayBuffer()))
      ) {
        throw new HttpError(422, "Le contenu de l'image de couverture est invalide");
      }
    }

    // Règles métier de publication (contrôle serveur, jamais côté client).
    if (data.status === "PUBLISHED") {
      if (data.type === "DIGITAL" && !digitalFile && digitalFiles.length === 0) {
        throw new HttpError(422, "Ajoutez le fichier numérique avant publication");
      }
      if (data.type === "PHYSICAL" && data.stock === undefined) {
        throw new HttpError(422, "Le stock est requis pour publier un produit physique");
      }
    }

    if (directFile) {
      const ext = directFile.name.slice(directFile.name.lastIndexOf(".")).toLowerCase();
      const legacyBlob = isPendingUploadKeyForUser(directFile.key, user.id, "product-file");
      const r2Key = directFile.key.startsWith(`product-files/pending/${user.id}/`);
      if (
        (!legacyBlob && !r2Key) ||
        directFile.key.slice(directFile.key.lastIndexOf(".")).toLowerCase() !== ext ||
        !DIGITAL_EXTENSIONS.includes(ext)
      ) {
        throw new HttpError(422, "Fichier numérique téléversé invalide");
      }
      const uploadedSession = legacyBlob ? null : await db.productUpload.findFirst({
        where: {
          key: directFile.key,
          ownerId: user.id,
          completed: true,
          fileName: directFile.name,
          fileSize: BigInt(directFile.size),
          expiresAt: { gt: new Date() },
        },
      });
      if (uploadedSession) {
        if (directFile.size > MAX_FILE_BYTES) {
          throw new HttpError(413, `Fichier numérique trop volumineux (${PRODUCT_FILE_MAX_GB} Go maximum)`);
        }
        const actualSize = await getR2ObjectSize(directFile.key);
        if (actualSize !== directFile.size) throw new HttpError(422, "Le fichier téléversé est absent ou incomplet");
      } else {
        const metadata = await inspectBlobByKey(directFile.key);
        if (!metadata || metadata.size !== directFile.size || metadata.size > 25 * 1024 * 1024 ||
            !DIGITAL_CONTENT_TYPES[ext]?.includes(metadata.contentType)) {
          throw new HttpError(422, "Le fichier numérique téléversé est absent ou invalide");
        }
      }
    }
    const ownedUploads: { id: string }[] = [];
    for (const [index, upload] of directFiles.entries()) {
      const extension = upload.name.slice(upload.name.lastIndexOf(".")).toLowerCase();
      if (!DIGITAL_CONTENT_TYPES[extension] || upload.size > MAX_FILE_BYTES) {
        throw new HttpError(422, `Fichier ${index + 1} invalide ou trop volumineux`);
      }
      const staged = await db.productUpload.findFirst({
        where: {
          key: upload.key,
          ownerId: user.id,
          completed: true,
          fileName: upload.name,
          fileSize: BigInt(upload.size),
          expiresAt: { gt: new Date() },
        },
      });
      if (!staged || (await getR2ObjectSize(upload.key)) !== upload.size) {
        throw new HttpError(422, `Le fichier ${index + 1} est absent, incomplet ou n'appartient pas à votre compte`);
      }
      ownedUploads.push(staged);
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
    const allProductFiles = [...(directFile ? [directFile] : []), ...directFiles];
    if (directFile && !directFile.key.startsWith("product-files/")) {
      fileKey = directFile.key;
      fileName = directFile.name;
      fileSize = directFile.size;
    } else if (digitalFile) {
      const savedFile = await saveUpload(digitalFile);
      fileKey = savedFile.key;
      fileName = savedFile.originalName;
      fileSize = savedFile.size;
    }

    if (allProductFiles.length > 0) {
      fileKey = allProductFiles[0].key;
      fileName = allProductFiles[0].name;
      fileSize = allProductFiles[0].size;
    }
    if (digitalFile && !fileKey) {
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
          salePriceXOF: data.salePriceXOF,
          saleStartsAt: data.saleStartsAt,
          saleEndsAt: data.saleEndsAt,
          purchaseLabel: data.purchaseLabel,
          affiliateEnabled: data.affiliateEnabled,
          affiliatePercent: data.affiliatePercent,
          status: data.status,
          imageUrl,
          fileKey,
          fileName,
          fileSize: fileSize !== null && fileSize <= 2_147_483_647 ? fileSize : null,
          files: allProductFiles.length
            ? {
                create: allProductFiles.map((file, position) => ({
                  fileKey: file.key,
                  fileName: file.name,
                  fileSize: BigInt(file.size),
                  position,
                })),
              }
            : undefined,
          promoCodes: promoCode
            ? {
                create: {
                  code: promoCode,
                  discountPercent: promoDiscountPercent!,
                  startsAt: promoStartsAt,
                  endsAt: promoEndsAt,
                  maxUses: promoMaxUses ?? null,
                },
              }
            : undefined,
          stock: data.type === "DIGITAL" ? null : data.stock ?? null, // stock = produits physiques
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "Conflit de slug produit, veuillez réessayer");
      }
      throw err;
    }

    if (ownedUploads.length > 0) {
      await db.productUpload.deleteMany({ where: { id: { in: ownedUploads.map((upload) => upload.id) } } });
    }
    if (directFile && directFile.key.startsWith("product-files/")) {
      await db.productUpload.deleteMany({ where: { key: directFile.key, ownerId: user.id } });
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
