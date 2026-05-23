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
const operationalDb = prisma as any;

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

type GeocodeSuggestion = {
  display_name: string;
  lat: string;
  lon: string;
  source?: "google" | "nominatim";
  place_id?: string;
  type?: string;
};

function normalizeGooglePlace(place: any): GeocodeSuggestion | null {
  const lat = place?.location?.latitude;
  const lon = place?.location?.longitude;
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const name = place?.displayName?.text || "";
  const address = place?.formattedAddress || "";
  const displayName = [name, address].filter(Boolean).join(", ");

  return {
    display_name: displayName || `${lat}, ${lon}`,
    lat: String(lat),
    lon: String(lon),
    source: "google",
    place_id: place?.id || place?.name,
    type: Array.isArray(place?.types) ? place.types[0] : undefined,
  };
}

async function searchGooglePlaces(
  query: string,
  limit: number,
): Promise<GeocodeSuggestion[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "es",
      regionCode: "PY",
      pageSize: Math.min(Math.max(limit, 1), 20),
      locationBias: {
        rectangle: {
          low: { latitude: -27.7, longitude: -62.9 },
          high: { latitude: -19.2, longitude: -54.2 },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`google_places_${response.status}_${body.slice(0, 120)}`);
  }

  const data = await response.json();
  return (Array.isArray(data?.places) ? data.places : [])
    .map(normalizeGooglePlace)
    .filter(Boolean)
    .slice(0, limit) as GeocodeSuggestion[];
}

async function ensureDatabaseCompatibility() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`,
  );

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "adminFee" DOUBLE PRECISION`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "driverEarnings" DOUBLE PRECISION`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "officialFare" DOUBLE PRECISION`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "collectedFare" DOUBLE PRECISION`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "underchargeAmount" DOUBLE PRECISION DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "driverBlocked" BOOLEAN NOT NULL DEFAULT false`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "driverBlockedReason" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionDebt" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "underchargeDebt" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "delinquencyCount" INTEGER NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3)`,
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriverSessionStatus') THEN
        CREATE TYPE "DriverSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'RESTING');
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DriverSession" (
      "id" TEXT NOT NULL,
      "driverId" TEXT NOT NULL,
      "status" "DriverSessionStatus" NOT NULL DEFAULT 'ACTIVE',
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endedAt" TIMESTAMP(3),
      "restUntil" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "DriverSession_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DriverSession_driverId_status_idx" ON "DriverSession"("driverId", "status")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DriverSession_driverId_restUntil_idx" ON "DriverSession"("driverId", "restUntil")`,
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriverCommissionSettlementStatus') THEN
        CREATE TYPE "DriverCommissionSettlementStatus" AS ENUM ('PENDING', 'PAID');
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DriverCommissionSettlement" (
      "id" TEXT NOT NULL,
      "driverId" TEXT NOT NULL,
      "serviceDate" TIMESTAMP(3) NOT NULL,
      "amountDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "paidAt" TIMESTAMP(3),
      "receiptNumber" TEXT,
      "status" "DriverCommissionSettlementStatus" NOT NULL DEFAULT 'PENDING',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "DriverCommissionSettlement_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DriverCommissionDeposit" (
      "id" TEXT NOT NULL,
      "driverId" TEXT NOT NULL,
      "managedById" TEXT,
      "driverName" TEXT NOT NULL,
      "managedByName" TEXT NOT NULL,
      "receiptNumber" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "delinquencyCountAtRelease" INTEGER NOT NULL,
      "managedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DriverCommissionDeposit_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "DriverCommissionSettlement_driverId_serviceDate_key" ON "DriverCommissionSettlement"("driverId", "serviceDate")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DriverCommissionSettlement_driverId_status_idx" ON "DriverCommissionSettlement"("driverId", "status")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DriverCommissionDeposit_driverId_managedAt_idx" ON "DriverCommissionDeposit"("driverId", "managedAt")`,
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DriverSession_driverId_fkey'
      ) THEN
        ALTER TABLE "DriverSession"
          ADD CONSTRAINT "DriverSession_driverId_fkey"
          FOREIGN KEY ("driverId")
          REFERENCES "User"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DriverCommissionSettlement_driverId_fkey'
      ) THEN
        ALTER TABLE "DriverCommissionSettlement"
          ADD CONSTRAINT "DriverCommissionSettlement_driverId_fkey"
          FOREIGN KEY ("driverId")
          REFERENCES "User"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DriverCommissionDeposit_driverId_fkey'
      ) THEN
        ALTER TABLE "DriverCommissionDeposit"
          ADD CONSTRAINT "DriverCommissionDeposit_driverId_fkey"
          FOREIGN KEY ("driverId")
          REFERENCES "User"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DriverCommissionDeposit_managedById_fkey'
      ) THEN
        ALTER TABLE "DriverCommissionDeposit"
          ADD CONSTRAINT "DriverCommissionDeposit_managedById_fkey"
          FOREIGN KEY ("managedById")
          REFERENCES "User"("id")
          ON DELETE SET NULL
          ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));

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
const COMMISSION_RATE = 0.05;
const COMMISSION_DEADLINE_HOUR = 9;
const DRIVER_SUSPENSION_MS = 5 * 24 * 60 * 60 * 1000;

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function nextDayCommissionDeadline(serviceDate: Date) {
  const deadline = startOfDay(serviceDate);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(COMMISSION_DEADLINE_HOUR, 0, 0, 0);
  return deadline;
}

