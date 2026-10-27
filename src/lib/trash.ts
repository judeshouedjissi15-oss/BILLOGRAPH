// BILLOGRAPH — CORBEILLE D'ADMINISTRATION
// Règle du propriétaire : « tout ce que quiconque supprime reste dans la
// corbeille de l'administration ». Toute suppression d'un utilisateur (vendeur,
// officier) ou de l'administration passe donc par une MISE À LA CORBEILLE
// (deletedAt) — la donnée reste en base, récupérable et prouvable.
// Seule la PURGE DÉFINITIVE (réservée au propriétaire, audite) supprime
// réellement la ligne. Chaque opération est tracée dans le journal d'audit.
import "server-only";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { unlink } from "fs/promises";
import { resolveKey } from "@/lib/storage";

export const TRASH_ENTITIES = [
  "PRODUCT",
  "REVIEW",
  "ANNOUNCEMENT",
  "TRAINING",
  "TASK",
  "CALENDAR",
] as const;

export type TrashEntity = (typeof TRASH_ENTITIES)[number];

export const TRASH_ENTITY_LABELS: Record<TrashEntity, string> = {
  PRODUCT: "Produit",
  REVIEW: "Avis",
  ANNOUNCEMENT: "Annonce",
  TRAINING: "Ressource de formation",
  TASK: "Tâche d'office",
  CALENDAR: "Événement de calendrier",
};

type TrashDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<unknown>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
};

function delegate(entity: TrashEntity) {
  switch (entity) {
    case "PRODUCT":
      return db.product as unknown as TrashDelegate;
    case "REVIEW":
      return db.review as unknown as TrashDelegate;
    case "ANNOUNCEMENT":
      return db.announcement as unknown as TrashDelegate;
    case "TRAINING":
      return db.officeTrainingResource as unknown as TrashDelegate;
    case "TASK":
      return db.officeTask as unknown as TrashDelegate;
    case "CALENDAR":
      return db.officeCalendarEvent as unknown as TrashDelegate;
  }
}

function assertEntity(entity: string): TrashEntity {
  if (!(TRASH_ENTITIES as readonly string[]).includes(entity)) {
    throw new HttpError(422, "Type d'élément inconnu pour la corbeille");
  }
  return entity as TrashEntity;
}

/** Libellé lisible d'un élément mis à la corbeille (pour l'audit et l'UI). */
export async function describeTrashItem(
  entity: TrashEntity,
  row: unknown
): Promise<{ title: string; subtitle: string | null; fileKey: string | null }> {
  const r = row as Record<string, unknown>;
  switch (entity) {
    case "PRODUCT":
      return { title: String(r.title ?? "Produit"), subtitle: String(r.slug ?? ""), fileKey: (r.fileKey as string) ?? null };
    case "REVIEW":
      return { title: `Avis de ${String(r.authorName ?? "—")}`, subtitle: String(r.content ?? "").slice(0, 120), fileKey: null };
    case "ANNOUNCEMENT":
      return { title: String(r.message ?? "Annonce").slice(0, 160), subtitle: null, fileKey: null };
    case "TRAINING":
      return { title: String(r.title ?? "Ressource"), subtitle: (r.externalUrl as string) ?? null, fileKey: null };
    case "TASK":
      return { title: String(r.title ?? "Tâche"), subtitle: (r.description as string)?.slice(0, 120) ?? null, fileKey: null };
    case "CALENDAR":
      return { title: String(r.title ?? "Événement"), subtitle: (r.location as string) ?? null, fileKey: null };
  }
}

/**
 * MISE À LA CORBEILLE — remplace la suppression définitive. La ligne reste en
 * base (deletedAt + deletedById) et le fichier numérique d'un produit est
 * CONSERVÉ pour permettre la restauration. Audité : {ENTITY}_TRASHED.
 */
export async function trashItem(params: {
  entity: string;
  id: string;
  actorId: string;
  note?: string | null;
}): Promise<void> {
  const entity = assertEntity(params.entity);
  const model = delegate(entity);
  const row = await model.findUnique({ where: { id: params.id } });
  if (!row) throw new HttpError(404, "Élément introuvable");
  const current = (row as Record<string, unknown>).deletedAt as Date | null;
  if (current) return; // déjà en corbeille — idempotent

  await model.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), deletedById: params.actorId },
  });

  await logAudit({
    actorUserId: params.actorId,
    action: `${entity}_TRASHED`,
    entity,
    entityId: params.id,
    metadata: {
      ...await describeTrashItem(entity, row),
      note: params.note ?? null,
      corbeille: true,
    },
  });
}

/**
 * RESTAURATION depuis la corbeille (propriétaire uniquement). Pour un produit
 * dont le slug public a été repris entre-temps, un suffixe unique est régénéré
 * — la donnée n'est jamais perdue. Audité : {ENTITY}_RESTORED.
 */
export async function restoreTrashItem(params: {
  entity: string;
  id: string;
  actorId: string;
}): Promise<void> {
  const entity = assertEntity(params.entity);
  const model = delegate(entity);
  const row = await model.findUnique({ where: { id: params.id } });
  if (!row) throw new HttpError(404, "Élément introuvable dans la corbeille");
  const deletedAt = (row as Record<string, unknown>).deletedAt as Date | null;
  if (!deletedAt) throw new HttpError(422, "Cet élément n'est pas dans la corbeille");

  // Conflit de slug : si un AUTRE produit porteur du même slug a été publié
  // entre-temps, on régénère un slug unique pour la restauration.
  if (entity === "PRODUCT") {
    const p = row as { slug: string };
    const conflict = await db.product.findFirst({
      where: { slug: p.slug, id: { not: params.id } },
      select: { id: true },
    });
    if (conflict) {
      const base = p.slug.replace(/-r[0-9a-z]{5}$/, "");
      let candidate = `${base}-r${Math.random().toString(36).slice(2, 7)}`;
      while (await db.product.findFirst({ where: { slug: candidate }, select: { id: true } })) {
        candidate = `${base}-r${Math.random().toString(36).slice(2, 7)}`;
      }
      await db.product.update({ where: { id: params.id }, data: { slug: candidate } });
    }
  }

  await model.update({
    where: { id: params.id },
    data: { deletedAt: null, deletedById: null },
  });

  await logAudit({
    actorUserId: params.actorId,
    action: `${entity}_RESTORED`,
    entity,
    entityId: params.id,
    metadata: { ...await describeTrashItem(entity, row), corbeille: true },
  });
}

