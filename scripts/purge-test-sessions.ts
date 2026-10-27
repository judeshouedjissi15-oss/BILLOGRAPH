// Purge des sessions et challenges de test (sécurité) — l'utilisateur se
// reconnecte avec ses identifiants. Ré-exécutable sans risque.
import { db } from "../src/lib/db";
const s = await db.session.deleteMany({});
const c = await db.adminChallenge.deleteMany({});
console.log(`sessions supprimées: ${s.count}, challenges supprimés: ${c.count}`);
await db.$disconnect();
