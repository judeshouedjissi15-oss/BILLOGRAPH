// GESTION DES OFFICES (propriétaire) — attribution et consultation.
// GET  /api/admin/office/staff — membres d'office + capacité par office.
// POST /api/admin/office/staff — attribuer un office à un compte existant
//        (CLIENT ou VENDEUR — le rôle du compte NE CHANGE PAS : l'espace
//        professionnel s'ajoute) ou créer un compte d'office avec mot de passe
//        provisoire. Plafond réel : 5 membres actifs par office.
// Toute mutation est audité (STAFF_CREATED / STAFF_UPDATED...).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson, jsonError } from "@/lib/api";
import { HttpError, hashPassword, requireAdminViewer } from "@/lib/auth";
import { requireAdmin, notifyUser, logOfficeActivity } from "@/lib/office-server";
import { OFFICE_DEFS, getOfficeDef, MAX_ADJOINTS_PER_ROLE } from "@/lib/offices";
import { isOwnerEmail, normalizeIdentifier } from "@/lib/owner";

export async function GET() {
  try {
    await requireAdminViewer();

    const members = await db.user.findMany({
      where: { officeRole: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        officeRole: true,
        officeStatus: true,
        officeActivatedAt: true,
        supervisorId: true,
        supervisor: { select: { name: true } },
      },
    });

    const capacities = await Promise.all(
      OFFICE_DEFS.map(async (def) => ({
        key: def.key,
        active: await db.user.count({ where: { officeRole: def.key, officeStatus: "ACTIVE" } }),
      })),
    );

    return jsonOk({
      members,
      capacities,
      maxAdjoints: MAX_ADJOINTS_PER_ROLE,
      offices: OFFICE_DEFS.map((d) => ({ key: d.key, label: d.label, officeName: d.officeName, canHaveAdjoints: d.canHaveAdjoints })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type CreateBody = {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  officeRole?: unknown;
  isAdjoint?: unknown;
  supervisorId?: unknown;
  password?: unknown;
};

// POST : attribue un office. Deux cas :
//  1. Le compte existe déjà (email connu) → on lui ajoute l'office.
//  2. Le compte n'existe pas → création d'un compte CLIENT + office (le
//     mot de passe est fourni par le propriétaire ou généré et AFFICHÉ UNE
//     SEULE FOIS dans la réponse ; il est haché en base et jamais journalisé).
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = (await readJson(req)) as CreateBody;

    const email = normalizeIdentifier(typeof body.email === "string" ? body.email : "");
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!email.includes("@")) throw new HttpError(422, "Adresse email invalide.");
    if (isOwnerEmail(email)) {
      throw new HttpError(409, "Ce compte est le compte fondateur : il ne reçoit pas d'office.");
    }
    const officeRole = typeof body.officeRole === "string" ? body.officeRole : "";
    const office = getOfficeDef(officeRole);
    if (!office) throw new HttpError(422, "Office inconnu.");
    const isAdjoint = body.isAdjoint === true;
    const supervisorId = typeof body.supervisorId === "string" && body.supervisorId.trim() !== "" ? body.supervisorId.trim() : null;
    if (isAdjoint && !supervisorId) {
      throw new HttpError(422, "L'adjoint doit être rattaché à un officier titulaire.");
    }
    if (supervisorId) {
      const supervisor = await db.user.findFirst({
        where: { id: supervisorId, officeRole, officeStatus: "ACTIVE", supervisorId: null },
        select: { id: true, name: true },
      });
      if (!supervisor) {
        throw new HttpError(422, "L'officier titulaire indiqué est introuvable ou déjà adjoint.");
      }
    }

    // Plafond du propriétaire : 5 membres ACTIFS par office.
    const count = await db.user.count({ where: { officeRole, officeStatus: "ACTIVE" } });
    if (count >= MAX_ADJOINTS_PER_ROLE) {
      return jsonError(409, `L'office « ${office.label} » est complet (${MAX_ADJOINTS_PER_ROLE} membres actifs).`);
    }

    const existing = await db.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.officeRole) {
        throw new HttpError(409, "Ce compte porte déjà un office. Retirez-le d'abord si vous souhaitez le changer.");
      }
      const updated = await db.user.update({
        where: { id: existing.id },
        data: {
          officeRole,
          officeStatus: "ACTIVE",
          officeActivatedAt: new Date(),
          supervisorId: isAdjoint ? supervisorId : null,
        },
      });
      await logOfficeActivity({
        userId: admin.id,
        officeRole,
        action: "OFFICE_GRANTED",
        entityType: "User",
        entityId: updated.id,
        details: `Office « ${office.label} » attribué à ${updated.name} (${isAdjoint ? "adjoint" : "titulaire"}).`,
      });
      await notifyUser({
        userId: updated.id,
        type: "SYSTEM",
        title: "Nouveau poste : " + office.label,
        body: `Le propriétaire vous a confié l'office « ${office.officeName} ». Votre espace professionnel est disponible dans le menu (Espace professionnel).`,
        link: "#/professionnel",
      });
      await logAuditSafe(admin.id, "STAFF_UPDATED", "User", updated.id, { officeRole, isAdjoint });
      return jsonOk({ user: { id: updated.id, name: updated.name, email: updated.email, officeRole: updated.officeRole } }, 200);
    }

    // Création d'un nouveau compte d'office.
    const tempPassword =
      typeof body.password === "string" && body.password.length >= 8
        ? body.password
        : `BLG-${Math.random().toString(36).slice(2, 6)}${Math.floor(Math.random() * 9000 + 1000)}`;
    const created = await db.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash: hashPassword(tempPassword),
        role: "CLIENT",
        status: "ACTIVE",
        emailVerified: true,
        emailVerifiedAt: new Date(),
        officeRole,
        officeStatus: "ACTIVE",
        officeActivatedAt: new Date(),
        supervisorId: isAdjoint ? supervisorId : null,
      },
    });
    await logOfficeActivity({
      userId: admin.id,
      officeRole,
      action: "OFFICE_GRANTED",
      entityType: "User",
      entityId: created.id,
      details: `Compte d'office créé : ${created.name} (${office.label}, ${isAdjoint ? "adjoint" : "titulaire"}).`,
    });
    await logAuditSafe(admin.id, "STAFF_CREATED", "User", created.id, { officeRole, isAdjoint });
    return jsonOk(
      {
        user: { id: created.id, name: created.name, email: created.email, officeRole: created.officeRole },
        tempPassword, // affiché UNE SEULE fois au propriétaire (jamais journalisé)
      },
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}

async function logAuditSafe(actorId: string, action: string, entity: string, entityId: string, meta: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ actorUserId: actorId, action, entity, entityId, metadata: meta });
}
