// BILLOGRAPH — Authentification serveur (sessions en base, cookies httpOnly).
// SCÉCURITÉ :
// - Mots de passe hachés avec scrypt (node:crypto) + sel aléatoire par utilisateur.
// - Le cookie ne contient qu'un token aléatoire ; la base stocke uniquement son sha256.
// - Vérification systématique du statut ACTIVE et de l'expiration de session.
import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { SESSION_TTL_DAYS, ROLES, type Role } from "@/lib/constants";
import { getOfficeDef } from "@/lib/offices";

export const SESSION_COOKIE = "blg_session";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const derived = scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

function tokenToHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);
  await db.session.create({
    data: { userId, tokenHash: tokenToHash(token), expiresAt },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: tokenToHash(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  officeRole: string | null;
  officeStatus: string | null;
  // Profil (photo, contact) + état de confirmation d'email — projetés dans
  // /api/auth/me et « Mon profil ».
  avatarUrl: string | null;
  phone: string | null;
  emailVerified: boolean;
  createdAt: Date;
  // PROFIL PUBLIC — personnalisation libre (vendeurs et tous les rôles).
  headline: string | null;
  bio: string | null;
  city: string | null;
};

// Renvoie l'utilisateur connecté ou null. Sûr à appeler partout côté serveur.
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenToHash(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
    status: session.user.status,
    officeRole: session.user.officeRole,
    officeStatus: session.user.officeStatus,
    avatarUrl: session.user.avatarUrl,
    phone: session.user.phone,
    emailVerified: session.user.emailVerified,
    createdAt: session.user.createdAt,
    headline: session.user.headline,
    bio: session.user.bio,
    city: session.user.city,
  };
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// Exige un utilisateur connecté — sinon 401.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Connexion requise");
  return user;
}

// Exige un rôle précis — sinon 403. Le contrôle se fait TOUJOURS côté serveur.
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "Accès refusé pour votre rôle");
  }
  return user;
}

// Ferme TOUTES les autres sessions d'un compte (celle de l'appareil courant
// reste ouverte) — utilisé après un changement de mot de passe : un attaquant
// qui aurait une session volée la perd immédiatement.
export async function destroyOtherSessions(userId: string): Promise<number> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const currentHash = token ? tokenToHash(token) : null;
  const result = await db.session.deleteMany({
    where: {
      userId,
      ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
    },
  });
  return result.count;
}

// ───────────────────────────────────────────────────────────────────────
// GREFFIER — LECTURE SEULE TOTALE (directive du propriétaire) :
// « le greffier peut voir tout ce que le super admin peut voir mais il ne
// peut rien modifier ni rien supprimer ».
// requireAdminViewer() autorise le propriétaire (ADMIN) ET le greffier en
// fonction actif — UNIQUEMENT pour les endpoints de CONSULTATION (GET).
// Toute mutation continue d'exiger requireRole("ADMIN") : le greffier ne
// peut rien modifier, rien supprimer, rien publier — côté serveur.
// ───────────────────────────────────────────────────────────────────────
export async function isGreffierActive(user: SessionUser): Promise<boolean> {
  // Valeurs d'office toujours fraîches (la session peut dater d'avant l'affectation).
  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { officeRole: true, officeStatus: true },
  });
  return fresh?.officeRole === "GREFFIER" && fresh?.officeStatus === "ACTIVE";
}

export async function requireAdminViewer(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (await isGreffierActive(user)) return user;
  throw new HttpError(403, "Accès refusé pour votre rôle");
}

// Projection utilisateur envoyée au client (profil complet incluant l'office —
// module « Magnifier son appel » : le client en déduit l'entrée de l'espace
// professionnel sans jamais bloquer le compte).
export type ClientUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  officeRole: string | null;
  officeStatus: string | null;
  officeLabel: string | null;
  officeActive: boolean;
  // Profil (photo, téléphone) + confirmation d'email + date d'inscription.
  avatarUrl: string | null;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string;
  // PROFIL PUBLIC — personnalisation libre.
  headline: string | null;
  bio: string | null;
  city: string | null;
};

export function toClientUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  officeRole?: string | null;
  officeStatus?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  headline?: string | null;
  bio?: string | null;
  city?: string | null;
}): ClientUser {
  const office = getOfficeDef(user.officeRole);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    status: user.status,
    officeRole: user.officeRole ?? null,
    officeStatus: user.officeStatus ?? null,
    officeLabel: office?.label ?? null,
    officeActive: Boolean(user.officeRole && user.officeStatus === "ACTIVE" && office),
    avatarUrl: user.avatarUrl ?? null,
    phone: user.phone ?? null,
    emailVerified: user.emailVerified ?? false,
    createdAt: user.createdAt ? user.createdAt.toISOString() : new Date(0).toISOString(),
    headline: user.headline ?? null,
    bio: user.bio ?? null,
    city: user.city ?? null,
  };
}
