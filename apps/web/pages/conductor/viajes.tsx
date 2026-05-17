import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Ride {
  id: string;
  state: string;
  passengerName?: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  estimatedFare: number;
  finalFare?: number;
  officialFare?: number;
  collectedFare?: number;
  adminFee?: number;
  driverEarnings?: number;
  underchargeAmount?: number;
  distanceKm?: number;
  createdAt: string;
}

const formatGuarani = (value: number) =>
  new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(value);

export default function MisViajes() {
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
          Historial de Viajes
        </h1>
      </div>

      {rides.length === 0 ? (
        <div style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "#999",
        }}>
          No tienes viajes aún.
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
        return { bg: "#d1fae5", color: "#065f46", icon: "✓" };
      case "CANCELADO":
        return { bg: "#fee2e2", color: "#991b1b", icon: "✗" };
      case "EN_CURSO":
        return { bg: "#dbeafe", color: "#0c4a6e", icon: "➤" };
      default:
        return { bg: "#f3f4f6", color: "#374151", icon: "○" };
    }
  };

  const state = getStateColor(ride.state);
  const date = new Date(ride.createdAt).toLocaleDateString("es-PY");

  return (
    <div style={{
      padding: "12px",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      cursor: "pointer",
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
          <div style={{ fontSize: "14px", fontWeight: 700, marginTop: 4 }}>
            {ride.passengerName || "Pasajero"}
          </div>
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
        display: "grid",
        gap: "6px",
        fontSize: "13px",
        color: "#555",
      }}>
        <div>
          Distancia: {ride.distanceKm !== undefined ? `${ride.distanceKm.toFixed(2)} km` : "N/A"}
        </div>
        <div>
          Origen: {ride.originLat.toFixed(5)}, {ride.originLng.toFixed(5)}
        </div>
        <div>
          Destino: {ride.destLat.toFixed(5)}, {ride.destLng.toFixed(5)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <strong>Total viaje: {formatGuarani(ride.officialFare ?? ride.estimatedFare ?? 0)}</strong>
          <strong>Comision 5%: {formatGuarani(ride.adminFee || 0)}</strong>
          <span>Cobrado declarado: {formatGuarani(ride.collectedFare ?? ride.finalFare ?? 0)}</span>
          <span>Diferencia: {formatGuarani(ride.underchargeAmount || 0)}</span>
          <span style={{ gridColumn: "1 / -1", fontWeight: 700, color: "#065f46" }}>
            Ganancia neta: {formatGuarani(ride.driverEarnings || 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