/**
 * PURGE DÉFINITIVE — réservée au propriétaire (ADMIN). Supprime réellement la
 * ligne de la base. Le fichier numérique d'un produit est effacé du stockage
 * privé (best-effort). Audité : {ENTITY}_PURGED avec le détail conservé.
 */
export async function purgeTrashItem(params: {
  entity: string;
  id: string;
  actorId: string;
}): Promise<void> {
  const entity = assertEntity(params.entity);
  const model = delegate(entity);
  const row = await model.findUnique({ where: { id: params.id } });
  if (!row) throw new HttpError(404, "Élément introuvable");
  const deletedAt = (row as Record<string, unknown>).deletedAt as Date | null;
  if (!deletedAt) {
    throw new HttpError(422, "La purge n'est possible que depuis la corbeille");
  }

  // Preuve avant destruction : le détail complet est conservé dans l'audit.
  const description = await describeTrashItem(entity, row);

  if (entity === "PRODUCT") {
    const p = row as { fileKey: string | null };
    // Un produit référencé par une commande n'est JAMAIS purgé (intégrité des
    // achats et de la comptabilité) — le vendeur doit l'archiver.
    const linkedOrders = await db.orderItem.count({ where: { productId: params.id } });
    if (linkedOrders > 0) {
      throw new HttpError(
        409,
        "Ce produit apparaît dans des commandes : purge impossible (intégrité des achats)."
      );
    }
    await model.delete({ where: { id: params.id } });
    if (p.fileKey) {
      await unlink(resolveKey(p.fileKey)).catch(() => {});
    }
  } else {
    await model.delete({ where: { id: params.id } });
  }

  await logAudit({
    actorUserId: params.actorId,
    action: `${entity}_PURGED`,
    entity,
    entityId: params.id,
    metadata: { ...description, purgedAt: new Date().toISOString(), corbeille: true },
  });
}

/**
 * Contenu de la corbeille — accessible au propriétaire (et en LECTURE SEULE
 * au greffier, qui peut tout voir sans rien modifier). Chaque entrée porte
 * qui a supprimé, quand, et le libellé de l'élément : récupération ET preuve.
 */
export async function listTrash(params: { q?: string | null }) {
  const q = params.q?.trim() || null;

  const [products, reviews, announcements, trainings, tasks, calendars] = await Promise.all([
    db.product.findMany({
      where: { deletedAt: { not: null }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
      include: { store: { select: { name: true, slug: true } }, deletedByUser: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.review.findMany({
      where: { deletedAt: { not: null }, ...(q ? { content: { contains: q, mode: "insensitive" } } : {}) },
      include: { deletedByUser: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.announcement.findMany({
      where: { deletedAt: { not: null }, ...(q ? { message: { contains: q, mode: "insensitive" } } : {}) },
      include: { deletedByUser: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.officeTrainingResource.findMany({
      where: { deletedAt: { not: null }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
      include: { deletedByUser: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.officeTask.findMany({
      where: { deletedAt: { not: null }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
      include: { deletedByUser: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.officeCalendarEvent.findMany({
      where: { deletedAt: { not: null }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
      include: { deletedByUser: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
  ]);

  const items = [
    ...products.map((p) => ({
      entity: "PRODUCT" as TrashEntity,
      id: p.id,
      title: p.title,
      subtitle: p.store?.name ?? null,
      deletedAt: p.deletedAt as Date,
      deletedByName: p.deletedByUser?.name ?? null,
    })),
    ...reviews.map((r) => ({
      entity: "REVIEW" as TrashEntity,
      id: r.id,
      title: `Avis de ${r.authorName}`,
      subtitle: r.content.slice(0, 120),
      deletedAt: r.deletedAt as Date,
      deletedByName: r.deletedByUser?.name ?? null,
    })),
    ...announcements.map((a) => ({
      entity: "ANNOUNCEMENT" as TrashEntity,
      id: a.id,
      title: a.message.slice(0, 160),
      subtitle: null,
      deletedAt: a.deletedAt as Date,
      deletedByName: a.deletedByUser?.name ?? null,
    })),
    ...trainings.map((t) => ({
      entity: "TRAINING" as TrashEntity,
      id: t.id,
      title: t.title,
      subtitle: t.externalUrl,
      deletedAt: t.deletedAt as Date,
      deletedByName: t.deletedByUser?.name ?? null,
    })),
    ...tasks.map((t) => ({
      entity: "TASK" as TrashEntity,
      id: t.id,
      title: t.title,
      subtitle: t.officeRole,
      deletedAt: t.deletedAt as Date,
      deletedByName: t.deletedByUser?.name ?? null,
    })),
    ...calendars.map((c) => ({
      entity: "CALENDAR" as TrashEntity,
      id: c.id,
      title: c.title,
      subtitle: c.officeRole,
      deletedAt: c.deletedAt as Date,
      deletedByName: c.deletedByUser?.name ?? null,
    })),
  ];

  items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  return items.map((i) => ({ ...i, deletedAt: i.deletedAt.toISOString() }));
}
