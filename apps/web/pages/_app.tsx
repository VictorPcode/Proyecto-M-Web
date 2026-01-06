// apps/web/pages/index.tsx
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GeoLocation } from "@movi/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false); // Evita render en SSR
  const socketRef = useRef<Socket | null>(null);
  const passengerRef = useRef<Socket | null>(null);

  // Marca que estamos en cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let isMounted = true;

    (async () => {
      const { io } = await import("socket.io-client");

      if (!isMounted) return;

      // Socket global
      socketRef.current = io(API_URL);

      socketRef.current.on("connect", () => {
        setMessages((m) => [
          ...m,
          `✅ Connected: ${socketRef.current?.id ?? "unknown"}`,
        ]);
      });

      socketRef.current.on("ride:tracking", (loc: GeoLocation) => {
        // Siempre a string
        setMessages((m) => [
          ...m,
          `📍 Tracking: lat=${loc.lat}, lng=${loc.lng}`,
        ]);
      });

      // Socket namespace pasajeros
      passengerRef.current = io(`${API_URL}/passengers`);

      passengerRef.current.on("ride:created", (ride) => {
        // Convertimos a string
        const rideInfo =
          ride && ride.id ? `Ride ID: ${JSON.stringify(ride.id)}` : JSON.stringify(ride);
        setMessages((m) => [...m, `🚀 Ride created: ${rideInfo}`]);
      });

      passengerRef.current.on("ride:assigned", (ride) => {
        // Convertimos todo a string para evitar errores
        setMessages((m) => [
          ...m,
          `🚖 Ride assigned: ${JSON.stringify(ride, null, 2)}`,
        ]);
      });
    })();

    return () => {
      isMounted = false;
      socketRef.current?.disconnect();
      passengerRef.current?.disconnect();
    };
  }, [mounted]);

  const requestRide = () => {
    passengerRef.current?.emit("passenger:request_ride", {
      passengerId: "demo-passenger",
      origin: { lat: -25.3, lng: -57.6 },
      destination: { lat: -25.28, lng: -57.63 },
    });
  };

  if (!mounted) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">MOVI</h1>

      <button
        onClick={requestRide}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mb-6"
      >
        Request Ride (demo)
      </button>

      <ul className="space-y-2">
        {messages.map((m, i) => (
          <li
            key={i}
            className="bg-gray-100 p-3 rounded shadow-sm break-words"
          >
            {/* Preformatted para mantener JSON legible */}
            <pre className="m-0">{m}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
