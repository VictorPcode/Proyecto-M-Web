"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRide = createRide;
// apps/api/src/index.ts
console.log('[INIT] Cargando dotenv...');
require("dotenv/config");
console.log('[INIT] Cargando express...');
const express_1 = __importDefault(require("express"));
console.log('[INIT] Cargando http...');
const http_1 = require("http");
console.log('[INIT] Cargando socket.io...');
const socket_io_1 = require("socket.io");
console.log('[INIT] Cargando cors...');
const cors_1 = __importDefault(require("cors"));
console.log('[INIT] Cargando prisma...');
const prisma_1 = __importDefault(require("./prisma")); // Usamos la instancia compartida
console.log('[INIT] Cargando types...');
console.log('[INIT] Cargando bcrypt...');
const bcryptjs_1 = __importDefault(require("bcryptjs"));
console.log('[INIT] Cargando jwt...');
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
console.log('[INIT] Todos los módulos cargados');
console.log('[INIT] Creando app Express...');
// Enum temporal mientras no se regenere el cliente Prisma
var RideState;
(function (RideState) {
    RideState["PENDIENTE"] = "PENDIENTE";
    RideState["ASIGNADO"] = "ASIGNADO";
    RideState["EN_CURSO"] = "EN_CURSO";
    RideState["FINALIZADO"] = "FINALIZADO";
    RideState["CANCELADO"] = "CANCELADO";
})(RideState || (RideState = {}));
const app = (0, express_1.default)();
console.log('[INIT] Configurando middleware...');
app.use((0, cors_1.default)());
app.use(express_1.default.json());
console.log('[INIT] Middleware configurado');
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token)
        return res.status(401).json({ error: "missing_token" });
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = { id: payload.sub, role: payload.role };
        next();
    }
    catch (e) {
        return res.status(401).json({ error: "invalid_token" });
    }
}
app.get("/health", (req, res) => res.json({ ok: true }));
// Endpoint para geocoding con Google APIs (evita CORS desde frontend)
app.get("/geocode", async (req, res) => {
    const { query, limit = 10 } = req.query;
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query parameter required' });
    }
    const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
    const googleGeocodingKey = process.env.GOOGLE_GEOCODING_API_KEY;
    try {
        const results = [];
        // Google Places API
        if (googlePlacesKey) {
            const placesRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query + ' Paraguay')}&language=es&key=${googlePlacesKey}`);
            const placesData = await placesRes.json();
            if (placesData.results) {
                placesData.results.forEach((place) => {
                    const placeName = place.name || '';
                    // Filtrar códigos numéricos y Plus Codes
                    if (placeName.match(/^\d{5,}$/) || placeName.match(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}$/)) {
                        return;
                    }
                    const locality = place.formatted_address?.split(',')[1]?.trim() || '';
                    results.push({
                        id: `gp-${place.place_id}`,
                        text: placeName,
                        place_name: locality ? `${placeName} - ${locality}` : placeName,
                        center: [place.geometry.location.lng, place.geometry.location.lat],
                        type: 'Feature'
                    });
                });
            }
        }
        // Google Geocoding API (si no hay suficientes resultados)
        if (results.length < Number(limit) && googleGeocodingKey) {
            const geocodeRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query + ', Paraguay')}&language=es&key=${googleGeocodingKey}`);
            const geocodeData = await geocodeRes.json();
            if (geocodeData.results) {
                geocodeData.results.slice(0, Number(limit) - results.length).forEach((result) => {
                    const components = result.address_components || [];
                    const poi = components.find((c) => c.types.includes('point_of_interest'))?.long_name;
                    const establishment = components.find((c) => c.types.includes('establishment'))?.long_name;
                    const route = components.find((c) => c.types.includes('route'))?.long_name;
                    const locality = components.find((c) => c.types.includes('locality'))?.long_name;
                    let displayName = establishment || poi || route || locality || result.formatted_address.split(',')[0];
                    // Filtrar códigos numéricos
                    if (displayName.match(/^\d{5,}$/)) {
                        displayName = locality || result.formatted_address.split(',')[0];
                    }
                    results.push({
                        id: `gc-${result.place_id}`,
                        text: displayName,
                        place_name: locality ? `${displayName}, ${locality}` : displayName,
                        center: [result.geometry.location.lng, result.geometry.location.lat],
                        type: 'Feature'
                    });
                });
            }
        }
        res.json({ features: results.slice(0, Number(limit)) });
    }
    catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: 'geocoding_failed' });
    }
});
console.log('[INIT] Creando HTTP Server...');
const httpServer = (0, http_1.createServer)(app);
console.log('[INIT] Creando Socket.IO Server...');
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*" },
});
console.log('[INIT] Servidor Socket.IO creado');
// Namespaces
const drivers = io.of("/drivers");
const passengers = io.of("/passengers");
function socketAuth(namespace) {
    namespace.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, "");
            if (!token)
                return next(new Error("missing_token"));
            const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            socket.data.userId = payload.sub;
            socket.data.role = payload.role;
            next();
        }
        catch (e) {
            next(new Error("invalid_token"));
        }
    });
}
socketAuth(passengers);
socketAuth(drivers);
// Añadir endpoint para listar rides (antes de httpServer.listen)
app.get("/rides", authMiddleware, async (req, res) => {
    const state = req.query.state;
    const where = state ? { state: state } : {};
    const rides = await prisma_1.default.ride.findMany({
        where,
        include: { passenger: true, driver: true, vehicle: true },
        orderBy: { createdAt: "desc" },
    });
    res.json(rides);
});
// Crear usuario (registro simple)
app.post("/users", async (req, res) => {
    try {
        const { id, name, email, password, role } = req.body;
        console.log("Intento de registro:", { email, name, role });
        if (!email || !password) {
            console.log("Faltan email o password");
            return res.status(400).json({ error: "missing email/password" });
        }
        if (!name) {
            console.log("Falta nombre");
            return res.status(400).json({ error: "missing name" });
        }
        const exists = await prisma_1.default.user.findUnique({ where: { email } });
        if (exists) {
            console.log("Email ya existe:", email);
            return res.status(409).json({ error: "email_exists" });
        }
        const hashed = bcryptjs_1.default.hashSync(String(password), 10);
        const user = await prisma_1.default.user.create({
            data: {
                id: id ?? undefined,
                name: name,
                email,
                password: hashed,
                role: role ?? "PASSENGER",
            },
        });
        console.log("Usuario creado exitosamente:", { id: user.id, email: user.email, name: user.name });
        const { password: _pw, ...safe } = user;
        res.json(safe);
    }
    catch (err) {
        console.error("Error creating user:", err);
        res.status(500).json({ error: "failed" });
    }
});
// Simple login: find user by email
app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: "missing email/password" });
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user)
            return res.status(401).json({ error: "not_found" });
        const ok = bcryptjs_1.default.compareSync(String(password), String(user.password ?? ""));
        if (!ok)
            return res.status(401).json({ error: "invalid_credentials" });
        const secret = process.env.JWT_SECRET || "devsecret";
        const token = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role }, secret, { expiresIn: "7d" });
        const { password: _pw, ...safe } = user;
        res.json({ token, user: safe });
    }
    catch (err) {
        console.error("login error", err);
        res.status(500).json({ error: "failed" });
    }
});
// ---------------------
// Helpers
// ---------------------
function createRide({ passengerId, origin, destination, estimatedFare, }) {
    return prisma_1.default.ride.create({
        data: {
            passenger: {
                connectOrCreate: {
                    where: { id: passengerId },
                    create: {
                        id: passengerId,
                        name: "",
                        email: "",
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
    });
}
async function updateRideState(rideId, newState) {
    return prisma_1.default.ride.update({
        where: { id: rideId },
        data: { state: newState },
        include: { passenger: true, driver: true, vehicle: true },
    });
}
// ---------------------
// Drivers namespace
// ---------------------
drivers.on("connection", (socket) => {
    console.log("Driver connected:", socket.id);
    // enviar rides pendientes al driver que se conecta
    (async () => {
        try {
            const pending = await prisma_1.default.ride.findMany({
                where: { state: RideState.PENDIENTE },
            });
            console.log(`Enviando ${pending.length} solicitudes pendientes al driver ${socket.id}`);
            pending.forEach((r) => {
                socket.emit("driver:nearby_request", {
                    rideId: r.id,
                    passengerId: r.passengerId,
                    origin: { lat: r.originLat, lng: r.originLng },
                    destination: { lat: r.destLat, lng: r.destLng },
                    estimatedFare: r.estimatedFare,
                });
            });
        }
        catch (err) {
            console.error("Error sending pending rides to driver:", err);
        }
    })();
    socket.on("driver:location", (loc) => {
        io.emit("ride:tracking", loc);
    });
    socket.on("driver:accept_ride", async (data) => {
        const ride = await prisma_1.default.ride.findUnique({ where: { id: data.rideId } });
        if (!ride)
            return;
        // Ensure referenced driver exists (create minimal record if missing)
        if (data.driverId) {
            const d = await prisma_1.default.user.findUnique({ where: { id: data.driverId } });
            if (!d) {
                await prisma_1.default.user.create({
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
            const v = await prisma_1.default.vehicle.findUnique({ where: { id: data.vehicleId } });
            if (!v) {
                await prisma_1.default.vehicle.create({
                    data: {
                        id: data.vehicleId,
                        placa: data.vehicleId,
                        estado: "DISPONIBLE",
                        driverId: data.driverId ?? null,
                    },
                });
            }
        }
        const updated = await prisma_1.default.ride.update({
            where: { id: data.rideId },
            data: {
                state: RideState.ASIGNADO,
                driver: data.driverId ? { connect: { id: data.driverId } } : undefined,
                vehicle: data.vehicleId ? { connect: { id: data.vehicleId } } : undefined,
            },
            include: { passenger: true },
        });
        io.to(`passenger:${updated.passengerId}`).emit("ride:assigned", updated);
        io.emit("ride:status_changed", { rideId: updated.id, newState: updated.state });
    });
    socket.on("driver:start_ride", async (rideId) => {
        const updated = await updateRideState(rideId, RideState.EN_CURSO);
        io.emit("ride:status_changed", { rideId, newState: updated.state });
    });
    socket.on("driver:end_ride", async (rideId) => {
        const updated = await updateRideState(rideId, RideState.FINALIZADO);
        io.emit("ride:status_changed", { rideId, newState: updated.state });
    });
});
// ---------------------
// Passengers namespace
// ---------------------
passengers.on("connection", (socket) => {
    console.log("Passenger connected:", socket.id);
    socket.on("passenger:request_ride", async (data) => {
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
            origin: { lat: ride.originLat, lng: ride.originLng },
            destination: { lat: ride.destLat, lng: ride.destLng },
            estimatedFare: ride.estimatedFare,
        });
        console.log("Solicitud broadcast a todos los drivers");
        socket.join(`passenger:${ride.passengerId}`);
        socket.emit("ride:created", ride);
    });
    socket.on("passenger:cancel_ride", async (rideId) => {
        console.log("passenger:cancel_ride:", rideId);
        const updated = await updateRideState(rideId, RideState.CANCELADO);
        console.log("ride cancelled:", updated.id, updated.state);
        io.emit("ride:status_changed", { rideId, newState: updated.state });
    });
});
// ---------------------
// Server
// ---------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
console.log('[INIT] Iniciando servidor HTTP en puerto', PORT);
httpServer.listen(PORT, () => {
    console.log(`✅ API + Socket.IO + Prisma (rides/users/vehicles) → http://localhost:${PORT}`);
    console.log('[INIT] Servidor escuchando correctamente');
}).on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
});
