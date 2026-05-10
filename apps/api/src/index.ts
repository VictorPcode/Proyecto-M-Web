// apps/api/src/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import prisma from "./prisma"; // Usamos la instancia compartida
import { GeoLocation } from "@movi/types"; // útil para tipado compartido frontend/backend
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

// In-memory password reset token store: token -> { userId, expiresAt }
const resetTokens = new Map<string, { userId: string; expiresAt: number }>();

function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ 
    host, 
    port, 
    secure: port === 465, 
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

// Extend Express Request type to include user property set by auth middleware
declare global {
  namespace Express {
    interface Request {
      user?: { sub?: string; role?: string };
    }
  }
}

console.log("[INIT] Creando app Express...");
// Enum temporal mientras no se regenere el cliente Prisma
enum RideState {
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

const app = express();
app.use(cors());
app.use(express.json());

// configurar multer para file uploads (máx 10MB por archivo, máx 50MB total)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 7 },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const auth = Array.isArray(req.headers.authorization)
  ? req.headers.authorization[0]
  : req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = { id: payload.sub, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

app.get("/health", (req, res) => res.json({ ok: true }));

// Endpoint para geocoding con Google APIs (evita CORS desde frontend)
app.get("/geocode", async (req, res) => {
  const { query, limit = 10 } = req.query;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query parameter required" });
  }

  const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
  const googleGeocodingKey = process.env.GOOGLE_GEOCODING_API_KEY;

  try {
    const results: any[] = [];

    // Google Places API
    if (googlePlacesKey) {
      const placesRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query + " Paraguay")}&language=es&key=${googlePlacesKey}`,
      );
      const placesData = await placesRes.json();

      if (placesData.results) {
        placesData.results.forEach((place: any) => {
          const placeName = place.name || "";
          // Filtrar códigos numéricos y Plus Codes
          if (
            placeName.match(/^\d{5,}$/) ||
            placeName.match(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}$/)
          ) {
            return;
          }

          const locality = place.formatted_address?.split(",")[1]?.trim() || "";
          results.push({
            id: `gp-${place.place_id}`,
            text: placeName,
            place_name: locality ? `${placeName} - ${locality}` : placeName,
            center: [place.geometry.location.lng, place.geometry.location.lat],
            type: "Feature",
          });
        });
      }
    }

    // Google Geocoding API (si no hay suficientes resultados)
    if (results.length < Number(limit) && googleGeocodingKey) {
      const geocodeRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query + ", Paraguay")}&language=es&key=${googleGeocodingKey}`,
      );
      const geocodeData = await geocodeRes.json();

      if (geocodeData.results) {
        geocodeData.results
          .slice(0, Number(limit) - results.length)
          .forEach((result: any) => {
            const components = result.address_components || [];
            const poi = components.find((c: any) =>
              c.types.includes("point_of_interest"),
            )?.long_name;
            const establishment = components.find((c: any) =>
              c.types.includes("establishment"),
            )?.long_name;
            const route = components.find((c: any) =>
              c.types.includes("route"),
            )?.long_name;
            const locality = components.find((c: any) =>
              c.types.includes("locality"),
            )?.long_name;

            let displayName =
              establishment ||
              poi ||
              route ||
              locality ||
              result.formatted_address.split(",")[0];

              // Filtrar códigos numéricos y Plus Codes
              if (displayName.match(/^\d{5,}$/) || isPlusCode(displayName)) {
              displayName = locality || result.formatted_address.split(",")[0];
            }

              const cleanDisplayName = cleanAddressLabel(displayName) || cleanAddressLabel(locality) || "Ubicación";

            results.push({
              id: `gc-${result.place_id}`,
                text: cleanDisplayName,
              place_name: locality
                  ? `${cleanDisplayName}, ${locality}`
                  : cleanDisplayName,
              center: [
                result.geometry.location.lng,
                result.geometry.location.lat,
              ],
              type: "Feature",
            });
          });
      }
    }