function isSettlementOverdue(serviceDate: Date, now = new Date()) {
  return now.getTime() >= nextDayCommissionDeadline(serviceDate).getTime();
}

function calculateCommission(fare: number) {
  return Math.round(Math.max(Number(fare) || 0, 0) * COMMISSION_RATE);
}

function calculateDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(originLat)) *
      Math.cos(toRad(destLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

async function syncDriverCommissionOperations(driverId: string) {
  const now = new Date();
  const rides = await prisma.ride.findMany({
    where: {
      driverId,
      state: RideState.FINALIZADO,
      completedAt: { not: null },
    },
    select: {
      completedAt: true,
      estimatedFare: true,
      finalFare: true,
      officialFare: true,
      adminFee: true,
      underchargeAmount: true,
    },
  });

  const commissionByDate = new Map<string, number>();
  let todayGross = 0;
  let todayCommission = 0;
  let todayEarnings = 0;
  let todayUndercharge = 0;
  const todayKey = startOfDay(now).toISOString();

  rides.forEach((ride) => {
    const rideOperational = ride as any;
    const serviceDate = startOfDay(ride.completedAt || now);
    const key = serviceDate.toISOString();
    const officialFare = rideOperational.officialFare ?? ride.estimatedFare ?? ride.finalFare ?? 0;
    const commission = ride.adminFee ?? calculateCommission(officialFare);
    const undercharge = rideOperational.underchargeAmount ?? 0;

    commissionByDate.set(key, (commissionByDate.get(key) || 0) + commission);

    if (key === todayKey) {
      todayGross += officialFare;
      todayCommission += commission;
      todayUndercharge += undercharge;
      todayEarnings += Math.max(officialFare - commission - undercharge, 0);
    }
  });

  for (const [key, amountDue] of commissionByDate) {
    await operationalDb.driverCommissionSettlement.upsert({
      where: {
        driverId_serviceDate: {
          driverId,
          serviceDate: new Date(key),
        },
      },
      create: {
        driverId,
        serviceDate: new Date(key),
        amountDue,
      },
      update: {
        amountDue,
      },
    });
  }

  const pendingSettlements = await operationalDb.driverCommissionSettlement.findMany({
    where: {
      driverId,
      status: "PENDING",
      amountDue: { gt: 0 },
    },
    orderBy: { serviceDate: "asc" },
  });

  const overdueSettlements = pendingSettlements.filter((settlement: any) =>
    isSettlementOverdue(settlement.serviceDate, now),
  );
  const commissionDebt = overdueSettlements.reduce(
    (sum: number, settlement: any) => sum + settlement.amountDue,
    0,
  );
  const totalPendingCommission = pendingSettlements.reduce(
    (sum: number, settlement: any) => sum + settlement.amountDue,
    0,
  );

  const driver = await operationalDb.user.findUnique({
    where: { id: driverId },
    select: {
      id: true,
      driverBlocked: true,
      driverBlockedReason: true,
      commissionDebt: true,
      suspendedUntil: true,
      delinquencyCount: true,
      underchargeDebt: true,
    },
  });

  const driverOperational = driver as any;
  const suspendedUntil = driverOperational?.suspendedUntil as Date | null | undefined;
  const suspended =
    !!suspendedUntil && suspendedUntil.getTime() > now.getTime();
  const blocked = suspended || commissionDebt > 0;
  const blockedReason = suspended
    ? "suspended_for_delinquency"
    : commissionDebt > 0
      ? "commission_deposit_overdue"
      : null;

  if (
    driver &&
    (driverOperational.driverBlocked !== blocked ||
      driverOperational.driverBlockedReason !== blockedReason ||
      driverOperational.commissionDebt !== commissionDebt)
  ) {
    await operationalDb.user.update({
      where: { id: driverId },
      data: {
        driverBlocked: blocked,
        driverBlockedReason: blockedReason,
        commissionDebt,
      },
    });
  }

  return {
    todayGross,
    todayCommission,
    todayEarnings,
    todayUndercharge,
    totalPendingCommission,
    overdueCommission: commissionDebt,
    blocked,
    blockedReason,
    suspendedUntil: suspendedUntil || null,
    delinquencyCount: driverOperational?.delinquencyCount || 0,
    underchargeDebt: driverOperational?.underchargeDebt || 0,
    settlements: pendingSettlements,
  };
}

async function getDriverOperationalStatus(driverId: string) {
  const summary = await syncDriverCommissionOperations(driverId);

  if (summary.blocked) {
    return {
      ok: false,
      reason: summary.blockedReason || "driver_blocked",
      amountDue: summary.overdueCommission,
      suspendedUntil: summary.suspendedUntil,
    };
  }

  return { ok: true };
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
      include: { vehicles: true },
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
      (!user.approved || user.documentStatus === "REJECTED")
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

    const { password: _, vehicles, ...safeUser } = user;

    return res.json({
      token,
      user: {
        ...safeUser,
        vehicle: vehicles?.[0] || null,
      },
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
        photoUrl,
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
            photoUrl,
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
              photoUrl,
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
// ME
// =====================

app.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "missing_user" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { vehicles: true },
    });

    if (!user) return res.status(404).json({ error: "not_found" });

    if (user.role === "DRIVER") {
      await syncDriverCommissionOperations(user.id);
    }

    const refreshed =
      user.role === "DRIVER"
        ? await prisma.user.findUnique({
            where: { id: userId },
            include: { vehicles: true },
          })
        : user;

    if (!refreshed) return res.status(404).json({ error: "not_found" });

    const { password, vehicles, ...safe } = refreshed;

    return res.json({
      ...safe,
      vehicle: vehicles?.[0] || null,
    });
  } catch (err) {
    console.error("GET ME ERROR:", err);
    return res.status(500).json({ error: "failed_get_me" });
  }
});

