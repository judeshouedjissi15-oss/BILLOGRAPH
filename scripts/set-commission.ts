import { db } from "../src/lib/db";
const value = Number(process.argv[2]);
if (!Number.isInteger(value) || value < 0 || value > 50) throw new Error("commission invalide (0-50)");
const s = await db.platformSettings.upsert({
  where: { id: "main" },
  update: { commissionPercent: value },
  create: { id: "main", commissionPercent: value },
});
console.log("commissionPercent =", s.commissionPercent);
await db.$disconnect();
