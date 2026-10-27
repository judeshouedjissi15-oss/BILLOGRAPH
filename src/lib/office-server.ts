// BILLOGRAPH — Module « MAGNIFIER SON APPEL » : garde-fous serveur de l'espace
// de travail des officiers. Toutes les API du module passent par ces fonctions :
// aucune action n'est possible sans session valide ET office actif.
import "server-only";
import { db } from "@/lib/db";
import { HttpError, requireUser, requireRole, type SessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  MAX_ADJOINTS_PER_ROLE,
  adjointLimitMessage,
  getOfficeDef,
  TASK_STATUS_LABELS,
  type OfficeDefinition,
} from "@/lib/offices";

/** Champs d'office présents sur la session (voir src/lib/auth.ts). */
export type OfficeSessionUser = SessionUser & {
  officeRole: string | null;
  officeStatus: string | null;
};

/** Compte-titulaire d'office actif : office défini + statut ACTIVE. */
export function isOfficeActive(user: {
  officeRole: string | null;
  officeStatus: string | null;
}): boolean {
  return Boolean(user.officeRole && user.officeStatus === "ACTIVE");
}

/** Contexte d'office de l'utilisateur connecté. */
export type OfficeContext = {
  user: OfficeSessionUser;
  role: string;
  office: OfficeDefinition;
  /** true quand le PROPRIÉTAIRE (ADMIN) opère dans un office qui n'est pas le
   *  sien — il hérite alors des capacités des officiers de cet office. */
  asOwner: boolean;
};

/**
 * Charge le contexte d'office depuis une session déjà résolue.
 */
export async function getOfficeContext(user: OfficeSessionUser): Promise<OfficeContext | null> {
  if (!isOfficeActive(user)) return null;
  const office = getOfficeDef(user.officeRole);
  if (!office) return null;
  return { user, role: user.officeRole as string, office, asOwner: false };
}

/**
 * Charge le contexte d'office complet depuis la session (lit l'utilisateur en
 * base pour des valeurs d'office toujours fraîches).
 */
export async function requireOffice(): Promise<OfficeContext> {
  const session = await requireUser();
  const fresh = await db.user.findUnique({
    where: { id: session.id },
    select: { officeRole: true, officeStatus: true },
  });
  const user: OfficeSessionUser = { ...session, officeRole: fresh?.officeRole ?? null, officeStatus: fresh?.officeStatus ?? null };
  const ctx = await getOfficeContext(user);
  if (!ctx) {
    throw new HttpError(403, "Espace professionnel indisponible : aucun office actif n'est attribué à votre compte. Signalez le module manquant au propriétaire depuis votre tableau de bord.");
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────
// SUPER ADMIN — CAPACITÉS D'OFFICIER (directive du propriétaire) :
// « dans le système du super admin il aura aussi la possibilité de faire ce
// que les officiers peuvent faire ». Le propriétaire (rôle ADMIN) peut donc
// opérer dans N'IMPORTE QUEL office via le paramètre ?officeRole= — les
// actions restent réelles, nominatives et auditées (source = lui-même).
// ─────────────────────────────────────────────────────────────────────────
export async function requireOfficeRequest(req: Request): Promise<OfficeContext> {
  const session = await requireUser();
  const fresh = await db.user.findUnique({
    where: { id: session.id },
    select: { officeRole: true, officeStatus: true },
  });
  const user: OfficeSessionUser = {
    ...session,
    officeRole: fresh?.officeRole ?? null,
    officeStatus: fresh?.officeStatus ?? null,
  };
  const own = await getOfficeContext(user);
  if (own) return own;

  if (user.role === "ADMIN") {
    const requested = new URL(req.url).searchParams.get("officeRole");
    if (!requested) {
      throw new HttpError(
        422,
        "Choisissez d'abord un office dans lequel opérer (le propriétaire peut agir dans tous les offices).",
      );
    }
    const office = getOfficeDef(requested);
    if (!office) throw new HttpError(422, "Office inconnu.");
    return { user, role: office.key, office, asOwner: true };
  }

  throw new HttpError(403, "Espace professionnel indisponible : aucun office actif n'est attribué à votre compte.");
}

/** Exige le rôle ADMIN (propriétaire) — pour la supervision des offices. */
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("ADMIN");
}

/** Nombre de membres ACTIFS d'un office (titulaires + adjoints). */
export async function countActiveOfficeMembers(role: string): Promise<number> {
  return db.user.count({ where: { officeRole: role, officeStatus: "ACTIVE" } });
}

/**
 * Vérifie le plafond d'effectif d'un office (directive du propriétaire :
 * 5 adjoints actifs maximum par office). Lève HttpError 409 si complet.
 */
export async function assertOfficeCapacity(role: string, excludeUserId?: string): Promise<number> {
  const office = getOfficeDef(role);
  const count = await db.user.count({
    where: {
      officeRole: role,
      officeStatus: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
  if (count >= MAX_ADJOINTS_PER_ROLE) {
    throw new HttpError(409, adjointLimitMessage(office?.label ?? role));
  }
  return count;
}

/** Notification in-app (cloche du header) — ne casse jamais le flux métier. */
export async function notifyUser(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link ?? null,
      },
    });
  } catch (err) {
    console.error("[office] échec de notification:", err);
  }
}

