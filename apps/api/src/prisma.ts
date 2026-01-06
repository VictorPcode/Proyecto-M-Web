import "dotenv/config";
import { PrismaClient } from ".prisma/client"; // <- ruta correcta para Prisma 6

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ?? new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") global.__prisma = prisma;

export default prisma;
