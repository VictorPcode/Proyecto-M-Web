"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const client_1 = require(".prisma/client"); // <- ruta correcta para Prisma 6
exports.prisma = global.__prisma ?? new client_1.PrismaClient({
    log: ["query", "info", "warn", "error"],
});
if (process.env.NODE_ENV !== "production")
    global.__prisma = exports.prisma;
exports.default = exports.prisma;
