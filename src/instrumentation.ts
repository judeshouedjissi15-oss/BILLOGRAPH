// INSTRUMENTATION SERVEUR — auto-réparation au démarrage de BILLOGRAPH.
//
// Contexte réel : une réinitialisation de l'environnement a déjà effacé les
// données de la base (comptes compris), bloquant l'accès administrateur.
// Ce fichier garantit qu'AU CHAQUE DÉMARRAGE du serveur :
//   - les réglages plateforme existent (commission par défaut),
//   - les comptes propriétaires existent (ADMIN, actifs, email pré-confirmé).
//
// Tout est défensif : une erreur ici ne doit JAMAIS empêcher le serveur de
// démarrer. Le même service est disponible manuellement via scripts/doctor.ts
// (qui permet aussi une vérification manuelle de l'état de la base).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Exécuté en tâche de fond : le démarrage ne doit pas attendre la base.
  void (async () => {
    try {
      const { db } = await import("@/lib/db");
      const { hashPassword } = await import("@/lib/auth");
      const { OWNER_EMAILS, OWNER_BOOT_PASSWORD, normalizeIdentifier } = await import("@/lib/owner");
      const { COMMISSION_DEFAULT } = await import("@/lib/site-content");

      const OWNER_PASSWORD = OWNER_BOOT_PASSWORD;
      const OWNER_NAME = "HOUEDJISSI Judes B.";

      await db.platformSettings.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main", commissionPercent: COMMISSION_DEFAULT },
      });

      for (const email of OWNER_EMAILS) {
        const normalized = normalizeIdentifier(email);
        const existing = await db.user.findUnique({ where: { email: normalized } });
        if (!existing) {
          if (OWNER_PASSWORD) {
            await db.user.create({
              data: {
                email: normalized,
                name: OWNER_NAME,
                passwordHash: hashPassword(OWNER_PASSWORD),
                role: "ADMIN",
                status: "ACTIVE",
                emailVerified: true,
                emailVerifiedAt: new Date(),
              },
            });
            console.log(`[boot] Compte propriétaire recréé automatiquement : ${normalized}`);
          }
        } else if (
          existing.role !== "ADMIN" ||
          existing.status !== "ACTIVE" ||
          !existing.emailVerified
        ) {
          await db.user.update({
            where: { id: existing.id },
            data: {
              role: "ADMIN",
              status: "ACTIVE",
              ...(existing.emailVerified ? {} : { emailVerified: true, emailVerifiedAt: new Date() }),
            },
          });
          console.log(`[boot] Compte propriétaire réparé automatiquement : ${normalized}`);
        }
      }
      console.log("[boot] Auto-vérification plateforme terminée (réglages + comptes propriétaires).");
      if (!OWNER_PASSWORD) {
        console.error(
          "[boot] OWNER_PASSWORD absente du .env : la recréation automatique du compte propriétaire est désactivée (les comptes existants restent intacts).",
        );
      }
    } catch (err) {
      // Jamais bloquant : on journalise le remède et on laisse le serveur démarrer.
      console.error(
        "[boot] Auto-réparation impossible (la plateforme démarre quand même) :",
        err instanceof Error ? err.message : err,
        "\n— Si les tables manquent, appliquez les migrations : bun run db:migrate:deploy",
      );
    }
  })();
}
