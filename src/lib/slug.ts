// Génération de slugs uniques (boutiques et produits).
import "server-only";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Renvoie un slug disponible : "nom" puis "nom-2", "nom-3"... ou suffixe aléatoire
// si la base est saturée. Utilisé à la création ET à la modification (exclusion de soi).
export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "boutique";
  let candidate = root;
  for (let i = 2; i <= 50; i++) {
    const existing = await (excludeId
      ? db.store.findFirst({ where: { slug: candidate, NOT: { id: excludeId } } })
      : db.store.findUnique({ where: { slug: candidate } }));
    if (!existing) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

export async function uniqueProductSlug(base: string): Promise<string> {
  const root = slugify(base) || "produit";
  let candidate = root;
  for (let i = 2; i <= 50; i++) {
    const existing = await db.product.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

// Référence de commande lisible : BLG-4F9K2A
export function newOrderReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let ref = "";
  const bytes = randomBytes(6);
  for (const b of bytes) ref += alphabet[b % alphabet.length];
  return `BLG-${ref}`;
}
