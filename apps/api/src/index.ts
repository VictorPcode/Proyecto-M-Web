// apps/api/src/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import prisma from "./prisma";
import { GeoLocation } from "@movi/types";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

// In-memory password reset token store
const resetTokens = new Map<string, { userId: string; expiresAt: number }>();

function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: { id?: string; role?: string };
    }
  }
}

export enum RideState {
  PENDIENTE = "PENDIENTE",
  ASIGNADO = "ASIGNADO",
  EN_CURSO = "EN_CURSO",
  FINALIZADO = "FINALIZADO",
  CANCELADO = "CANCELADO",
}

prisma.$connect().catch(console.error);

function isPlusCode(value?: string) {
  if (!value) return false;
  const v = value.trim().toUpperCase();
  return /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/.test(v);
}

function cleanAddressLabel(value?: string) {
  if (!value) return "";
  const first = String(value).split(",")[0]?.trim() || "";
  if (!first || isPlusCode(first) || /^\d{5,}$/.test(first)) return "";
  return first;
}

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 7 },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de archivo no permitido"));
  },
});

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;

  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// AUTH LOGIN =======================

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "login_failed" });
  }
});


// =======================





// =====================
// USERS CREATE / UPDATE (FIX PRINCIPAL)
// =====================
app.post(
  "/users",
  upload.fields([
    { name: "docCedulaVerdeFront", maxCount: 1 },
    { name: "docCedulaVerdeBack", maxCount: 1 },
    { name: "docLicenseFront", maxCount: 1 },
    { name: "docLicenseBack", maxCount: 1 },
    { name: "docCedulaFront", maxCount: 1 },
    { name: "docCedulaBack", maxCount: 1 },
    { name: "docJudicialCert", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        id,
        name,
        email,
        password,
        role,
        phone,
        licenseType,
        licenseNumber,
        placa,
        marca,
        modelo,
        color,
        year,
        capacidad,
      } = req.body;

      const isUpdate = !!id;

      if (!email) return res.status(400).json({ error: "missing email" });
      if (!isUpdate && !password) return res.status(400).json({ error: "missing password" });
      if (!name) return res.status(400).json({ error: "missing name" });

      const files = (req as any).files || {};

      const safeFile = (key: string) => {
        const file = files?.[key];
        if (!file || !file[0] || !file[0].buffer) return null;
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

      let user: any;

      if (isUpdate) {
        user = await prisma.user.update({
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
          const existingVehicle = await prisma.vehicle.findFirst({
            where: { driverId: id },
          });

          if (existingVehicle) {
            await prisma.vehicle.update({
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
          } else if (placa) {
            await prisma.vehicle.create({
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
      } else {
        const hashed = bcrypt.hashSync(String(password), 10);

        let existing = await prisma.user.findUnique({
          where: { email },
        });

        if (existing) {
          return res.status(409).json({ error: "email_exists" });
        }

        try {
          user = await prisma.user.create({
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
        } catch (err: any) {
          console.error("PRISMA CREATE ERROR:", err);

          if (err.code === "P2002") {
            return res.status(409).json({ error: "email_exists" });
          }

          return res.status(500).json({ error: "prisma_create_failed" });
        }

        if (user && user.role === "DRIVER" && placa) {
          await prisma.vehicle.create({
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
    } catch (err) {
      console.error("USER CREATE/UPDATE ERROR:", err);
      return res.status(500).json({
        error: "failed",
        details: err instanceof Error ? err.message : err,
      });
    }
  }
);

// resto de tu código SIN CAMBIOS...

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const PORT = Number(process.env.PORT) || 8080;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});