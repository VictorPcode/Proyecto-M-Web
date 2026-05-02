import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Ride {
  id: string;
  state: string;
  driverId?: string;
  driver?: { name: string; phone?: string };
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  estimatedFare: number;
  finalFare?: number;
  createdAt: string;
}

export default function MisViajesPasajero() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchRides();
  }, []);

  const fetchRides = async () => {
    try {
      const token = localStorage.getItem("movi:token");
      const res = await fetch(`${API_URL}/me/rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRides(data);
    } catch (err) {
      console.error(err);
      alert("Error al cargar viajes");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#666" }}>
        Cargando viajes...
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: "600px",
      margin: "0 auto",
      padding: "24px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: "24px",
        gap: "12px",
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "20px",
          }}
        >
          ←
        </button>
        <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
          Mis Viajes
        </h1>
      </div>

      {rides.length === 0 ? (
        <div style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "#999",
        }}>
          No tienes viajes aún. ¡Solicita tu primer viaje!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {rides.map((ride) => (
            <RideCard key={ride.id} ride={ride} />
          ))}
        </div>
      )}
    </div>
  );
}

function RideCard({ ride }: { ride: Ride }) {
  const getStateColor = (state: string) => {
    switch (state) {
      case "FINALIZADO":
        return { bg: "#d1fae5", color: "#065f46", icon: "OK" };
      case "CANCELADO":
        return { bg: "#fee2e2", color: "#991b1b", icon: "NO" };
      case "EN_CURSO":
        return { bg: "#dbeafe", color: "#0c4a6e", icon: "EN" };
      case "ASIGNADO":
        return { bg: "#fef3c7", color: "#78350f", icon: "AS" };
      default:
        return { bg: "#f3f4f6", color: "#374151", icon: "--" };
    }
  };

  const state = getStateColor(ride.state);
  const date = new Date(ride.createdAt).toLocaleDateString("es-PY");

  return (
    <div style={{
      padding: "12px",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "start",
        marginBottom: "8px",
      }}>
        <div>
          <div style={{ fontSize: "13px", color: "#999" }}>
            {date}
          </div>
          {ride.driver && (
            <div style={{ fontSize: "13px", fontWeight: "500", marginTop: "4px" }}>
              Conductor: {ride.driver.name}
            </div>
          )}
        </div>
        <span style={{
          fontSize: "11px",
          padding: "4px 8px",
          background: state.bg,
          color: state.color,
          borderRadius: "4px",
          fontWeight: "600",
        }}>
          {state.icon} {ride.state}
        </span>
      </div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ fontSize: "13px", color: "#666" }}>
          ₲ {ride.estimatedFare.toFixed(0)}
        </div>
        {ride.finalFare && (
          <div style={{ fontSize: "12px", color: "#999" }}>
            Pagado: ₲ {ride.finalFare.toFixed(0)}
          </div>
        )}
      </div>
    </div>
  );
}
