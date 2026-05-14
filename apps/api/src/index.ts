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

// =======================
// 
// =======================

app.get("/auth/admin/setup", async (req, res) => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (admin) return res.status(409).json({ exists: true });

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

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        error: "invalid_credentials",
      });
    }

    const valid = bcrypt.compareSync(password, user.password);

    if (!valid) {
      return res.status(401).json({
        error: "invalid_credentials",
      });
    }

    // conductor pendiente
    if (
      user.role === "DRIVER" &&
      (!user.approved || user.documentStatus !== "APPROVED")
    ) {
      return res.status(403).json({
        error: "driver_not_approved",
        message: "Tu cuenta de conductor aún no fue aprobada por un administrador.",
      });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    const { password: _, ...safeUser } = user;

    return res.json({
      token,
      user: safeUser,
    });
  } catch (err) {
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
    const admin = await prisma.user.findFirst({
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
  } catch (err) {
    console.error("ADMIN SETUP ERROR:", err);

    return res.status(500).json({
      error: "setup_failed",
    });
  }
});

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

    const role = req.query.role as string | undefined;
    const documentStatus = req.query.documentStatus as string | undefined;

    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as any } : {}),
        ...(documentStatus
          ? { documentStatus: documentStatus as any }
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
  } catch (err) {
    console.error("GET USERS ERROR:", err);

    return res.status(500).json({
      error: "failed_get_users",
    });
  }
});

// =====================
// GET RIDES
// =====================

app.get("/rides", authMiddleware, async (req, res) => {
  try {
    const states = req.query.state;

    let where: any = {};

    if (states) {
      if (Array.isArray(states)) {
        where.state = {
          in: states,
        };
      } else {
        where.state = states;
      }
    }

    const rides = await prisma.ride.findMany({
      where,
      include: {
        passenger: true,
        driver: true,
        vehicle: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(rides);
  } catch (err) {
    console.error("GET RIDES ERROR:", err);

    return res.status(500).json({
      error: "failed_get_rides",
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

    const user = await prisma.user.update({
      where: { id },
      data: {
        approved: true,
        documentStatus: "APPROVED",
      },
    });

    const { password, ...safe } = user;

    return res.json(safe);
  } catch (err) {
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

    const user = await prisma.user.update({
      where: { id },
      data: {
        approved: false,
        documentStatus: "REJECTED",
        rejectionReason: reason,
      },
    });

    const { password, ...safe } = user;

    return res.json(safe);
  } catch (err) {
    console.error("REJECT DRIVER ERROR:", err);

    return res.status(500).json({
      error: "reject_failed",
    });
  }
});


// =====================
// GEOCODE
// =====================

app.get("/geocode", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const limit = Number(req.query.limit || 5);

    if (!query) {
      return res.json([]); // mejor que error
    }

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=json&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "movi-app",
      },
    });

    const data = await response.json();

    return res.json(data || []);
  } catch (err) {
    console.error("GEOCODE ERROR:", err);
    return res.json([]); // importante para UX
  }
});

// =====================
// REVERSE GEOCODE
// =====================

app.get("/reverse-geocode", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!lat || !lng) {
      return res.status(400).json({ error: "missing_coordinates" });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "movi-app",
      },
    });

    const data = await response.json();

    return res.json(data);
  } catch (err) {
    console.error("REVERSE GEOCODE ERROR:", err);
    return res.status(500).json({ error: "reverse_geocode_failed" });
  }
});


const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

const PORT = Number(process.env.PORT) || 8080;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});