/** Historique de travail de l'officier (suivi transparent). */
export async function logOfficeActivity(params: {
  userId: string;
  officeRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
}): Promise<void> {
  try {
    await db.officeActivity.create({
      data: {
        userId: params.userId,
        officeRole: params.officeRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        details: params.details ?? null,
      },
    });
  } catch (err) {
    console.error("[office] échec d'activité:", err);
  }
}

/** Audit plateforme (journal admin) pour toute opération d'office notable. */
export async function logOfficeAudit(params: {
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAudit({
    actorUserId: params.actorUserId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    metadata: params.metadata,
  });
}

/**
 * Vérifie qu'un passage de statut de tâche est autorisé. Les statuts
 * AWAITING_VALIDATION et DONE ne sont JAMAIS posés directement : ils
 * résultent des actions « Soumettre » et « Valider / Renvoyer ».
 */
export function assertValidStatusTransition(from: string, to: string): void {
  const allowed: Record<string, string[]> = {
    TODO: ["IN_PROGRESS"],
    IN_PROGRESS: ["ON_HOLD", "TODO"],
    ON_HOLD: ["IN_PROGRESS"],
  };
  if (!(allowed[from] ?? []).includes(to)) {
    throw new HttpError(
      422,
      `Passage de statut non autorisé (${TASK_STATUS_LABELS[from] ?? from} → ${TASK_STATUS_LABELS[to] ?? to}). Utilisez « Soumettre à validation » ou la validation.`,
    );
  }
}

/**
 * Charge un membre d'office par identifiant et vérifie qu'il appartient bien
 * à l'office indiqué, avec le statut demandé.
 */
export async function getOfficeMember(userId: string, officeRole: string) {
  return db.user.findFirst({
    where: { id: userId, officeRole },
    select: {
      id: true,
      name: true,
      email: true,
      officeRole: true,
      officeStatus: true,
      supervisorId: true,
    },
  });
}

/**
 * Vérifie que l'utilisateur cible peut recevoir une tâche de l'officier :
 * soit l'officier lui-même, soit l'un de ses adjoints actifs du même office.
 */
export async function assertAssignableByOfficer(
  officer: { id: string; officeRole: string },
  targetUserId: string,
): Promise<{ isAdjoint: boolean; member: { id: string; name: string } }> {
  if (targetUserId === officer.id) {
    return { isAdjoint: false, member: { id: officer.id, name: "vous-même" } };
  }
  const member = await db.user.findFirst({
    where: {
      id: targetUserId,
      officeRole: officer.officeRole,
      officeStatus: "ACTIVE",
      supervisorId: officer.id,
    },
    select: { id: true, name: true },
  });
  if (!member) {
    throw new HttpError(403, "Cette personne n'est pas l'un de vos adjoints actifs : attribution impossible.");
  }
  return { isAdjoint: true, member };
}

/**
 * Attribution quand le PROPRIÉTAIRE opère dans un office (capacités
 * d'officier héritées) : la tâche peut aller à tout membre ACTIF de l'office.
 * L'autorité de validation (officerId) reste l'officier titulaire réel :
 * pour un adjoint, c'est son superviseur ; pour un titulaire, lui-même.
 */
export async function assertAssignableInOffice(
  officeRole: string,
  targetUserId: string,
): Promise<{ isAdjoint: boolean; member: { id: string; name: string }; officerId: string }> {
  const member = await db.user.findFirst({
    where: { id: targetUserId, officeRole, officeStatus: "ACTIVE" },
    select: { id: true, name: true, supervisorId: true },
  });
  if (!member) {
    throw new HttpError(403, "Cette personne n'est pas un membre actif de cet office : attribution impossible.");
  }
  return {
    isAdjoint: Boolean(member.supervisorId),
    member: { id: member.id, name: member.name },
    officerId: member.supervisorId ?? member.id,
  };
}