    res.json({ features: results.slice(0, Number(limit)) });
  } catch (error) {
    console.error("Geocoding error:", error);
    res.status(500).json({ error: "geocoding_failed" });
  }
});

// Endpoint para reverse geocoding
app.get("/reverse-geocode", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng parameters required" });
  }

  const googleGeocodingKey = process.env.GOOGLE_GEOCODING_API_KEY;

  try {
    // Google Geocoding API
    if (googleGeocodingKey) {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${googleGeocodingKey}`,
      );
      const data = await resp.json();

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const components = result.address_components || [];
        const locality = components.find((c: any) =>
          c.types.includes("locality"),
        )?.long_name;
        const route = components.find((c: any) =>
          c.types.includes("route"),
        )?.long_name;
        const streetNumber = components.find((c: any) =>
          c.types.includes("street_number"),
        )?.long_name;
        const neighborhood = components.find((c: any) =>
          c.types.includes("sublocality") || c.types.includes("neighborhood"),
        )?.long_name;

        const routeWithNumber = [route, streetNumber].filter(Boolean).join(" ").trim();
        const primary =
          cleanAddressLabel(routeWithNumber) ||
          cleanAddressLabel(neighborhood) ||
          cleanAddressLabel(locality) ||
          cleanAddressLabel(result.formatted_address) ||
          "Ubicación";

        const secondary = cleanAddressLabel(locality);
        const placeName = secondary && secondary !== primary
          ? `${primary}, ${secondary}`
          : primary;

        return res.json({
          place_name: placeName,
          text: primary,
          center: [Number(lng), Number(lat)],
        });
      }
    }

    // Fallback simple
    res.json({
      place_name: `Ubicación (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`,
      text: "Mi ubicación",
      center: [Number(lng), Number(lat)],
    });
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    res.status(500).json({ error: "reverse_geocoding_failed" });
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Namespaces
const drivers = io.of("/drivers");
const passengers = io.of("/passengers");

function socketAuth(namespace: ReturnType<typeof io.of>) {
  namespace.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth as any)?.token ||
        (
          socket.handshake.headers?.authorization as string | undefined
        )?.replace(/^Bearer\s+/, "");
      if (!token) return next(new Error("missing_token"));
      const payload = jwt.verify(token, JWT_SECRET) as any;
      (socket.data as any).userId = payload.sub;
      (socket.data as any).role = payload.role;
      next();
    } catch (e) {
      next(new Error("invalid_token"));
    }
  });
}

socketAuth(passengers);
socketAuth(drivers);

// Añadir endpoint para listar rides (antes de httpServer.listen)
app.get("/rides", authMiddleware, async (req, res) => {
  const state = req.query.state as string | undefined;
  let where: any = {};
  if (state) {
    const states = state.split(",").map((s) => s.trim()).filter(Boolean);
    where = states.length === 1
      ? { state: states[0] as RideState }
      : { state: { in: states as RideState[] } };
  }
  const rides = await prisma.ride.findMany({
    where,
    include: { passenger: true, driver: true, vehicle: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rides);
});

// Obtener perfil de usuario actual con vehiculo
app.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        vehicles: {
          take: 1,
        },
      },
    });

    if (!user) return res.status(404).json({ error: "not_found" });

    // Simplificar estructura para el frontend: user.vehicle = user.vehicles[0]
    const { password, ...safeUser } = user;
    const vehicle = user.vehicles[0] || null;

    // retornamos también el flag de aprobación para drivers
    res.json({ ...safeUser, vehicle });
  } catch (err) {
    console.error("Error fetching me:", err);
    res.status(500).json({ error: "failed" });
  }
});

// Crear usuario (registro simple)
app.post("/users", upload.fields([
  { name: 'docCedulaVerdeFront', maxCount: 1 },
  { name: 'docCedulaVerdeBack', maxCount: 1 },
  { name: 'docLicenseFront', maxCount: 1 },
  { name: 'docLicenseBack', maxCount: 1 },
  { name: 'docCedulaFront', maxCount: 1 },
  { name: 'docCedulaBack', maxCount: 1 },
  { name: 'docJudicialCert', maxCount: 1 },
]), async (req, res) => {
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
    
    const isUpdate = !!id; // Si viene id, es una actualización
    console.log(isUpdate ? "Intento de actualización:" : "Intento de registro:", { id, email, name, role });

    if (!email) {
      console.log("Falta email");
      return res.status(400).json({ error: "missing email" });
    }

    // Password es obligatorio solo para registro nuevo
    if (!isUpdate && !password) {
      console.log("Faltan password");
      return res.status(400).json({ error: "missing password" });
    }

    if (!name) {
      console.log("Falta nombre");
      return res.status(400).json({ error: "missing name" });
    }

    // Verificar si existe el email (solo si es registro nuevo o cambio de email)
    if (!isUpdate) {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        console.log("Email ya existe:", email);
        return res.status(409).json({ error: "email_exists" });
      }
    }
    
    // convertir archivos a base64
    const files = (req as any).files as { [key: string]: Express.Multer.File[] } | undefined;
    const docCedulaVerdeFrontB64 = files?.docCedulaVerdeFront?.[0]?.buffer?.toString('base64');
    const docCedulaVerdeBackB64 = files?.docCedulaVerdeBack?.[0]?.buffer?.toString('base64');
    const docLicenseFrontB64 = files?.docLicenseFront?.[0]?.buffer?.toString('base64');
    const docLicenseBackB64 = files?.docLicenseBack?.[0]?.buffer?.toString('base64');
    const docCedulaFrontB64 = files?.docCedulaFront?.[0]?.buffer?.toString('base64');
    const docCedulaBackB64 = files?.docCedulaBack?.[0]?.buffer?.toString('base64');
    const docJudicialCertB64 = files?.docJudicialCert?.[0]?.buffer?.toString('base64');
    
    let user: any;
    
    if (isUpdate) {
      // ACTUALIZACIÓN de usuario existente
      const updateData: any = {
        name,
        email,
        phone,
        licenseType,
        licenseNumber,
        // Si se actualizan documentos, volver a PENDING para revisión
        documentStatus: docCedulaVerdeFrontB64 ? "PENDING" : undefined,
        rejectionReason: docCedulaVerdeFrontB64 ? null : undefined, // limpiar razón si se re-suben documentos
      };
      
      // Solo actualizar documentos si se subieron nuevos
      if (docCedulaVerdeFrontB64) updateData.docCedulaVerdeFront = docCedulaVerdeFrontB64;
      if (docCedulaVerdeBackB64) updateData.docCedulaVerdeBack = docCedulaVerdeBackB64;
      if (docLicenseFrontB64) updateData.docLicenseFront = docLicenseFrontB64;
      if (docLicenseBackB64) updateData.docLicenseBack = docLicenseBackB64;
      if (docCedulaFrontB64) updateData.docCedulaFront = docCedulaFrontB64;
      if (docCedulaBackB64) updateData.docCedulaBack = docCedulaBackB64;
      if (docJudicialCertB64) updateData.docJudicialCert = docJudicialCertB64;
      
      user = await prisma.user.update({
        where: { id },
        data: updateData,
      });
      
      // Actualizar vehículo si existe
      if (placa || marca || modelo) {
        const existingVehicle = await prisma.vehicle.findFirst({
          where: { driverId: id },
        });
        
        if (existingVehicle) {
          await prisma.vehicle.update({
            where: { id: existingVehicle.id },
            data: {
              placa: placa || existingVehicle.placa,
              marca: marca || existingVehicle.marca,
              modelo: modelo || existingVehicle.modelo,
              color: color || existingVehicle.color,
              year: year ? parseInt(year) : existingVehicle.year,
              capacidad: capacidad ? parseInt(capacidad) : existingVehicle.capacidad,
            },
          });
        } else {
          // Crear vehículo si no existe
          await prisma.vehicle.create({
            data: {
              placa,
              marca,
              modelo,
              color,
              year: year ? parseInt(year) : undefined,
              capacidad: capacidad ? parseInt(capacidad) : 4,
              estado: "DISPONIBLE",
              driverId: id,
            },
          });
        }
      }
      
      console.log("Usuario actualizado exitosamente:", {
        id: user.id,
        email: user.email,
        name: user.name,
      });
    } else {
      // CREACIÓN de usuario nuevo
      const hashed = bcrypt.hashSync(String(password), 10);
      
      const createData: any = {
        name,
        email,
        password: hashed,
        role: role ?? "PASSENGER",
        phone,
        licenseType,
        licenseNumber,
        // admins are auto-approved, drivers need approval
        approved: role === "ADMIN" ? true : false,
        documentStatus: role === "ADMIN" ? "APPROVED" : "PENDING",
        // guardar documentos como base64
        docCedulaVerdeFront: docCedulaVerdeFrontB64,
        docCedulaVerdeBack: docCedulaVerdeBackB64,
        docLicenseFront: docLicenseFrontB64,
        docLicenseBack: docLicenseBackB64,
        docCedulaFront: docCedulaFrontB64,
        docCedulaBack: docCedulaBackB64,
        docJudicialCert: docJudicialCertB64,
      };

      user = await prisma.user.create({
        data: createData,
      });

      // if driver register with vehicle info
      if (user.role === "DRIVER" && placa) {
        await prisma.vehicle.create({
          data: {
            placa,
            marca,
            modelo,
            color,
            year: year ? parseInt(year) : undefined,
            capacidad: capacidad ? parseInt(capacidad) : 4,
            estado: "DISPONIBLE",
            driverId: user.id,
          },
        });
      }

      console.log("Usuario creado exitosamente:", {
        id: user.id,
        email: user.email,
        name: user.name,
      });
    }

    const { password: _pw, ...safe } = user as any;
    res.json(safe);
  } catch (err) {
    console.error("Error creating/updating user:", err);
    res.status(500).json({ error: "failed" });
  }
});

// Simple login: find user by email
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "missing email/password" });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "not_found" });
    const ok = bcrypt.compareSync(
      String(password),
      String(user.password ?? ""),
    );
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    // rejects drivers who have not yet been approved by an admin
    if (user.role === "DRIVER" && !(user as any).approved) {
      return res.status(403).json({ error: "not_approved" });
    }

    const secret = process.env.JWT_SECRET || "devsecret";
    const token = jwt.sign({ sub: user.id, role: user.role }, secret, {
      expiresIn: "7d",
    });
    const { password: _pw, ...safe } = user as any;
    res.json({ token, user: safe });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: "failed" });
  }
});

// Forgot password: generate reset token and send email
app.post("/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    const user = await prisma.user.findUnique({ where: { email } });
    // Always respond OK to avoid user enumeration
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    resetTokens.set(token, { userId: user.id, expiresAt });

    const webUrl = process.env.WEB_URL || "http://localhost:3000";
    const resetLink = `${webUrl}/reset-password?token=${token}`;

    const mailer = createMailTransporter();
    if (mailer) {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: "Recuperación de contraseña - MOVI",
        html: `<p>Hola ${user.name},</p><p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${resetLink}">Haz clic aquí para restablecer tu contraseña</a></p><p>El enlace expira en 1 hora.</p><p>Si no solicitaste esto, ignora este correo.</p>`,
      });
    } else {
      // No SMTP configured — log the link for dev
      console.log("[DEV] Reset link:", resetLink);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("forgot-password error", err);
    res.status(500).json({ error: "failed" });
  }
});