app.put("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "missing_user" });

    const {
      name,
      phone,
      photoUrl,
      placa,
      marca,
      modelo,
      color,
      year,
      capacidad,
    } = req.body ?? {};

    const current = await prisma.user.findUnique({
      where: { id: userId },
      include: { vehicles: true },
    });

    if (!current) return res.status(404).json({ error: "not_found" });

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : current.name,
        phone: typeof phone === "string" ? phone.trim() || null : current.phone,
        photoUrl:
          typeof photoUrl === "string" ? photoUrl.trim() || null : current.photoUrl,
      },
    });

    if (current.role === "DRIVER") {
      const hasVehicleData = [placa, marca, modelo, color].some(
        (value) => typeof value === "string" && value.trim(),
      );

      if (hasVehicleData) {
        const existingVehicle = current.vehicles?.[0];
        const vehicleData = {
          placa:
            typeof placa === "string" && placa.trim()
              ? placa.trim().toUpperCase()
              : existingVehicle?.placa || "",
          marca:
            typeof marca === "string" ? marca.trim() : existingVehicle?.marca,
          modelo:
            typeof modelo === "string" ? modelo.trim() : existingVehicle?.modelo,
          color:
            typeof color === "string" ? color.trim() : existingVehicle?.color,
          year: year ? Number(year) : existingVehicle?.year,
          capacidad: capacidad ? Number(capacidad) : existingVehicle?.capacidad,
          estado: existingVehicle?.estado || "DISPONIBLE",
          driverId: userId,
        };

        if (existingVehicle) {
          await prisma.vehicle.update({
            where: { id: existingVehicle.id },
            data: vehicleData,
          });
        } else if (vehicleData.placa) {
          await prisma.vehicle.create({
            data: vehicleData,
          });
        }
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      include: { vehicles: true },
    });

    if (!updated) return res.status(404).json({ error: "not_found" });

    const { password, vehicles, ...safe } = updated;
    return res.json({
      ...safe,
      vehicle: vehicles?.[0] || null,
    });
  } catch (err) {
    console.error("UPDATE ME ERROR:", err);
    return res.status(500).json({ error: "failed_update_me" });
  }
});

