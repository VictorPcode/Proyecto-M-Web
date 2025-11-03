import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { GeoLocation } from "@movi/types";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

// simple in-memory rides store (demo)
type Ride = {
  id: string;
  passengerId: string;
  origin: GeoLocation;
  destination: GeoLocation;
  state: string;
};

const rides = new Map<string, Ride>();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// namespaces
const drivers = io.of("/drivers");
const passengers = io.of("/passengers");

drivers.on("connection", socket => {
  console.log("Driver connected", socket.id);
  socket.on("driver:location", (loc: GeoLocation) => {
    // broadcast to relevant ride room if any - demo: broadcast to all
    io.emit("ride:tracking", loc);
  });

  socket.on("driver:accept_ride", (data: { rideId: string; driverId: string }) => {
    const ride = rides.get(data.rideId);
    if (ride) {
      ride.state = "asignado";
      io.to(`passenger:${ride.passengerId}`).emit("ride:assigned", { ride });
      io.emit("ride:status_changed", { rideId: ride.id, newState: "asignado" });
    }
  });
});

passengers.on("connection", socket => {
  console.log("Passenger connected", socket.id);
  socket.on("passenger:request_ride", (data: any) => {
    const id = Date.now().toString();
    const ride = {
      id,
      passengerId: data.passengerId || "demo-passenger",
      origin: data.origin,
      destination: data.destination,
      state: "pendiente"
    };
    rides.set(id, ride);
    // notify drivers namespace of new request
    drivers.emit("driver:nearby_request", { rideId: id, origin: data.origin });
    // join passenger to room
    socket.join(`passenger:${ride.passengerId}`);
    socket.emit("ride:created", { ride });
  });
});

httpServer.listen(4000, () => console.log("API + Socket.IO listening on http://localhost:4000"));
