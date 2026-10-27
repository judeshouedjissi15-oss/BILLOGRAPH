import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const users = await db.user.findMany({ select: { id: true, email: true, name: true, role: true, status: true, createdAt: true } });
console.log(JSON.stringify(users, null, 2));
const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
console.log("commissionPercent:", settings?.commissionPercent);
await db.$disconnect();
