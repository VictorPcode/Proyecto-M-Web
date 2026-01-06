// apps/web/pages/index.tsx
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GeoLocation } from "@movi/types";
import { Button } from 'ui';
 
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false); // evita render SSR
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
          `Connected: ${socketRef.current?.id}`,
        ]);
      });

      socketRef.current.on("ride:tracking", (loc: GeoLocation) => {
        // Siempre convertir a string
        setMessages((m) => [
          ...m,
          `📍 Tracking: lat=${loc.lat}, lng=${loc.lng}`,
        ]);
      });

      // Socket namespace pasajeros
      passengerRef.current = io(`${API_URL}/passengers`);

      passengerRef.current.on("ride:created", (ride) => {
        setMessages((m) => [
          ...m,
          `🚀 Ride created: ${ride.id ?? JSON.stringify(ride)}`,
        ]);
      });

      passengerRef.current.on("ride:assigned", (ride) => {
        // Convertir a string antes de poner en messages
        const rideString =
          typeof ride === "string"
            ? ride
            : JSON.stringify(ride, null, 2);
        setMessages((m) => [...m, `🚖 Ride assigned: ${rideString}`]);
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
    <div style={{ padding: 20, maxWidth: 600, margin: "0 auto" }}>
      <h1>MOVI</h1>
      <Button onClick={requestRide}>Request Ride (demo)</Button>

      <ul style={{ marginTop: 20 }}>
        {messages.map((m, i) => (
          <li
            key={i}
            style={{
              backgroundColor: "#f3f3f3",
              padding: "10px",
              marginBottom: "8px",
              borderRadius: "6px",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