// Reset password: validate token and update password
app.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "token and password required" });
    if (String(password).length < 6) return res.status(400).json({ error: "password_too_short" });

    const entry = resetTokens.get(token);
    if (!entry) return res.status(400).json({ error: "invalid_token" });
    if (Date.now() > entry.expiresAt) {
      resetTokens.delete(token);
      return res.status(400).json({ error: "token_expired" });
    }

    const hashed = bcrypt.hashSync(String(password), 10);
    await prisma.user.update({ where: { id: entry.userId }, data: { password: hashed } });
    resetTokens.delete(token);

    res.json({ ok: true });
  } catch (err) {
    console.error("reset-password error", err);
    res.status(500).json({ error: "failed" });
  }
});

// Check if admin exists (for initial setup detection only)
app.post("/auth/admin/setup", async (req, res) => {
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });
    if (existingAdmin) {
      return res.status(409).json({ error: "admin_already_exists" });
    }
    res.status(200).json({ ready: true });
  } catch (err) {
    res.status(500).json({ error: "failed" });
  }
});

// Create new admin (requires existing admin authentication)
app.post("/auth/admin/create", authMiddleware, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "missing email/password" });
    }
    
    // Verify requester is admin
    const requesterId = (req.user as any)?.id;
    const requester = await prisma.user.findUnique({ where: { id: requesterId } });
    if (requester?.role !== "ADMIN") {
      return res.status(403).json({ error: "forbidden" });
    }

    // check if email is in use
    const emailExists = await prisma.user.findUnique({ where: { email } });
    if (emailExists) {
      return res.status(409).json({ error: "email_exists" });
    }

    const hashed = bcrypt.hashSync(String(password), 10);
    const admin = await (prisma.user as any).create({
      data: {
        name: "Administrador",
        email,
        password: hashed,
        role: "ADMIN",
        approved: true,
      } as any,
    });

    console.log("Admin creado exitosamente:", { id: admin.id, email: admin.email });
    
    const { password: _pw, ...safe } = admin as any;
    res.json({ success: true, user: safe });
  } catch (err) {
    console.error("admin creation error", err);
    res.status(500).json({ error: "failed" });
  }
});

