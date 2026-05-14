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

    const { password, vehicles, ...safe } = user;

    return res.json({
      ...safe,
      vehicle: vehicles?.[0] || null,
    });
  } catch (err) {
    console.error("GET ME ERROR:", err);
    return res.status(500).json({ error: "failed_get_me" });
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
      const paidFare = ride.finalFare ?? ride.estimatedFare ?? 0;
      const adminFee = Math.round(paidFare * 0.05);
      const driverEarnings = Math.max(paidFare - adminFee, 0);

      return {
        ...ride,
        adminFee,
        driverEarnings,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("GET ME RIDES ERROR:", err);
    return res.status(500).json({ error: "failed_get_me_rides" });
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

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      normalizedQuery
    )}&format=json&limit=${limit}&countrycodes=py&accept-language=es&addressdetails=1`;

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

const drivers = io.of("/drivers");
const passengers = io.of("/passengers");

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
        const ride = await prisma.ride.findUnique({
          where: { id: data.rideId },
        });
        if (!ride || ride.state !== RideState.PENDIENTE) return;

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
            state: RideState.ASIGNADO,
            driver: data.driverId
              ? { connect: { id: data.driverId } }
              : undefined,
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

        passengers
          .to(`passenger:${updated.passengerId}`)
          .emit("ride:assigned", updated);

        drivers.emit("ride:status_changed", {
          rideId: updated.id,
          newState: updated.state,
        });
      } catch (err) {
        console.error("driver:accept_ride error:", err);
      }
    },
  );

  socket.on("driver:start_ride", async (rideId: string) => {
    try {
      const updated = await updateRideState(rideId, RideState.EN_CURSO);
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
        const rideId = typeof data === "string" ? data : data.rideId;
        const finalFare =
          typeof data === "object" ? data.finalFare : undefined;
        const isCancelled =
          typeof data === "object" && data.state === RideState.CANCELADO;
        const newState = isCancelled
          ? RideState.CANCELADO
          : RideState.FINALIZADO;

        const updateData: any = { state: newState };
        if (finalFare !== undefined && finalFare !== null) {
          updateData.finalFare = finalFare;
        }

        const updated = await prisma.ride.update({
          where: { id: rideId },
          data: updateData,
          include: { passenger: true, driver: true, vehicle: true },
        });

        const payload = {
          rideId,
          newState: updated.state,
          finalFare: updated.finalFare,
        };

        passengers.emit("ride:status_changed", payload);
        drivers.emit("ride:status_changed", payload);
      } catch (err) {
        console.error("driver:end_ride error:", err);
      }
    },
  );

  socket.on("driver:confirm_payment", async (data: { rideId: string }) => {
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

        if (!rideId) return;

        const updated = await updateRideState(rideId, RideState.CANCELADO);
        const payload = {
          rideId,
          newState: updated.state,
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

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});