app.get("/me/rides", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId || !role) return res.status(401).json({ error: "missing_user" });

    const rides = await prisma.ride.findMany({
      where:
        role === "DRIVER"
          ? { driverId: userId }
          : role === "PASSENGER"
            ? { passengerId: userId }
            : {},
      include: {
        passenger: true,
        driver: true,
        vehicle: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const result = rides.map((ride) => {
      const rideOperational = ride as any;
      const officialFare = rideOperational.officialFare ?? ride.estimatedFare ?? 0;
      const collectedFare = rideOperational.collectedFare ?? ride.finalFare ?? officialFare;
      const adminFee = ride.adminFee ?? calculateCommission(officialFare);
      const underchargeAmount =
        rideOperational.underchargeAmount ?? Math.max(officialFare - collectedFare, 0);
      const driverEarnings =
        ride.driverEarnings ?? Math.max(officialFare - adminFee - underchargeAmount, 0);
      const distanceKm = calculateDistanceKm(
        ride.originLat,
        ride.originLng,
        ride.destLat,
        ride.destLng,
      );

      if (role === "DRIVER") {
        const { passenger, driver, ...safeRide } = ride;
        return {
          ...safeRide,
          passengerName: passenger?.name || "Pasajero",
          officialFare,
          collectedFare,
          adminFee,
          underchargeAmount,
          driverEarnings,
          distanceKm,
        };
      }

      return {
        ...ride,
        officialFare,
        collectedFare,
        adminFee,
        underchargeAmount,
        driverEarnings,
        distanceKm,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("GET ME RIDES ERROR:", err);
    return res.status(500).json({ error: "failed_get_me_rides" });
  }
});

app.get("/me/driver/summary", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== "DRIVER") {
      return res.status(403).json({ error: "forbidden" });
    }

    const summary = await syncDriverCommissionOperations(userId);
    return res.json(summary);
  } catch (err) {
    console.error("GET DRIVER SUMMARY ERROR:", err);
    return res.status(500).json({ error: "failed_get_driver_summary" });
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

app.get("/admin/drivers/operations", authMiddleware, async (req, res) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "forbidden" });
    }

    const driversList = await operationalDb.user.findMany({
      where: { role: "DRIVER" },
      include: {
        vehicles: true,
        driverCommissionSettlements: {
          where: { status: "PENDING" },
          orderBy: { serviceDate: "asc" },
        },
        driverCommissionDeposits: {
          orderBy: { managedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = [];
    for (const driver of driversList) {
      const summary = await syncDriverCommissionOperations(driver.id);
      const refreshed = await operationalDb.user.findUnique({
        where: { id: driver.id },
        include: {
          vehicles: true,
          driverCommissionSettlements: {
            where: { status: "PENDING" },
            orderBy: { serviceDate: "asc" },
          },
          driverCommissionDeposits: {
            orderBy: { managedAt: "desc" },
            take: 1,
          },
        },
      });
      if (!refreshed) continue;

      const { password, vehicles, ...safe } = refreshed;
      enriched.push({
        ...safe,
        vehicle: vehicles?.[0] || null,
        operationalSummary: summary,
      });
    }

    return res.json({
      drivers: enriched,
      blockedDrivers: enriched.filter(
        (driver: any) =>
          (driver as any).driverBlocked ||
          driver.operationalSummary?.overdueCommission > 0 ||
          ((driver as any).suspendedUntil &&
            new Date((driver as any).suspendedUntil).getTime() > Date.now()),
      ),
    });
  } catch (err) {
    console.error("GET DRIVER OPERATIONS ERROR:", err);
    return res.status(500).json({ error: "failed_get_driver_operations" });
  }
});

app.post("/admin/drivers/:id/release-commission", authMiddleware, async (req, res) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "forbidden" });
    }

    const driverId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const receiptNumber = String(req.body?.receiptNumber || "").trim();

    if (!receiptNumber) {
      return res.status(400).json({ error: "missing_receipt_number" });
    }

    const driver = await operationalDb.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.role !== "DRIVER") {
      return res.status(404).json({ error: "driver_not_found" });
    }

    const now = new Date();
    const driverOperational = driver as any;
    const currentSuspendedUntil = driverOperational.suspendedUntil as Date | null | undefined;
    if (currentSuspendedUntil && currentSuspendedUntil.getTime() > now.getTime()) {
      return res.status(409).json({
        error: "driver_suspended",
        suspendedUntil: currentSuspendedUntil,
      });
    }

    await syncDriverCommissionOperations(driverId);
    const pendingSettlements = await operationalDb.driverCommissionSettlement.findMany({
      where: {
        driverId,
        status: "PENDING",
        amountDue: { gt: 0 },
      },
    });
    const overdueSettlements = pendingSettlements.filter((settlement: any) =>
      isSettlementOverdue(settlement.serviceDate, now),
    );
    const overdueSettlementIds = overdueSettlements.map((settlement: any) => settlement.id);
    const amount = overdueSettlements.reduce((sum: number, item: any) => sum + item.amountDue, 0);

    if (amount <= 0) {
      return res.status(400).json({ error: "no_pending_commission" });
    }

    const admin = req.user?.id
      ? await prisma.user.findUnique({ where: { id: req.user.id } })
      : null;
    const delinquencyCount = (driverOperational.delinquencyCount || 0) + 1;
    const shouldSuspend = delinquencyCount > 3;
    const suspendedUntil = shouldSuspend
      ? new Date(now.getTime() + DRIVER_SUSPENSION_MS)
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const operationalTx = tx as any;
      await operationalTx.driverCommissionSettlement.updateMany({
        where: {
          id: { in: overdueSettlementIds },
        },
        data: {
          status: "PAID",
          paidAt: now,
          receiptNumber,
        },
      });

      const deposit = await operationalTx.driverCommissionDeposit.create({
        data: {
          driverId,
          managedById: admin?.id,
          driverName: driver.name,
          managedByName: admin?.name || "Administrador",
          receiptNumber,
          amount,
          delinquencyCountAtRelease: delinquencyCount,
        },
      });

      const updatedDriver = await operationalTx.user.update({
        where: { id: driverId },
        data: {
          commissionDebt: 0,
          driverBlocked: shouldSuspend,
          driverBlockedReason: shouldSuspend ? "suspended_for_delinquency" : null,
          delinquencyCount,
          suspendedUntil,
        },
      });

      return { deposit, driver: updatedDriver };
    });

    const { password, ...safeDriver } = result.driver;
    return res.json({
      ok: true,
      deposit: result.deposit,
      driver: safeDriver,
      suspended: shouldSuspend,
      suspendedUntil,
    });
  } catch (err) {
    console.error("RELEASE DRIVER COMMISSION ERROR:", err);
    return res.status(500).json({ error: "failed_release_driver_commission" });
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
      const stateList = (Array.isArray(states) ? states : [states])
        .flatMap((state) => String(state).split(","))
        .map((state) => state.trim())
        .filter(Boolean);

      if (stateList.length === 1) {
        where.state = stateList[0];
      } else if (stateList.length > 1) {
        where.state = {
          in: stateList,
        };
      }
    }

    if (req.user?.role === "PASSENGER" && req.user.id) {
      where.passengerId = req.user.id;
    } else if (req.user?.role === "DRIVER" && req.user.id) {
      if (where.state === RideState.PENDIENTE) {
        where.driverId = null;
      } else {
        where.driverId = req.user.id;
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

    const normalizedQuery = (() => {
      const lower = query
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (
        lower.includes("una") &&
        lower.includes("facultad") &&
        lower.includes("ciencias") &&
        lower.includes("quim")
      ) {
        return "Facultad de Ciencias Quimicas San Lorenzo Paraguay";
      }

      if (lower.includes("fcq")) {
        return "FCQ San Lorenzo Paraguay";
      }

      return query;
    })();

    if (process.env.GOOGLE_PLACES_API_KEY) {
      try {
        const googleSuggestions = await searchGooglePlaces(
          normalizedQuery,
          limit,
        );
        if (googleSuggestions.length > 0) {
          return res.json(googleSuggestions);
        }
      } catch (err) {
        console.warn("GOOGLE PLACES ERROR, falling back to Nominatim:", err);
      }
    }

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      normalizedQuery
    )}&format=json&limit=${limit}&countrycodes=py&accept-language=es&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "movi-app",
      },
    });

    const data = await response.json();

    const suggestions = (Array.isArray(data) ? data : []).map((item: any) => ({
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon,
      source: "nominatim",
      place_id: item.place_id ? String(item.place_id) : undefined,
      type: item.type,
    }));

    return res.json(suggestions || []);
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

