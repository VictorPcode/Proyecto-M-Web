"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRide = createRide;
// apps/api/src/index.ts
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const prisma_1 = __importDefault(require("./prisma")); // Usamos la instancia compartida
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
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (req, res) => res.json({ ok: true }));
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*" },
});
// Namespaces
const drivers = io.of("/drivers");
const passengers = io.of("/passengers");
// Añadir endpoint para listar rides (antes de httpServer.listen)
app.get("/rides", async (req, res) => {
    const state = req.query.state;
    const where = state ? { state: state } : {};
    const rides = await prisma_1.default.ride.findMany({
        where,
        include: { passenger: true, driver: true, vehicle: true },
        orderBy: { createdAt: "desc" },
    });
    res.json(rides);
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
            pending.forEach((r) => {
                socket.emit("driver:nearby_request", {
                    rideId: r.id,
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
        const updated = await prisma_1.default.ride.update({
            where: { id: data.rideId },
            data: {
                state: RideState.ASIGNADO,
                driverId: data.driverId,
                vehicleId: data.vehicleId,
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
        drivers.emit("driver:nearby_request", {
            rideId: ride.id,
            origin: { lat: ride.originLat, lng: ride.originLng },
        });
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
httpServer.listen(PORT, () => {
    console.log(`API + Socket.IO + Prisma (rides/users/vehicles) → http://localhost:${PORT}`);
});