// ---------------------
// Admin / user management
// ---------------------

// Only admins should be able to hit these endpoints
function adminOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req.user as any)?.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

// list users with optional filters (role, approved, documentStatus)
app.get("/users", authMiddleware, adminOnly, async (req, res) => {
  const { role, approved, documentStatus } = req.query;
  const where: any = {};
  if (role) where.role = role;
  if (approved !== undefined) where.approved = approved === "true";
  if (documentStatus) where.documentStatus = documentStatus;
  const users = await prisma.user.findMany({ where });
  res.json(users);
});

// approve a driver
app.post("/users/:id/approve", authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    // cast to any to avoid client type mismatch
    const user = await (prisma.user as any).update({
      where: { id },
      data: { approved: true, documentStatus: "APPROVED" },
    });
    
    // create notification
    try {
      await (prisma as any).notification.create({
        data: {
          userId: id,
          type: "APPROVED",
          title: "¡Aprobado!",
          message: "Tu cuenta ha sido aprobada. Ya puedes operar como conductor.",
        },
      });
    } catch (notifErr) {
      console.error("notification create error", notifErr);
    }
    
    res.json({ success: true, user });
  } catch (err) {
    console.error("approve error", err);
    res.status(500).json({ error: "failed" });
  }
});

// reject driver documents
app.post("/users/:id/reject-documents", authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!reason) {
    return res.status(400).json({ error: "rejection reason required" });
  }
  
  try {
    const user = await (prisma.user as any).update({
      where: { id },
      data: { documentStatus: "REJECTED", rejectionReason: reason },
    });
    
    // create notification
    try {
      await (prisma as any).notification.create({
        data: {
          userId: id,
          type: "DOCUMENT_REJECTED",
          title: "Documentos Rechazados",
          message: `Tus documentos fueron rechazados. Motivo: ${reason}. Por favor, sube de nuevo.`,
        },
      });
    } catch (notifErr) {
      console.error("notification create error", notifErr);
    }
    
    res.json({ success: true, user });
  } catch (err) {
    console.error("reject documents error", err);
    res.status(500).json({ error: "failed" });
  }
});