const drivers = io.of("/drivers");
const passengers = io.of("/passengers");
const DRIVER_SESSION_LIMIT_MS = 12 * 60 * 60 * 1000;
const DRIVER_REST_MS = 6 * 60 * 60 * 1000;

function socketAuth(namespace: ReturnType<typeof io.of>) {
  namespace.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth as any)?.token ||
        (socket.handshake.headers?.authorization as string | undefined)?.replace(
          /^Bearer\s+/,
          "",
        );

      if (!token) return next(new Error("missing_token"));

      const payload = jwt.verify(token, JWT_SECRET) as any;
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("invalid_token"));
    }
  });
}

socketAuth(passengers);
socketAuth(drivers);

export async function createRide({
  passengerId,
  origin,
  destination,
  estimatedFare,
}: {
  passengerId: string;
  origin: GeoLocation;
  destination: GeoLocation;
  estimatedFare: number;
}) {
  return prisma.ride.create({
    data: {
      passenger: {
        connectOrCreate: {
          where: { id: passengerId },
          create: {
            id: passengerId,
            name: "Pasajero",
            email: `${passengerId}@example.local`,
            password: "",
            role: "PASSENGER",
          },
        },
      },
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: destination.lat,
      destLng: destination.lng,
      estimatedFare,
      state: RideState.PENDIENTE,
    },
    include: { passenger: true },
  });
}

async function updateRideState(rideId: string, newState: RideState) {
  return prisma.ride.update({
    where: { id: rideId },
    data: { state: newState },
    include: { passenger: true, driver: true, vehicle: true },
  });
}

async function canUserAccessRide(
  rideId: string,
  userId: string,
  role: "PASSENGER" | "DRIVER",
) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { id: true, state: true, passengerId: true, driverId: true },
  });

  if (!ride) return false;
  if (ride.state === RideState.PENDIENTE || ride.state === RideState.CANCELADO) {
    return false;
  }
  if (role === "PASSENGER" && ride.passengerId !== userId) return false;
  if (role === "DRIVER" && ride.driverId !== userId) return false;

  return true;
}

