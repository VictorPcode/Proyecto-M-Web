import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import prisma from "./prisma"; // Usamos la instancia compartida
import { GeoLocation } from "@movi/types"; // útil para tipado compartido frontend/backend

// Enum temporal mientras no se regenere el cliente Prisma
enum RideState {
  PENDIENTE = "PENDIENTE",
  ASIGNADO = "ASIGNADO",
  EN_CURSO = "EN_CURSO",
  FINALIZADO = "FINALIZADO",
  CANCELADO = "CANCELADO",
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Namespaces
const drivers = io.of("/drivers");
const passengers = io.of("/passengers");

// ---------------------
// Helpers
// ---------------------
export function createRide({
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

async function updateRideState(rideId: string, newState: RideState) {
  return prisma.ride.update({
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

  socket.on("driver:location", (loc: GeoLocation) => {
    io.emit("ride:tracking", loc);
  });

  socket.on(
    "driver:accept_ride",
    async (data: { rideId: string; driverId: string; vehicleId?: string }) => {
      const ride = await prisma.ride.findUnique({ where: { id: data.rideId } });
      if (!ride) return;

      const updated = await prisma.ride.update({
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
    }
  );

  socket.on("driver:start_ride", async (rideId: string) => {
    const updated = await updateRideState(rideId, RideState.EN_CURSO);
    io.emit("ride:status_changed", { rideId, newState: updated.state });
  });

  socket.on("driver:end_ride", async (rideId: string) => {
    const updated = await updateRideState(rideId, RideState.FINALIZADO);
    io.emit("ride:status_changed", { rideId, newState: updated.state });
  });
});

// ---------------------
// Passengers namespace
// ---------------------
passengers.on("connection", (socket) => {
  console.log("Passenger connected:", socket.id);

  socket.on("passenger:request_ride", async (data: any) => {
    const ride = await createRide({
      passengerId: data.passengerId,
      origin: data.origin,
      destination: data.destination,
      estimatedFare: data.estimatedFare ?? 0,
    });

    drivers.emit("driver:nearby_request", {
      rideId: ride.id,
      origin: { lat: ride.originLat, lng: ride.originLng },
    });

    socket.join(`passenger:${ride.passengerId}`);
    socket.emit("ride:created", ride);
  });

  socket.on("passenger:cancel_ride", async (rideId: string) => {
    const updated = await updateRideState(rideId, RideState.CANCELADO);
    io.emit("ride:status_changed", { rideId, newState: updated.state });
  });
});

// ---------------------
// Server
// ---------------------
httpServer.listen(4000, () => {
  console.log("API + Socket.IO + Prisma (rides/users/vehicles) → http://localhost:4000");
});