// update user profile
app.put("/users/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = (req.user as any)?.id;
  
  // Only allow user to update their own profile or admin updating anyone
  if (userId !== id && (req.user as any)?.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  
  try {
    const { name, phone, licenseType, licenseNumber } = req.body;
    const updateData: any = {};
    
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (licenseType) updateData.licenseType = licenseType;
    if (licenseNumber) updateData.licenseNumber = licenseNumber;
    
    const user = await (prisma.user as any).update({
      where: { id },
      data: updateData,
    });
    
    const { password: _pw, ...safe } = user;
    res.json(safe);
  } catch (err) {
    console.error("update user error", err);
    res.status(500).json({ error: "failed" });
  }
});

// get user document status
app.get("/users/:id/documents", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = (req.user as any)?.id;
  
  // Only allow user to view their own docs or admin viewing anyone
  if (userId !== id && (req.user as any)?.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id },
    }) as any;
    
    if (!user) return res.status(404).json({ error: "not_found" });
    
    res.json(user);
  } catch (err) {
    console.error("get documents error", err);
    res.status(500).json({ error: "failed" });
  }
});

// get user notifications
app.get("/notifications", authMiddleware, async (req, res) => {
  const userId = (req.user as any)?.id;
  
  try {
    const notifications = await (prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    
    res.json(notifications);
  } catch (err) {
    console.error("get notifications error", err);
    res.status(500).json({ error: "failed" });
  }
});

// mark notification as read
app.post("/notifications/:id/read", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = (req.user as any)?.id;
  
  try {
    const notification = await (prisma as any).notification.findUnique({
      where: { id },
    });
    
    if (!notification || notification.userId !== userId) {
      return res.status(403).json({ error: "forbidden" });
    }
    
    const updated = await (prisma as any).notification.update({
      where: { id },
      data: { read: true },
    });
    
    res.json(updated);
  } catch (err) {
    console.error("mark notification read error", err);
    res.status(500).json({ error: "failed" });
  }
});