async function ensureDriverCanWork(driverId: string) {
  const operationalStatus = await getDriverOperationalStatus(driverId);
  if (!operationalStatus.ok) return operationalStatus;

  const now = new Date();

  const restingSession = await prisma.driverSession.findFirst({
    where: {
      driverId,
      status: "RESTING",
      restUntil: { gt: now },
    },
    orderBy: { restUntil: "desc" },
  });

  if (restingSession?.restUntil) {
    return {
      ok: false,
      reason: "driver_must_rest",
      restUntil: restingSession.restUntil,
    };
  }

  const activeSession = await prisma.driverSession.findFirst({
    where: { driverId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  });

  if (!activeSession) {
    await prisma.driverSession.create({
      data: { driverId, status: "ACTIVE" },
    });
    return { ok: true };
  }

  const elapsed = now.getTime() - activeSession.startedAt.getTime();
  if (elapsed <= DRIVER_SESSION_LIMIT_MS) {
    return { ok: true };
  }

  const restUntil = new Date(now.getTime() + DRIVER_REST_MS);
  await prisma.driverSession.update({
    where: { id: activeSession.id },
    data: {
      status: "RESTING",
      endedAt: now,
      restUntil,
    },
  });

  return {
    ok: false,
    reason: "driver_session_limit_reached",
    restUntil,
  };
}

async function finishExpiredDriverSession(driverId: string) {
  const activeSession = await prisma.driverSession.findFirst({
    where: { driverId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  });

  if (!activeSession) return;

  const now = new Date();
  const elapsed = now.getTime() - activeSession.startedAt.getTime();
  if (elapsed < DRIVER_SESSION_LIMIT_MS) return;

  await prisma.driverSession.update({
    where: { id: activeSession.id },
    data: {
      status: "RESTING",
      endedAt: now,
      restUntil: new Date(now.getTime() + DRIVER_REST_MS),
    },
  });
}

drivers.on("connection", (socket) => {
  console.log("Driver connected:", socket.id);

  const driverId = socket.data.userId;
  if (driverId) {
    socket.join(`driver:${driverId}`);
  }

  socket.on("ride:join", async (data: { rideId: string; userId: string }) => {
    if (!data?.rideId || !data?.userId) return;

    const ok = await canUserAccessRide(data.rideId, data.userId, "DRIVER");
    if (!ok) return;

    socket.join(`ride:${data.rideId}`);
    socket.emit("ride:join_ok", { rideId: data.rideId });
  });

  socket.on(
    "ride:chat_message",
    async (msg: {
      rideId: string;
      userId: string;
      text: string;
      ts?: number;
    }) => {
      if (!msg?.rideId || !msg?.userId || !msg?.text) return;

      const ok = await canUserAccessRide(msg.rideId, msg.userId, "DRIVER");
      if (!ok) return;

      const payload = {
        rideId: msg.rideId,
        userId: msg.userId,
        role: "DRIVER",
        text: msg.text,
        ts: msg.ts ?? Date.now(),
      };

      passengers.to(`ride:${msg.rideId}`).emit("ride:chat_message", payload);
      drivers.to(`ride:${msg.rideId}`).emit("ride:chat_message", payload);
    },
  );

  (async () => {
    try {
      const pending = await prisma.ride.findMany({
        where: { state: RideState.PENDIENTE },
        include: { passenger: true },
      });

      pending.forEach((ride) => {
        socket.emit("driver:nearby_request", {
          rideId: ride.id,
          passengerId: ride.passengerId,
          passengerName: ride.passenger?.name || "Pasajero",
          origin: { lat: ride.originLat, lng: ride.originLng },
          destination: { lat: ride.destLat, lng: ride.destLng },
          estimatedFare: ride.estimatedFare,
        });
      });
    } catch (err) {
      console.error("Error sending pending rides to driver:", err);
    }
  })();

  socket.on("driver:location", (loc: GeoLocation) => {
    io.emit("ride:tracking", loc);
  });

  socket.on(
    "driver:accept_ride",
    async (data: {
      rideId: string;
      driverId: string;
      vehicleId?: string;
      vehicle?: {
        placa?: string;
        marca?: string;
        modelo?: string;
        color?: string;
      };
    }) => {
      try {
        if (!data.driverId) {
          socket.emit("driver:accept_failed", {
            rideId: data.rideId,
            reason: "missing_driver",
          });
          return;
        }

        const workStatus = await ensureDriverCanWork(data.driverId);
        if (!workStatus.ok) {
          const failedStatus = workStatus as any;
          socket.emit("driver:accept_failed", {
            rideId: data.rideId,
            reason: failedStatus.reason,
            restUntil: failedStatus.restUntil,
            amountDue: failedStatus.amountDue,
            suspendedUntil: failedStatus.suspendedUntil,
          });
          return;
        }

        const claim = await prisma.ride.updateMany({
          where: {
            id: data.rideId,
            state: RideState.PENDIENTE,
            driverId: null,
          },
          data: {
            state: RideState.ASIGNADO,
            driverId: data.driverId,
            acceptedAt: new Date(),
          },
        });

        if (claim.count !== 1) {
          socket.emit("driver:accept_failed", {
            rideId: data.rideId,
            reason: "ride_already_taken",
          });

          drivers.emit("ride:status_changed", {
            rideId: data.rideId,
            newState: RideState.ASIGNADO,
          });
          return;
        }

        if (data.vehicleId) {
          await prisma.vehicle.upsert({
            where: { id: data.vehicleId },
            update: {
              placa: data.vehicle?.placa ?? data.vehicleId,
              marca: data.vehicle?.marca ?? undefined,
              modelo: data.vehicle?.modelo ?? undefined,
              color: data.vehicle?.color ?? undefined,
              driverId: data.driverId ?? null,
            },
            create: {
              id: data.vehicleId,
              placa: data.vehicle?.placa ?? data.vehicleId,
              marca: data.vehicle?.marca ?? undefined,
              modelo: data.vehicle?.modelo ?? undefined,
              color: data.vehicle?.color ?? undefined,
              estado: "DISPONIBLE",
              driverId: data.driverId ?? null,
            },
          });
        }

        const updated = await prisma.ride.update({
          where: { id: data.rideId },
          data: {
            vehicle: data.vehicleId
              ? { connect: { id: data.vehicleId } }
              : undefined,
          },
          include: {
            passenger: true,
            driver: true,
            vehicle: true,
          },
        });

        socket.join(`ride:${updated.id}`);
        socket.emit("driver:accept_ok", updated);

        passengers
          .to(`passenger:${updated.passengerId}`)
          .emit("ride:assigned", updated);

        const statusPayload = {
          rideId: updated.id,
          newState: updated.state,
        };

        drivers.emit("ride:status_changed", statusPayload);
        passengers.emit("ride:status_changed", statusPayload);
        io.emit("ride:status_changed", statusPayload);
      } catch (err) {
        console.error("driver:accept_ride error:", err);
      }
    },
  );

  socket.on("driver:start_ride", async (rideId: string) => {
    try {
      const driverId = socket.data.userId;
      if (!driverId) return;

      const workStatus = await ensureDriverCanWork(driverId);
      if (!workStatus.ok) {
        const failedStatus = workStatus as any;
        socket.emit("driver:start_failed", {
          rideId,
          reason: failedStatus.reason,
          restUntil: failedStatus.restUntil,
          amountDue: failedStatus.amountDue,
          suspendedUntil: failedStatus.suspendedUntil,
        });
        return;
      }

      const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { id: true, driverId: true, state: true },
      });

      if (!ride || ride.driverId !== driverId || ride.state !== RideState.ASIGNADO) {
        socket.emit("driver:start_failed", {
          rideId,
          reason: "ride_not_assigned_to_driver",
        });
        return;
      }

      const updated = await prisma.ride.update({
        where: { id: rideId },
        data: { state: RideState.EN_CURSO, startedAt: new Date() },
        include: { passenger: true, driver: true, vehicle: true },
      });
      passengers.emit("ride:status_changed", {
        rideId,
        newState: updated.state,
      });
      drivers.emit("ride:status_changed", {
        rideId,
        newState: updated.state,
      });
    } catch (err) {
      console.error("driver:start_ride error:", err);
    }
  });

  socket.on(
    "driver:end_ride",
    async (
      data: string | { rideId: string; finalFare?: number; state?: RideState },
    ) => {
      try {
        const driverId = socket.data.userId;
        const rideId = typeof data === "string" ? data : data.rideId;
        const finalFare =
          typeof data === "object" ? data.finalFare : undefined;
        const isCancelled =
          typeof data === "object" && data.state === RideState.CANCELADO;
        const newState = isCancelled
          ? RideState.CANCELADO
          : RideState.FINALIZADO;

        const ride = await prisma.ride.findUnique({
          where: { id: rideId },
          select: {
            id: true,
            driverId: true,
            state: true,
            estimatedFare: true,
            officialFare: true,
          },
        });

        if (!ride || ride.driverId !== driverId) {
          socket.emit("driver:end_failed", {
            rideId,
            reason: "ride_not_assigned_to_driver",
          });
          return;
        }

        if (ride.state !== RideState.EN_CURSO && !isCancelled) {
          socket.emit("driver:end_failed", {
            rideId,
            reason: "ride_not_in_progress",
          });
          return;
        }

        const updateData: any = { state: newState };
        if (finalFare !== undefined && finalFare !== null) {
          const rideOperational = ride as any;
          const officialFare = rideOperational.officialFare ?? ride.estimatedFare ?? finalFare;
          const collectedFare = Math.max(Number(finalFare) || 0, 0);
          const underchargeAmount = Math.max(officialFare - collectedFare, 0);
          const adminFee = calculateCommission(officialFare);

          updateData.officialFare = officialFare;
          updateData.finalFare = officialFare;
          updateData.collectedFare = collectedFare;
          updateData.underchargeAmount = underchargeAmount;
          updateData.adminFee = adminFee;
          updateData.driverEarnings = Math.max(
            officialFare - adminFee - underchargeAmount,
            0,
          );
        }
        if (newState === RideState.FINALIZADO) updateData.completedAt = new Date();
        if (newState === RideState.CANCELADO) updateData.cancelledAt = new Date();

        const updated = await prisma.ride.update({
          where: { id: rideId },
          data: updateData,
          include: { passenger: true, driver: true, vehicle: true },
        });

        if (updated.driverId && updated.state === RideState.FINALIZADO) {
          await syncDriverCommissionOperations(updated.driverId);
        }

        const updatedOperational = updated as any;
        const payload = {
          rideId,
          newState: updated.state,
          finalFare: updated.finalFare,
          officialFare: updatedOperational.officialFare,
          collectedFare: updatedOperational.collectedFare,
          adminFee: updated.adminFee,
          driverEarnings: updated.driverEarnings,
        };

        passengers.emit("ride:status_changed", payload);
        drivers.emit("ride:status_changed", payload);
      } catch (err) {
        console.error("driver:end_ride error:", err);
      }
    },
  );

  socket.on("driver:confirm_payment", async (data: { rideId: string }) => {
    if (socket.data.userId) {
      await finishExpiredDriverSession(socket.data.userId);
    }
    passengers.emit("ride:payment_confirmed", { rideId: data.rideId });
    drivers.emit("ride:payment_confirmed", { rideId: data.rideId });
  });
});

