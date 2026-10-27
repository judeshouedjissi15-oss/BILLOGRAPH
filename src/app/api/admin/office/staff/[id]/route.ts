// PATCH /api/admin/office/staff/[id] — gérer l'office d'un membre :
//   { officeRole, isAdjoint, supervisorId } — changer de poste / rattacher.
//   { officeStatus: "SUSPENDED" | "ACTIVE" } — suspendre / réactiver l'office
//     (le compte CLIENT/VENDEUR reste ACTIF — jamais de blocage du compte).
//   { revoke: true } — retirer l'office (le compte reste actif).
// Mutations propriétaire uniquement, auditées.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { notifyUser, logOfficeActivity } from "@/lib/office-server";
import { getOfficeDef, MAX_ADJOINTS_PER_ROLE } from "@/lib/offices";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = (await readJson(req)) as Record<string, unknown>;

    const member = await db.user.findUnique({ where: { id } });
    if (!member) throw new HttpError(404, "Membre introuvable.");

    // Propriétaire : retrait d'office.
    if (body.revoke === true) {
      const updated = await db.user.update({
        where: { id },
        data: { officeRole: null, officeStatus: null, officeActivatedAt: null, supervisorId: null },
      });
      await logOfficeActivity({
        userId: admin.id,
        officeRole: member.officeRole ?? "—",
        action: "ADJOINT_REMOVED",
        entityType: "User",
        entityId: id,
        details: `Office retiré à ${updated.name} — le compte reste actif.`,
      });
      await logAdmin(admin.id, "STAFF_UPDATED", id, { revoke: true });
      await notifyUser({
        userId: id,
        type: "SYSTEM",
        title: "Office retiré",
        body: "Le propriétaire a retiré votre office. Votre compte continue de fonctionner normalement.",
        link: "#/dashboard",
      });
      return jsonOk({ ok: true });
    }

    // Suspendre / réactiver l'office (le COMPTE reste actif).
    if (body.officeStatus === "SUSPENDED" || body.officeStatus === "ACTIVE") {
      if (!member.officeRole) throw new HttpError(422, "Ce compte ne porte pas d'office.");
      const updated = await db.user.update({
        where: { id },
        data: { officeStatus: body.officeStatus },
      });
      await logOfficeActivity({
        userId: admin.id,
        officeRole: updated.officeRole ?? "—",
        action: "OFFICE_STATUS_CHANGED",
        entityType: "User",
        entityId: id,
        details: `Office de ${updated.name} : ${body.officeStatus === "ACTIVE" ? "réactivé" : "suspendu"} (compte inchangé).`,
      });
      await logAdmin(admin.id, "STAFF_UPDATED", id, { officeStatus: body.officeStatus });
      return jsonOk({ ok: true });
    }

    // Changer de poste / rattachement adjoint.
    if (typeof body.officeRole === "string") {
      const office = getOfficeDef(body.officeRole);
      if (!office) throw new HttpError(422, "Office inconnu.");
      const isAdjoint = body.isAdjoint === true;
      const supervisorId =
        typeof body.supervisorId === "string" && body.supervisorId.trim() !== "" ? body.supervisorId.trim() : null;

      if (isAdjoint) {
        if (!supervisorId) throw new HttpError(422, "L'adjoint doit être rattaché à un officier titulaire.");
        const supervisor = await db.user.findFirst({
          where: { id: supervisorId, officeRole: office.key, officeStatus: "ACTIVE", supervisorId: null },
          select: { id: true },
        });
        if (!supervisor) throw new HttpError(422, "L'officier titulaire indiqué est introuvable.");
      }

      // Plafond : 5 actifs par office (en excluant le membre si déjà dedans).
      const count = await db.user.count({
        where: {
          officeRole: office.key,
          officeStatus: "ACTIVE",
          ...(member.officeRole === office.key ? { id: { not: member.id } } : {}),
        },
      });
      if (count >= MAX_ADJOINTS_PER_ROLE) {
        throw new HttpError(409, `L'office « ${office.label} » est complet (${MAX_ADJOINTS_PER_ROLE} membres actifs).`);
      }

      const updated = await db.user.update({
        where: { id },
        data: {
          officeRole: office.key,
          officeStatus: "ACTIVE",
          officeActivatedAt: member.officeRole === office.key ? member.officeActivatedAt : new Date(),
          supervisorId: isAdjoint ? supervisorId : null,
        },
      });
      await logOfficeActivity({
        userId: admin.id,
        officeRole: office.key,
        action: "OFFICE_GRANTED",
        entityType: "User",
        entityId: id,
        details: `Poste de ${updated.name} : ${office.label}${isAdjoint ? " (adjoint)" : ""}.`,
      });
      await logAdmin(admin.id, "STAFF_UPDATED", id, { officeRole: office.key, isAdjoint });
      await notifyUser({
        userId: id,
        type: "SYSTEM",
        title: "Poste mis à jour : " + office.label,
        body: `Le propriétaire a mis à jour votre poste (${office.label}). Votre espace professionnel reflète ce changement.`,
        link: "#/professionnel",
      });
      return jsonOk({ ok: true });
    }

    throw new HttpError(422, "Aucune modification valide fournie.");
  } catch (err) {
    return handleApiError(err);
  }
}

async function logAdmin(actorId: string, action: string, entityId: string, meta: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ actorUserId: actorId, action, entity: "User", entityId, metadata: meta });
}
