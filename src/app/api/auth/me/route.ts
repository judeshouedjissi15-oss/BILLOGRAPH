// GET /api/auth/me — Profil de l'utilisateur connecté (401 si non connecté).
// Inclut l'office (module « Magnifier son appel ») : le client en déduit
// l'entrée « Mon espace professionnel », sans jamais bloquer le compte.
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getOfficeDef } from "@/lib/offices";

export async function GET() {
  try {
    const user = await requireUser();
    const office = getOfficeDef(user.officeRole);
    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        officeRole: user.officeRole,
        officeStatus: user.officeStatus,
        officeLabel: office?.label ?? null,
        officeActive: Boolean(user.officeRole && user.officeStatus === "ACTIVE" && office),
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
        headline: user.headline,
        bio: user.bio,
        city: user.city,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