passengers.on("connection", (socket) => {
  console.log("Passenger connected:", socket.id);

  const passengerId = socket.data.userId;
  if (passengerId) {
    socket.join(`passenger:${passengerId}`);
  }

  socket.on("ride:join", async (data: { rideId: string; userId: string }) => {
    if (!data?.rideId || !data?.userId) return;

    const ok = await canUserAccessRide(data.rideId, data.userId, "PASSENGER");
    if (!ok) return;

    socket.join(`ride:${data.rideId}`);
    socket.emit("ride:join_ok", { rideId: data.rideId });
  });

  socket.on(
    "ride:chat_message",
    async (msg: {
      rideId: string;
      userId: string;
      text: string;
      ts?: number;
    }) => {
      if (!msg?.rideId || !msg?.userId || !msg?.text) return;

      const ok = await canUserAccessRide(msg.rideId, msg.userId, "PASSENGER");
      if (!ok) return;

      const payload = {
        rideId: msg.rideId,
        userId: msg.userId,
        role: "PASSENGER",
        text: msg.text,
        ts: msg.ts ?? Date.now(),
      };

      passengers.to(`ride:${msg.rideId}`).emit("ride:chat_message", payload);
      drivers.to(`ride:${msg.rideId}`).emit("ride:chat_message", payload);
    },
  );

  socket.on("passenger:request_ride", async (data: any) => {
    try {
      console.log("passenger:request_ride received:", data);

      const ride = await createRide({
        passengerId: data.passengerId,
        origin: data.origin,
        destination: data.destination,
        estimatedFare: data.estimatedFare ?? 0,
      });

      drivers.emit("driver:nearby_request", {
        rideId: ride.id,
        passengerId: ride.passengerId,
        passengerName: ride.passenger?.name || "Pasajero",
        origin: { lat: ride.originLat, lng: ride.originLng },
        destination: { lat: ride.destLat, lng: ride.destLng },
        originName: data.originName,
        destName: data.destName,
        estimatedFare: ride.estimatedFare,
      });

      socket.join(`passenger:${ride.passengerId}`);
      socket.emit("ride:created", ride);
    } catch (err) {
      console.error("passenger:request_ride error:", err);
      socket.emit("ride:create_failed", { error: "create_ride_failed" });
    }
  });

  socket.on(
    "passenger:cancel_ride",
    async (cancelPayload: string | { rideId: string; reason?: string }) => {
      try {
        const rideId =
          typeof cancelPayload === "string"
            ? cancelPayload
            : cancelPayload?.rideId;
        const reason =
          typeof cancelPayload === "string"
            ? undefined
            : cancelPayload?.reason;

        if (!rideId) return;

        const updated = await updateRideState(rideId, RideState.CANCELADO);
        const payload = {
          rideId,
          newState: updated.state,
          reason,
        };

        passengers.to(`ride:${rideId}`).emit("ride:status_changed", payload);
        drivers.emit("ride:status_changed", payload);
        passengers
          .to(`passenger:${updated.passengerId}`)
          .emit("ride:status_changed", payload);

        if (updated.driverId) {
          drivers
            .to(`driver:${updated.driverId}`)
            .emit("ride:status_changed", payload);
        }
      } catch (err) {
        console.error("passenger:cancel_ride error:", err);
      }
    },
  );
});

const PORT = Number(process.env.PORT) || 8080;

async function startServer() {
  try {
    await prisma.$connect();
    await ensureDatabaseCompatibility();

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });
  } catch (err) {
    console.error("BOOT ERROR:", err);
    process.exit(1);
  }
}

void startServer();
