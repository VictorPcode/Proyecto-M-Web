"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RideState = void 0;
// apps/api/src/index.ts
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = __importDefault(require("./prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const nodemailer_1 = __importDefault(require("nodemailer"));
// In-memory password reset token store
const resetTokens = new Map();
function createMailTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass)
        return null;
    return nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
    });
}
var RideState;
(function (RideState) {
    RideState["PENDIENTE"] = "PENDIENTE";
    RideState["ASIGNADO"] = "ASIGNADO";
    RideState["EN_CURSO"] = "EN_CURSO";
    RideState["FINALIZADO"] = "FINALIZADO";
    RideState["CANCELADO"] = "CANCELADO";
})(RideState || (exports.RideState = RideState = {}));
prisma_1.default.$connect().catch(console.error);
function isPlusCode(value) {
    if (!value)
        return false;
    const v = value.trim().toUpperCase();
    return /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/.test(v);
}
function cleanAddressLabel(value) {
    if (!value)
        return "";
    const first = String(value).split(",")[0]?.trim() || "";
    if (!first || isPlusCode(first) || /^\d{5,}$/.test(first))
        return "";
    return first;
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 7 },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "application/pdf"];
        if (allowed.includes(file.mimetype))
            cb(null, true);
        else
            cb(new Error("Tipo de archivo no permitido"));
    },
});
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";
function authMiddleware(req, res, next) {
    const auth = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token)
        return res.status(401).json({ error: "missing_token" });
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = { id: payload.sub, role: payload.role };
        next();
    }
    catch {
        return res.status(401).json({ error: "invalid_token" });
    }
}
// =======================
// 
// =======================
app.get("/auth/admin/setup", async (req, res) => {
    const admin = await prisma_1.default.user.findFirst({
        where: { role: "ADMIN" },
    });
    if (admin)
        return res.status(409).json({ exists: true });
    return res.json({ exists: false });
});
// =====================
// AUTH LOGIN
// =====================
app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: "missing_credentials",
            });
        }
        const user = await prisma_1.default.user.findUnique({
            where: { email },
        });
        if (!user) {
            return res.status(401).json({
                error: "invalid_credentials",
            });
        }
        const valid = bcryptjs_1.default.compareSync(password, user.password);
        if (!valid) {
            return res.status(401).json({
                error: "invalid_credentials",
            });
        }
        // conductor pendiente
        if (user.role === "DRIVER" &&
            (!user.approved || user.documentStatus !== "APPROVED")) {
            return res.status(403).json({
                error: "driver_not_approved",
                message: "Tu cuenta de conductor aún no fue aprobada por un administrador.",
            });
        }
        const token = jsonwebtoken_1.default.sign({
            sub: user.id,
            role: user.role,
        }, JWT_SECRET, {
            expiresIn: "7d",
        });
        const { password: _, ...safeUser } = user;
        return res.json({
            token,
            user: safeUser,
        });
    }
    catch (err) {
        console.error("LOGIN ERROR:", err);
        return res.status(500).json({
            error: "login_failed",
        });
    }
});
// =====================
// ADMIN SETUP CHECK
// =====================
app.post("/auth/admin/setup", async (_req, res) => {
    try {
        const admin = await prisma_1.default.user.findFirst({
            where: {
                role: "ADMIN",
            },
        });
        if (admin) {
            return res.status(409).json({
                error: "admin_exists",
            });
        }
        return res.json({
            ok: true,
            setup: true,
        });
    }
    catch (err) {
        console.error("ADMIN SETUP ERROR:", err);
        return res.status(500).json({
            error: "setup_failed",
        });
    }
});
// =====================
// USERS CREATE / UPDATE (FIX PRINCIPAL)
// =====================
app.post("/users", upload.fields([
    { name: "docCedulaVerdeFront", maxCount: 1 },
    { name: "docCedulaVerdeBack", maxCount: 1 },
    { name: "docLicenseFront", maxCount: 1 },
    { name: "docLicenseBack", maxCount: 1 },
    { name: "docCedulaFront", maxCount: 1 },
    { name: "docCedulaBack", maxCount: 1 },
    { name: "docJudicialCert", maxCount: 1 },
]), async (req, res) => {
    try {
        const { id, name, email, password, role, phone, licenseType, licenseNumber, placa, marca, modelo, color, year, capacidad, } = req.body;
        const isUpdate = !!id;
        if (!email)
            return res.status(400).json({ error: "missing email" });
        if (!isUpdate && !password)
            return res.status(400).json({ error: "missing password" });
        if (!name)
            return res.status(400).json({ error: "missing name" });
        const files = req.files || {};
        const safeFile = (key) => {
            const file = files?.[key];
            if (!file || !file[0] || !file[0].buffer)
                return null;
            return file[0].buffer.toString("base64");
        };
        const docCedulaVerdeFrontB64 = safeFile("docCedulaVerdeFront");
        const docCedulaVerdeBackB64 = safeFile("docCedulaVerdeBack");
        const docLicenseFrontB64 = safeFile("docLicenseFront");
        const docLicenseBackB64 = safeFile("docLicenseBack");
        const docCedulaFrontB64 = safeFile("docCedulaFront");
        const docCedulaBackB64 = safeFile("docCedulaBack");
        const docJudicialCertB64 = safeFile("docJudicialCert");
        const safeYear = year ? Number(year) : null;
        const safeCapacidad = capacidad ? Number(capacidad) : 4;
        let user;
        if (isUpdate) {
            user = await prisma_1.default.user.update({
                where: { id },
                data: {
                    name,
                    email,
                    phone,
                    licenseType,
                    licenseNumber,
                },
            });
            if (placa || marca || modelo) {
                const existingVehicle = await prisma_1.default.vehicle.findFirst({
                    where: { driverId: id },
                });
                if (existingVehicle) {
                    await prisma_1.default.vehicle.update({
                        where: { id: existingVehicle.id },
                        data: {
                            placa: placa ?? existingVehicle.placa,
                            marca: marca ?? existingVehicle.marca,
                            modelo: modelo ?? existingVehicle.modelo,
                            color: color ?? existingVehicle.color,
                            year: safeYear ?? existingVehicle.year,
                            capacidad: safeCapacidad ?? existingVehicle.capacidad,
                        },
                    });
                }
                else if (placa) {
                    await prisma_1.default.vehicle.create({
                        data: {
                            placa,
                            marca: marca ?? "",
                            modelo: modelo ?? "",
                            color: color ?? "",
                            year: safeYear,
                            capacidad: safeCapacidad,
                            estado: "DISPONIBLE",
                            driverId: id,
                        },
                    });
                }
            }
        }
        else {
            const hashed = bcryptjs_1.default.hashSync(String(password), 10);
            let existing = await prisma_1.default.user.findUnique({
                where: { email },
            });
            if (existing) {
                return res.status(409).json({ error: "email_exists" });
            }
            try {
                user = await prisma_1.default.user.create({
                    data: {
                        name,
                        email,
                        password: hashed,
                        role: role ?? "PASSENGER",
                        phone,
                        licenseType,
                        licenseNumber,
                        approved: role === "ADMIN",
                        documentStatus: role === "ADMIN" ? "APPROVED" : "PENDING",
                        docCedulaVerdeFront: docCedulaVerdeFrontB64,
                        docCedulaVerdeBack: docCedulaVerdeBackB64,
                        docLicenseFront: docLicenseFrontB64,
                        docLicenseBack: docLicenseBackB64,
                        docCedulaFront: docCedulaFrontB64,
                        docCedulaBack: docCedulaBackB64,
                        docJudicialCert: docJudicialCertB64,
                    },
                });
            }
            catch (err) {
                console.error("PRISMA CREATE ERROR:", err);
                if (err.code === "P2002") {
                    return res.status(409).json({ error: "email_exists" });
                }
                return res.status(500).json({ error: "prisma_create_failed" });
            }
            if (user && user.role === "DRIVER" && placa) {
                await prisma_1.default.vehicle.create({
                    data: {
                        placa,
                        marca: marca ?? "",
                        modelo: modelo ?? "",
                        color: color ?? "",
                        year: safeYear,
                        capacidad: safeCapacidad,
                        estado: "DISPONIBLE",
                        driverId: user.id,
                    },
                });
            }
        }
        const { password: _, ...safe } = user ?? {};
        return res.json(safe);
    }
    catch (err) {
        console.error("USER CREATE/UPDATE ERROR:", err);
        return res.status(500).json({
            error: "failed",
            details: err instanceof Error ? err.message : err,
        });
    }
});
// =====================
// GET USERS
// =====================
app.get("/users", authMiddleware, async (req, res) => {
    try {
        if (req.user?.role !== "ADMIN") {
            return res.status(403).json({
                error: "forbidden",
            });
        }
        const role = req.query.role;
        const documentStatus = req.query.documentStatus;
        const users = await prisma_1.default.user.findMany({
            where: {
                ...(role ? { role: role } : {}),
                ...(documentStatus
                    ? { documentStatus: documentStatus }
                    : {}),
            },
            include: {
                vehicles: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        const safeUsers = users.map((u) => {
            const { password, vehicles, ...safe } = u;
            return {
                ...safe,
                // mantener compatibilidad con frontend actual
                vehicle: vehicles?.[0] || null,
            };
        });
        return res.json(safeUsers);
    }
    catch (err) {
        console.error("GET USERS ERROR:", err);
        return res.status(500).json({
            error: "failed_get_users",
        });
    }
});
// =====================
// APPROVE DRIVER
// =====================
app.post("/users/:id/approve", authMiddleware, async (req, res) => {
    try {
        if (req.user?.role !== "ADMIN") {
            return res.status(403).json({
                error: "forbidden",
            });
        }
        const id = Array.isArray(req.params.id)
            ? req.params.id[0]
            : req.params.id;
        const user = await prisma_1.default.user.update({
            where: { id },
            data: {
                approved: true,
                documentStatus: "APPROVED",
            },
        });
        const { password, ...safe } = user;
        return res.json(safe);
    }
    catch (err) {
        console.error("APPROVE DRIVER ERROR:", err);
        return res.status(500).json({
            error: "approve_failed",
        });
    }
});
// =====================
// REJECT DRIVER DOCUMENTS
// =====================
app.post("/users/:id/reject-documents", authMiddleware, async (req, res) => {
    try {
        if (req.user?.role !== "ADMIN") {
            return res.status(403).json({
                error: "forbidden",
            });
        }
        const id = Array.isArray(req.params.id)
            ? req.params.id[0]
            : req.params.id;
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({
                error: "missing_reason",
            });
        }
        const user = await prisma_1.default.user.update({
            where: { id },
            data: {
                approved: false,
                documentStatus: "REJECTED",
                rejectionReason: reason,
            },
        });
        const { password, ...safe } = user;
        return res.json(safe);
    }
    catch (err) {
        console.error("REJECT DRIVER ERROR:", err);
        return res.status(500).json({
            error: "reject_failed",
        });
    }
});
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, { cors: { origin: "*" } });
const PORT = Number(process.env.PORT) || 8080;
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on", PORT);
});