// get ride history
app.get("/me/rides", authMiddleware, async (req, res) => {
  const userId = (req.user as any)?.id;
  const userRole = (req.user as any)?.role;
  
  try {
    const rides = await (prisma as any).ride.findMany({
      where:
        userRole === "DRIVER"
          ? { driverId: userId }
          : { passengerId: userId },
      include: {
        passenger: { select: { id: true, name: true, phone: true } },
        driver: { select: { id: true, name: true, phone: true } },
        vehicle: true,
      },
      orderBy: { createdAt: "desc" },
    });
    
    res.json(rides);
  } catch (err) {
    console.error("get rides error", err);
    res.status(500).json({ error: "failed" });
  }
});

// ---------------------
// Helpers
// ---------------------
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
  if (ride.state === RideState.PENDIENTE || ride.state === RideState.CANCELADO)
    return false;
  if (role === "PASSENGER" && ride.passengerId !== userId) return false;
  if (role === "DRIVER" && ride.driverId !== userId) return false;
  return true;
}

// ---------------------
// Drivers namespace
// ---------------------
drivers.on("connection", (socket) => {
  console.log("Driver connected:", socket.id);

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

  // enviar rides pendientes al driver que se conecta
  (async () => {
    try {
      const pending = await prisma.ride.findMany({
        where: { state: RideState.PENDIENTE },
        include: { passenger: true },
      });
      console.log(
        `Enviando ${pending.length} solicitudes pendientes al driver ${socket.id}`,
      );
      pending.forEach((r: Awaited<typeof pending>[number]) => {
        socket.emit("driver:nearby_request", {
          rideId: r.id,
          passengerId: r.passengerId,



          passengerName: r.passenger?.name || "Pasajero",
          origin: { lat: r.originLat, lng: r.originLng },
          destination: { lat: r.destLat, lng: r.destLng },
          estimatedFare: r.estimatedFare,
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
      const ride = await prisma.ride.findUnique({ where: { id: data.rideId } });
      if (!ride) return;

      // Ensure referenced driver exists (create minimal record if missing)
      if (data.driverId) {
        const d = await prisma.user.findUnique({
          where: { id: data.driverId },
        });
        if (!d) {
          await prisma.user.create({
            data: {
              id: data.driverId,
              name: "",
              email: `${data.driverId}@example.local`,
              password: "",
              role: "DRIVER",
            },
          });
        }
      }

      // Ensure referenced vehicle exists and is linked to driver if provided
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

      console.log(`Ride ${updated.id} assigned to driver ${data.driverId}`);
      console.log(`Emitting to room: passenger:${updated.passengerId}`);

      // Emit to passenger's room on passengers namespace
      passengers
        .to(`passenger:${updated.passengerId}`)
        .emit("ride:assigned", updated);

      // Emit status change to all
      io.emit("ride:status_changed", {
        rideId: updated.id,
        newState: updated.state,
      });
    },
  );

  socket.on("driver:start_ride", async (rideId: string) => {
    const updated = await updateRideState(rideId, RideState.EN_CURSO);
    io.emit("ride:status_changed", { rideId, newState: updated.state });
  });

  socket.on(
    "driver:end_ride",
    async (
      data: string | { rideId: string; finalFare?: number; state?: RideState },
    ) => {
      // Soporte para backward compatibility (si solo se envía string)
      const rideId = typeof data === "string" ? data : data.rideId;
      const finalFare = typeof data === "object" ? data.finalFare : undefined;
      const isCancelled =
        typeof data === "object" && data.state === RideState.CANCELADO;

      // Si se envía un state CANCELADO, respetarlo. Si no, es FINALIZADO.
      const newState = isCancelled ? RideState.CANCELADO : RideState.FINALIZADO;

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
      // Emitir a ambos namespaces para asegurar que llegue
      passengers.emit("ride:status_changed", payload);
      drivers.emit("ride:status_changed", payload);
      // Y por si acaso al root
      io.emit("ride:status_changed", payload);
    },
  );

  socket.on("driver:confirm_payment", async (data: { rideId: string }) => {
    // Broadcast payment confirmed
    io.emit("ride:payment_confirmed", { rideId: data.rideId });
    passengers.emit("ride:payment_confirmed", { rideId: data.rideId });
  });
});

// ---------------------
// Passengers namespace
// ---------------------
passengers.on("connection", (socket) => {
  console.log("Passenger connected:", socket.id);

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
    console.log("passenger:request_ride received:", data);
    const ride = await createRide({
      passengerId: data.passengerId,
      origin: data.origin,
      destination: data.destination,
      estimatedFare: data.estimatedFare ?? 0,
    });
    console.log("ride created:", ride.id);

    // TODO: En producción, calcular distancia y solo notificar a drivers dentro de 4km
    // Por ahora, notificar a todos los drivers conectados (demo/testing)
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
    console.log("Solicitud broadcast a todos los drivers");

    socket.join(`passenger:${ride.passengerId}`);
    socket.emit("ride:created", ride);
  });

  socket.on("passenger:cancel_ride", async (cancelPayload: string | { rideId: string; reason?: string }) => {
    const rideId = typeof cancelPayload === "string" ? cancelPayload : cancelPayload?.rideId;
    const reason = typeof cancelPayload === "string" ? undefined : cancelPayload?.reason;
    if (!rideId) return;
    console.log("passenger:cancel_ride:", { rideId, reason });
    const updated = await updateRideState(rideId, RideState.CANCELADO);
    console.log("ride cancelled:", updated.id, updated.state);
    const statusPayload = { rideId, newState: updated.state };
    passengers.emit("ride:status_changed", statusPayload);
    drivers.emit("ride:status_changed", statusPayload);
  });
});

// ---------------------
// Server
// ---------------------
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

httpServer.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

console.log(`Attempting to listen on port ${PORT}...`);
httpServer.listen(PORT, HOST, () => {
  console.log(
    `API + Socket.IO + Prisma (rides/users/vehicles) - http://${HOST}:${PORT}`,
  );
  console.log("Server is now running and accepting connections");
});
console.log("After httpServer.listen() call");
